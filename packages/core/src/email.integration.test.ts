import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  activity,
  connectDatabase,
  members,
  user,
  workspaceInvites,
} from "@taff/db";
import { type ChangeEvent, issuedWorkspaceInviteSchema } from "@taff/schemas";
import { createEmailVerificationToken } from "better-auth/api";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../../apps/api/src/app";
import { migrateDatabase } from "../../db/src/migrate";
import type { EmailMessage } from "./email";
import { emailResources } from "./email-messages";
import { type Core, createCore, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn(
    "SKIP invitation email PostgreSQL tests: TEST_DATABASE_URL required",
  );
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("Email tests require isolated _test database");
const authUrl = "http://localhost:3000";
const secret = `email-test-${randomUUID()}-longer-than-thirty-two`;
const pepper = `email-pepper-${randomUUID()}`;
const messages: EmailMessage[] = [];
const events: ChangeEvent[] = [];
let failed = false;
let attempts = 0;

describe.skipIf(!url)(
  "email ownership and invitations through real core/REST",
  () => {
    let core: Core;
    let connection: ReturnType<typeof connectDatabase>;
    let app: ReturnType<typeof createApp>;
    let admin: { id: string; email: string; cookie: string };
    let workspaceId: string;
    const counters = new Map<string, number>();
    async function signup() {
      const password = `test-${randomUUID()}`;
      const result = await core.auth.api.signUpEmail({
        body: {
          name: "Email fixture",
          email: `${randomUUID()}@test.local`,
          password,
        },
      });
      const response = await core.auth.api.signInEmail({
        body: { email: result.user.email, password },
        asResponse: true,
      });
      expect(response.status).toBe(200); // Normal unverified login stays available.
      const cookie = response.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
      return { id: result.user.id, email: result.user.email, cookie };
    }
    function post(path: string, body: unknown, cookie: string) {
      return app.request(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: authUrl,
          cookie,
        },
        body: JSON.stringify(body),
      });
    }
    function verificationToken(email: string) {
      const message = messages
        .slice()
        .reverse()
        .find((m) => m.to === email && m.text.includes("#verifyEmail="));
      expect(message).toBeDefined();
      const link = message!.text
        .split("\n")
        .find((line) => line.startsWith(authUrl));
      return decodeURIComponent(
        new URL(link!).hash.slice("#verifyEmail=".length),
      );
    }
    async function prove(person: { id: string; email: string }) {
      expect(
        await core.requestEmailVerification(userPrincipal(person.id), {}),
      ).toEqual({ emailVerified: false, delivery: "logged" });
      return verificationToken(person.email);
    }
    async function audit(resourceId: string, action: string) {
      return connection.db
        .select()
        .from(activity)
        .where(
          and(eq(activity.resourceId, resourceId), eq(activity.action, action)),
        );
    }
    beforeAll(async () => {
      await migrateDatabase(url!);
      connection = connectDatabase(url!);
      const [server] = await connection.client`show server_version_num`;
      expect(Number(server.server_version_num)).toBeGreaterThanOrEqual(180000);
      expect(Number(server.server_version_num)).toBeLessThan(190000);
      core = createCore({
        databaseUrl: url!,
        authUrl,
        authSecret: secret,
        tokenPepper: pepper,
        email: {
          async send(message) {
            attempts++;
            if (failed) throw new Error("Private provider exception");
            // The invitation is visible from another connection before send begins.
            if (message.text.includes("#invite=")) {
              const rows = await connection.db
                .select()
                .from(workspaceInvites)
                .where(eq(workspaceInvites.email, message.to));
              expect(rows.some((row) => row.status === "pending")).toBe(true);
            }
            messages.push(message);
            return "logged";
          },
        },
      });
      await core.subscribeChanges((event) => {
        events.push(event);
      });
      const apiRequire = createRequire(
        new URL("../../../apps/api/package.json", import.meta.url),
      );
      const limiter = {
        limit: 3,
        async hit(key: string) {
          const count = (counters.get(key) ?? 0) + 1;
          counters.set(key, count);
          return { allowed: count <= 3, count };
        },
        close: async () => {},
      };
      app = createApp(
        core,
        authUrl,
        apiRequire("pino")({ enabled: false }),
        limiter,
        undefined,
        limiter,
      );
      admin = await signup();
      workspaceId = (
        await core.createWorkspace(userPrincipal(admin.id), {
          name: `Email workspace ${randomUUID()}`,
        })
      ).id;
    }, 30000);
    afterAll(async () => {
      if (core) await core.close();
      if (connection) await connection.close();
    });

    it("delivers a committed copyable invite but denies unproved ownership, then verifies and joins through REST", async () => {
      const person = await signup();
      const issuedResponse = await post(
        `/api/workspaces/${workspaceId}/invites`,
        { email: person.email, role: "member" },
        admin.cookie,
      );
      expect(issuedResponse.status).toBe(201);
      const issued = issuedWorkspaceInviteSchema.parse(
        await issuedResponse.json(),
      );
      expect(issued.emailDelivery).toBe("logged");
      expect(
        messages
          .slice()
          .reverse()
          .find((m) => m.to === person.email)!.text,
      ).toContain(`#invite=${issued.token}`);
      expect(
        (await audit(issued.id, "workspace_invites.insert"))[0],
      ).toMatchObject({ actorId: admin.id, details: {} });
      await vi.waitFor(() =>
        expect(
          events.some(
            (event) =>
              event.action === "workspace_invites.insert" &&
              event.resourceId === issued.id,
          ),
        ).toBe(true),
      );
      const denied = await post(
        "/api/workspace-invites/accept",
        { token: issued.token },
        person.cookie,
      );
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({
        error: "email_verification_required",
      });
      expect(await audit(issued.id, "workspace_invites.update")).toHaveLength(
        0,
      );
      const requested = await post(
        "/api/me/email-verification/request",
        {},
        person.cookie,
      );
      expect(await requested.json()).toEqual({
        emailVerified: false,
        delivery: "logged",
      });
      const proof = verificationToken(person.email);
      expect(
        (
          await post(
            "/api/me/email-verification/verify",
            { token: proof },
            person.cookie,
          )
        ).status,
      ).toBe(200);
      const verifiedAudit = await audit(person.id, "users.update");
      expect(verifiedAudit).toHaveLength(1);
      expect(verifiedAudit[0]).toMatchObject({
        actorId: person.id,
        details: {},
      });
      await vi.waitFor(() =>
        expect(
          events.some(
            (event) =>
              event.action === "users.update" &&
              event.resourceId === person.id &&
              event.userId === person.id,
          ),
        ).toBe(true),
      );
      const joined = await post(
        "/api/workspace-invites/accept",
        { token: issued.token },
        person.cookie,
      );
      expect(joined.status).toBe(200);
      expect(
        (await core.getMe(person.id)).workspaces.some(
          (workspace) =>
            workspace.id === workspaceId && workspace.role === "member",
        ),
      ).toBe(true);
      expect(
        (
          await post(
            "/api/workspace-invites/accept",
            { token: issued.token },
            person.cookie,
          )
        ).status,
      ).toBe(409);
      expect(
        JSON.stringify(await audit(issued.id, "workspace_invites.update")),
      ).not.toContain(issued.token);
      expect(JSON.stringify(events)).not.toContain(proof);
    });

    it("rejects another account, expiration, tampering and ordinary Better Auth tokens without mutating ownership", async () => {
      const person = await signup();
      const other = await signup();
      const proof = await prove(person);
      await expect(
        core.verifyEmailOwnership(userPrincipal(other.id), { token: proof }),
      ).rejects.toMatchObject({ code: "invalid_input", status: 400 });
      const expired = await createEmailVerificationToken(
        secret,
        person.email,
        undefined,
        -1,
        { purpose: "taff.email-verification", userId: person.id },
      );
      const ordinary = await createEmailVerificationToken(secret, person.email);
      const emailChange = await createEmailVerificationToken(
        secret,
        person.email,
        other.email,
        3600,
        { purpose: "taff.email-verification", userId: person.id },
      );
      const [prefix, payload, signature] = proof.split(".");
      const tampered = `${prefix}.${payload}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
      for (const token of [expired, ordinary, emailChange, tampered])
        await expect(
          core.verifyEmailOwnership(userPrincipal(person.id), { token }),
        ).rejects.toMatchObject({ code: "invalid_input", status: 400 });
      expect(
        await core.getEmailVerificationStatus(userPrincipal(person.id)),
      ).toEqual({ emailVerified: false });
      expect(await audit(person.id, "users.update")).toHaveLength(0);
      const agent = await core.createWorkspaceAgent(
        userPrincipal(admin.id),
        workspaceId,
        { name: `Email agent ${randomUUID()}`, kind: "agent" },
      );
      const principal = {
        kind: "agent" as const,
        memberId: agent.id,
        workspaceId,
        scopes: ["tasks:read" as const],
        tokenId: randomUUID(),
      };
      await expect(
        core.requestEmailVerification(principal, {}),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        core.verifyEmailOwnership(principal, { token: proof }),
      ).rejects.toMatchObject({ code: "forbidden" });
    });

    it("serializes proof replay and concurrent invitation redemption with exactly one mutation each", async () => {
      const person = await signup();
      const proof = await prove(person);
      const verification = await Promise.all([
        core.verifyEmailOwnership(userPrincipal(person.id), { token: proof }),
        core.verifyEmailOwnership(userPrincipal(person.id), { token: proof }),
      ]);
      expect(verification).toEqual([
        { emailVerified: true },
        { emailVerified: true },
      ]);
      expect(await audit(person.id, "users.update")).toHaveLength(1);
      const before = attempts;
      expect(
        await core.requestEmailVerification(userPrincipal(person.id), {}),
      ).toEqual({ emailVerified: true, delivery: null });
      expect(attempts).toBe(before);
      const issued = await core.createWorkspaceInvite(
        userPrincipal(admin.id),
        workspaceId,
        { email: person.email, role: "guest" },
      );
      const redemption = await Promise.allSettled([
        core.acceptWorkspaceInvite(userPrincipal(person.id), {
          token: issued.token,
        }),
        core.acceptWorkspaceInvite(userPrincipal(person.id), {
          token: issued.token,
        }),
      ]);
      expect(
        redemption.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        redemption.find((result) => result.status === "rejected"),
      ).toMatchObject({ reason: { code: "conflict" } });
      expect(
        await connection.db
          .select()
          .from(members)
          .where(
            and(
              eq(members.workspaceId, workspaceId),
              eq(members.userId, person.id),
            ),
          ),
      ).toHaveLength(1);
      expect(await audit(issued.id, "workspace_invites.update")).toHaveLength(
        1,
      );
    });

    it("fails SMTP once without rolling back committed invites, exposing secrets or verifying the recipient", async () => {
      const person = await signup();
      const before = attempts;
      failed = true;
      try {
        const issued = await core.createWorkspaceInvite(
          userPrincipal(admin.id),
          workspaceId,
          { email: person.email, role: "member" },
        );
        expect(issued.emailDelivery).toBe("failed");
        expect(issued.token.length).toBeGreaterThanOrEqual(32);
        expect(await audit(issued.id, "workspace_invites.insert")).toHaveLength(
          1,
        );
        expect(attempts).toBe(before + 1);
        expect(
          await core.requestEmailVerification(userPrincipal(person.id), {}),
        ).toEqual({ emailVerified: false, delivery: "failed" });
        await expect(
          core.acceptWorkspaceInvite(userPrincipal(person.id), {
            token: issued.token,
          }),
        ).rejects.toMatchObject({ code: "email_verification_required" });
        await expect(
          core.createWorkspaceInvite(userPrincipal(admin.id), workspaceId, {
            email: person.email,
            role: "member",
          }),
        ).rejects.toMatchObject({ code: "conflict" });
        expect(attempts).toBe(before + 2); // No send for the duplicate transaction.
        expect(await audit(issued.id, "workspace_invites.update")).toHaveLength(
          0,
        );
      } finally {
        failed = false;
      }
    });

    it("uses the known recipient locale for invitation and proof, otherwise the inviter locale", async () => {
      const person = await signup();
      await core.updateProfile(person.id, {
        locale: "zh-CN",
        tz: "Asia/Shanghai",
      });
      await core.updateProfile(admin.id, {
        locale: "zh-HK",
        tz: "Asia/Hong_Kong",
      });
      await core.createWorkspaceInvite(userPrincipal(admin.id), workspaceId, {
        email: person.email,
        role: "member",
      });
      expect(
        messages
          .slice()
          .reverse()
          .find((message) => message.to === person.email)!.subject,
      ).toBe(emailResources["zh-CN"].emailInvitationSubject);
      await prove(person);
      expect(
        messages
          .slice()
          .reverse()
          .find((message) => message.to === person.email)!.subject,
      ).toBe(emailResources["zh-CN"].emailVerificationSubject);
      const unknownEmail = `${randomUUID()}@test.local`;
      await core.createWorkspaceInvite(userPrincipal(admin.id), workspaceId, {
        email: unknownEmail,
        role: "member",
      });
      expect(
        messages
          .slice()
          .reverse()
          .find((message) => message.to === unknownEmail)!.subject,
      ).toBe(emailResources["zh-HK"].emailInvitationSubject);
    });

    it("binds verification to the current email and fail-closes request rate limits", async () => {
      const person = await signup();
      const proof = await prove(person);
      const changed = `${randomUUID()}@test.local`;
      await connection.db.transaction(async (tx) => {
        await tx
          .update(user)
          .set({ email: changed })
          .where(eq(user.id, person.id));
      }); // Auth identity trigger supplies user actor; test-only identity-change race.
      await expect(
        core.verifyEmailOwnership(userPrincipal(person.id), { token: proof }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(
        await core.getEmailVerificationStatus(userPrincipal(person.id)),
      ).toEqual({ emailVerified: false });
      for (let i = 0; i < 3; i++)
        expect(
          (await post("/api/me/email-verification/request", {}, person.cookie))
            .status,
        ).toBe(200);
      const blocked = await post(
        "/api/me/email-verification/request",
        {},
        person.cookie,
      );
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toBe("60");
      expect(await blocked.json()).toEqual({ error: "rate_limited" });
    });
  },
);
