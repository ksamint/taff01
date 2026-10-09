import { execFile } from "node:child_process";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  activity,
  connectDatabase,
  members,
  session,
  smsAuthChallenges,
  smsAuthLimits,
  user,
  verification,
} from "@taff/db";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore } from "./index";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  console.warn(
    "SKIP SMS PostgreSQL integration: TEST_DATABASE_URL not configured",
  );
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("SMS tests require a separate _test database");
const authSecret = `sms-integration-${randomUUID()}`;
const options = {
  databaseUrl: databaseUrl ?? "",
  authUrl: "https://sms.test",
  authSecret,
  tokenPepper: `sms-pepper-${randomUUID()}`,
};
const phone = () =>
  `+86138${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
const hash = (domain: string, value: string) =>
  createHmac("sha256", authSecret).update(`${domain}\0${value}`).digest("hex");
describe.skipIf(!databaseUrl)(
  "SMS authentication PostgreSQL invariants",
  () => {
    let core: Core;
    let connection: ReturnType<typeof connectDatabase>;
    const delivered = new Map<string, string>();
    let providerFails = false;
    let sends = 0;
    const events: {
      action: string;
      resourceId: string;
      workspaceId: string | null;
      userId: string | null;
    }[] = [];
    const call = (
      path: "send-otp" | "verify",
      body: unknown,
      peer = randomUUID(),
    ) =>
      core.handlePhoneAuth(
        new Request(`https://sms.test/api/auth/phone-number/${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://sms.test",
            "X-Forwarded-For": "attacker-supplied",
            "X-Taff-Sms-Peer": "attacker-supplied",
          },
          body: JSON.stringify(body),
        }),
        peer,
      );
    const ageChallenge = async (
      number: string,
      values: Partial<typeof smsAuthChallenges.$inferInsert>,
    ) =>
      connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id','system:test',true)`,
        );
        await tx
          .update(smsAuthChallenges)
          .set(values)
          .where(eq(smsAuthChallenges.phoneHash, hash("sms:phone", number)));
      });
    beforeAll(async () => {
      await migrateDatabase(options.databaseUrl);
      connection = connectDatabase(options.databaseUrl);
      core = createCore({
        ...options,
        sms: {
          sendOTP: async ({ phoneNumber, code }) => {
            sends++;
            if (providerFails) throw new Error("private provider diagnostic");
            delivered.set(phoneNumber, code);
          },
        },
      });
      await core.subscribeChanges((event) => {
        events.push(event);
      });
    }, 30_000);
    afterAll(async () => {
      await core?.close();
      await connection?.close();
    });
    it("keeps production base auth limits while persistent socket budgets reject spoofed visitors", async () => {
      const { stdout } = await promisify(execFile)(
        process.execPath,
        [
          "--import",
          fileURLToPath(
            new URL(
              "../../../node_modules/tsx/dist/loader.mjs",
              import.meta.url,
            ),
          ),
          fileURLToPath(
            new URL("./sms-production.fixture.ts", import.meta.url),
          ),
        ],
        { env: { ...process.env, NODE_ENV: "production" }, timeout: 30_000 },
      );
      expect(JSON.parse(stdout.trim())).toEqual({
        productionLimiter: true,
        acceptedSends: 10,
        invalidVerifications: 30,
        sharedPeerLimited: true,
      });
    }, 35_000);
    it("accepts one concurrent redemption, creates one user/workspace and sets a secure session cookie", async () => {
      const number = phone();
      expect((await call("send-otp", { phoneNumber: number })).status).toBe(
        200,
      );
      const code = delivered.get(number);
      expect(code).toMatch(/^\d{6}$/);
      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          call("verify", { phoneNumber: number, code }),
        ),
      );
      expect(responses.filter((r) => r.ok)).toHaveLength(1);
      expect(responses.filter((r) => r.status === 400)).toHaveLength(7);
      const success = responses.find((r) => r.ok);
      expect(success?.headers.get("Set-Cookie")).toContain("Secure");
      expect(success?.headers.get("Set-Cookie")).toContain("HttpOnly");
      const [person] = await connection.db
        .select()
        .from(user)
        .where(eq(user.phoneNumber, number));
      expect(person.phoneNumberVerified).toBe(true);
      expect(person.email).toMatch(/^[a-f0-9]{64}@phone\.taff\.invalid$/);
      expect(person.email).not.toContain(number.slice(3));
      expect(person.name).toBe("Taff");
      expect((await core.getMe(person.id)).workspaces).toHaveLength(1);
      expect(
        await connection.db
          .select()
          .from(members)
          .where(eq(members.userId, person.id)),
      ).toMatchObject([{ kind: "person", role: "admin" }]);
      expect(
        await connection.db
          .select()
          .from(session)
          .where(eq(session.userId, person.id)),
      ).toHaveLength(1);
      expect((await call("verify", { phoneNumber: number, code })).status).toBe(
        400,
      );
      const [challenge] = await connection.db
        .select()
        .from(smsAuthChallenges)
        .where(eq(smsAuthChallenges.phoneHash, hash("sms:phone", number)));
      expect(challenge).toMatchObject({ codeHash: null, ready: false });
      expect(
        await connection.db
          .select()
          .from(verification)
          .where(eq(verification.identifier, number)),
      ).toHaveLength(0);
      expect(JSON.stringify(await core.getMe(person.id))).not.toContain(number);
    });
    it("locks a code after three wrong attempts and rejects expired codes", async () => {
      const number = phone();
      await call("send-otp", { phoneNumber: number });
      const code = delivered.get(number);
      const wrong = code === "000000" ? "000001" : "000000";
      for (let i = 0; i < 3; i++)
        expect(
          (await call("verify", { phoneNumber: number, code: wrong })).status,
        ).toBe(400);
      expect((await call("verify", { phoneNumber: number, code })).status).toBe(
        400,
      );
      const [locked] = await connection.db
        .select()
        .from(smsAuthChallenges)
        .where(eq(smsAuthChallenges.phoneHash, hash("sms:phone", number)));
      expect(locked).toMatchObject({
        attempts: 3,
        codeHash: null,
        ready: false,
      });
      const expiredPhone = phone();
      await call("send-otp", { phoneNumber: expiredPhone });
      await ageChallenge(expiredPhone, { expiresAt: new Date(Date.now() - 1) });
      expect(
        (
          await call("verify", {
            phoneNumber: expiredPhone,
            code: delivered.get(expiredPhone),
          })
        ).status,
      ).toBe(400);
    });
    it("keeps existing email accounts separate and authenticates a returning phone user without duplicate workspaces", async () => {
      const emailAccount = await core.auth.api.signUpEmail({
        body: {
          name: "Existing email person",
          email: `${randomUUID()}@test.local`,
          password: `password-${randomUUID()}`,
        },
      });
      const number = phone();
      await call("send-otp", { phoneNumber: number });
      expect(
        (
          await call("verify", {
            phoneNumber: number,
            code: delivered.get(number),
          })
        ).status,
      ).toBe(200);
      const [person] = await connection.db
        .select()
        .from(user)
        .where(eq(user.phoneNumber, number));
      expect(person.id).not.toBe(emailAccount.user.id);
      await ageChallenge(number, {
        lastSentAt: new Date(Date.now() - 61_000),
      });
      await call("send-otp", { phoneNumber: number });
      expect(
        (
          await call("verify", {
            phoneNumber: number,
            code: delivered.get(number),
          })
        ).status,
      ).toBe(200);
      expect(
        await connection.db
          .select()
          .from(user)
          .where(eq(user.phoneNumber, number)),
      ).toHaveLength(1);
      expect((await core.getMe(person.id)).workspaces).toHaveLength(1);
      expect(
        await connection.db
          .select()
          .from(session)
          .where(eq(session.userId, person.id)),
      ).toHaveLength(2);
      const [original] = await connection.db
        .select()
        .from(user)
        .where(eq(user.id, emailAccount.user.id));
      expect(original.phoneNumber).toBeNull();
    });
    it("serializes concurrent sends and keeps failed/ambiguous delivery cooldowns", async () => {
      const number = phone();
      const before = sends;
      const results = await Promise.all([
        call("send-otp", { phoneNumber: number }),
        call("send-otp", { phoneNumber: number }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 429]);
      expect(sends - before).toBe(1);
      const failedPhone = phone();
      providerFails = true;
      try {
        expect(
          (await call("send-otp", { phoneNumber: failedPhone })).status,
        ).toBe(503);
      } finally {
        providerFails = false;
      }
      const [failed] = await connection.db
        .select()
        .from(smsAuthChallenges)
        .where(eq(smsAuthChallenges.phoneHash, hash("sms:phone", failedPhone)));
      expect(failed).toMatchObject({
        codeHash: null,
        ready: false,
        sendCount: 1,
      });
      expect(
        (await call("send-otp", { phoneNumber: failedPhone })).status,
      ).toBe(429);
    });
    it("enforces durable phone/hour and trusted-peer limits independently of spoofed headers", async () => {
      const number = phone();
      await call("send-otp", { phoneNumber: number });
      await ageChallenge(number, {
        lastSentAt: new Date(Date.now() - 61_000),
        sendCount: 5,
      });
      expect((await call("send-otp", { phoneNumber: number })).status).toBe(
        429,
      );
      const peer = randomUUID();
      const bucket = `send:peer:${hash("sms:peer", peer)}`;
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id','system:test',true)`,
        );
        await tx
          .insert(smsAuthLimits)
          .values({ bucket, count: 10, windowStartedAt: new Date() });
      });
      const limited = await call("send-otp", { phoneNumber: phone() }, peer);
      expect(limited.status).toBe(429);
      expect(limited.headers.get("Retry-After")).toMatch(/^\d+$/);
      // Missing challenges still consume a durable verification budget.
      const verifyPeer = randomUUID();
      const verifyBucket = `verify:peer:${hash("sms:peer", verifyPeer)}`;
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id','system:test',true)`,
        );
        await tx.insert(smsAuthLimits).values({
          bucket: verifyBucket,
          count: 30,
          windowStartedAt: new Date(),
        });
      });
      expect(
        (
          await call(
            "verify",
            { phoneNumber: phone(), code: "123456" },
            verifyPeer,
          )
        ).status,
      ).toBe(429);
    });
    it("emits only audited UUID routing metadata, never phones, codes or hashes", async () => {
      const number = phone();
      await call("send-otp", { phoneNumber: number });
      await call("verify", { phoneNumber: number, code: "999999" });
      const [challenge] = await connection.db
        .select()
        .from(smsAuthChallenges)
        .where(eq(smsAuthChallenges.phoneHash, hash("sms:phone", number)));
      const logs = await connection.db
        .select()
        .from(activity)
        .where(
          and(
            eq(activity.resourceId, challenge.id),
            eq(activity.actorId, "system:auth"),
          ),
        );
      expect(logs.length).toBeGreaterThanOrEqual(3);
      expect(logs.every((row) => JSON.stringify(row.details) === "{}")).toBe(
        true,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      const notifications = events.filter((e) => e.resourceId === challenge.id);
      expect(notifications.length).toBeGreaterThan(0);
      expect(
        notifications.every((e) => e.workspaceId === null && e.userId === null),
      ).toBe(true);
      expect(JSON.stringify(notifications)).not.toContain(number);
      expect(JSON.stringify(notifications)).not.toContain(challenge.phoneHash);
    });
  },
);
