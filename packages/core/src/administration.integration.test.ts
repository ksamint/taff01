import { randomInt, randomUUID } from "node:crypto";
import {
  account,
  activity,
  connectDatabase,
  members,
  projects,
  user,
  workspaces,
} from "@taff/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, userPrincipal } from "./index";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  console.warn(
    "SKIP administration PG integration: TEST_DATABASE_URL not configured",
  );
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("Administration tests require a separate _test database");
const phone = () =>
  `+86138${String(randomInt(0, 100_000_000)).padStart(8, "0")}`;
const nonce = randomUUID();
const names = [
  `Test org A ${nonce}`,
  `Test org B ${nonce}`,
  `Test org C ${nonce}`,
];
const username = `u${nonce.replaceAll("-", "").slice(0, 20)}`;
const shortPassword = randomUUID().slice(0, 6);
const phones = [phone(), phone()];
const input = {
  workspaceNames: names,
  systemAdminPhones: phones,
  orgAdmin: { username, password: shortPassword, workspaceName: names[0] },
};
describe.skipIf(!databaseUrl)(
  "trusted administration PostgreSQL invariants",
  () => {
    let core: Core;
    let connection: ReturnType<typeof connectDatabase>;
    let baseline: string[];
    let ordinaryId: string;
    let provision: Awaited<ReturnType<Core["provisionAdministration"]>>;
    const userIds = new Set<string>();
    beforeAll(async () => {
      await migrateDatabase(databaseUrl!);
      connection = connectDatabase(databaseUrl!);
      baseline = (
        await connection.db.select({ id: workspaces.id }).from(workspaces)
      ).map((r) => r.id);
      core = createCore({
        databaseUrl: databaseUrl!,
        authUrl: "https://username.test",
        authSecret: `auth-${randomUUID()}`,
        tokenPepper: `pepper-${randomUUID()}`,
      });
      const ordinary = await core.auth.api.signUpEmail({
        body: {
          name: "Test ordinary",
          email: `${nonce}@test.local`,
          password: `test-${nonce}`,
        },
      });
      ordinaryId = ordinary.user.id;
      userIds.add(ordinaryId);
      // Existing verified phone identity is preserved, including email and name.
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id','system:test',true)`,
        );
        await tx
          .update(user)
          .set({ phoneNumber: phones[0], phoneNumberVerified: true })
          .where(eq(user.id, ordinaryId));
      });
      const results = await Promise.all([
        core.provisionAdministration(input),
        core.provisionAdministration(input),
      ]);
      provision = results[0];
      expect(results[1].orgAdminUserId).toBe(provision.orgAdminUserId);
      expect(results.map((r) => r.createdOrgAdmin).sort()).toEqual([
        false,
        true,
      ]);
      for (const id of [
        ...provision.systemAdminUserIds,
        provision.orgAdminUserId,
      ])
        userIds.add(id);
    }, 30_000);
    afterAll(async () => {
      if (connection) {
        await connection.db.transaction(async (tx) => {
          await tx.execute(
            sql`select set_config('taff.actor_id','system:test-cleanup',true)`,
          );
          await tx
            .update(user)
            .set({ systemAdmin: false })
            .where(inArray(user.id, [...userIds]));
          await tx.delete(user).where(inArray(user.id, [...userIds]));
          const fresh = (
            await tx.select({ id: workspaces.id }).from(workspaces)
          )
            .map((r) => r.id)
            .filter((id) => !baseline.includes(id));
          if (fresh.length) {
            await tx
              .delete(projects)
              .where(inArray(projects.workspaceId, fresh));
            await tx.delete(workspaces).where(inArray(workspaces.id, fresh));
          }
        });
      }
      await core?.close();
      await connection?.close();
    });
    it("supports a six-character username password while signup still requires eight", async () => {
      const response = await core.auth.handler(
        new Request("https://username.test/api/auth/sign-in/username", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://username.test",
          },
          body: JSON.stringify({
            username: username.toUpperCase(),
            password: shortPassword,
          }),
        }),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Set-Cookie")).toContain("Secure");
      const payload = await response.json();
      expect(payload.user.id).toBe(provision.orgAdminUserId);
      const rejected = await core.auth.handler(
        new Request("https://username.test/api/auth/sign-up/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://username.test",
          },
          body: JSON.stringify({
            name: "Short",
            email: `${randomUUID()}@test.local`,
            password: shortPassword,
          }),
        }),
      );
      expect(rejected.status).toBe(400);
    });
    it("preserves verified identity, leaves new phone unverified and creates durable real memberships", async () => {
      const [existing] = await connection.db
        .select()
        .from(user)
        .where(eq(user.id, ordinaryId));
      expect(existing).toMatchObject({
        phoneNumberVerified: true,
        name: "Test ordinary",
        email: `${nonce}@test.local`,
        systemAdmin: true,
      });
      const [newPhone] = await connection.db
        .select()
        .from(user)
        .where(eq(user.phoneNumber, phones[1]));
      expect(newPhone.phoneNumberVerified).toBe(false);
      const all = await connection.db.select().from(workspaces);
      for (const id of provision.systemAdminUserIds) {
        const roster = await connection.db
          .select()
          .from(members)
          .where(eq(members.userId, id));
        expect(roster).toHaveLength(all.length);
        expect(
          roster.every((r) => r.role === "admin" && r.kind === "person"),
        ).toBe(true);
        expect(new Set(roster.map((r) => r.id)).size).toBe(all.length);
      }
      const future = await core.createWorkspace(userPrincipal(ordinaryId), {
        name: `Future ${nonce}`,
      });
      const roster = await core.listMembers(
        userPrincipal(ordinaryId),
        future.id,
      );
      expect(
        roster.filter((r) =>
          provision.systemAdminUserIds.includes(r.userId ?? ""),
        ),
      ).toHaveLength(2);
      expect(roster.find((r) => r.userId === ordinaryId)?.id).toBe(
        future.memberId,
      );
    });
    it("bounds org admin scope and prevents org admins from demoting system administrators", async () => {
      await core.createProject(
        userPrincipal(provision.orgAdminUserId),
        provision.workspaces[0].id,
        { name: "Owned project" },
      );
      await expect(
        core.listMembers(
          userPrincipal(provision.orgAdminUserId),
          provision.workspaces[1].id,
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
      const systemMember = (
        await core.listMembers(
          userPrincipal(provision.orgAdminUserId),
          provision.workspaces[0].id,
        )
      ).find((r) => r.userId === ordinaryId)!;
      await expect(
        core.updateMemberRole(
          userPrincipal(provision.orgAdminUserId),
          provision.workspaces[0].id,
          systemMember.id,
          { role: "member" },
        ),
      ).rejects.toMatchObject({ code: "conflict" });
    });
    it("serializes a promotion racing future workspace creation without duplicate creator memberships", async () => {
      const person = await core.auth.api.signUpEmail({
        body: {
          name: "Concurrent member",
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
      userIds.add(person.user.id);
      const number = phone();
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id','system:test',true)`,
        );
        await tx
          .update(user)
          .set({ phoneNumber: number })
          .where(eq(user.id, person.user.id));
      });
      const [promoted, future] = await Promise.all([
        core.provisionAdministration({
          ...input,
          systemAdminPhones: [...phones, number],
        }),
        core.createWorkspace(userPrincipal(person.user.id), {
          name: `Concurrent future ${nonce}`,
        }),
      ]);
      expect(promoted.systemAdminUserIds).toContain(person.user.id);
      const roster = await connection.db
        .select()
        .from(members)
        .where(eq(members.workspaceId, future.id));
      expect(
        roster.filter((member) => member.userId === person.user.id),
      ).toMatchObject([{ id: future.memberId, kind: "person", role: "admin" }]);
      for (const id of promoted.systemAdminUserIds)
        expect(
          roster.some(
            (member) => member.userId === id && member.role === "admin",
          ),
        ).toBe(true);
    });
    it("does not escalate native signup flags or reassign a conflicting username; failures roll back organizations", async () => {
      const claimed = `c${randomUUID().replaceAll("-", "").slice(0, 20)}`;
      const response = await core.auth.handler(
        new Request("https://username.test/api/auth/sign-up/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://username.test",
          },
          body: JSON.stringify({
            name: "Public user",
            email: `${randomUUID()}@test.local`,
            password: `test-${randomUUID()}`,
            username: claimed,
            systemAdmin: true,
          }),
        }),
      );
      expect(response.status).toBe(200);
      const payload = await response.json();
      userIds.add(payload.user.id);
      const [person] = await connection.db
        .select()
        .from(user)
        .where(eq(user.id, payload.user.id));
      expect(person.systemAdmin).toBe(false);
      const foreignName = `Rollback ${nonce}`;
      await expect(
        core.provisionAdministration({
          ...input,
          workspaceNames: [foreignName],
          orgAdmin: {
            ...input.orgAdmin,
            username: claimed,
            workspaceName: foreignName,
          },
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      expect(
        await connection.db
          .select()
          .from(workspaces)
          .where(eq(workspaces.name, foreignName)),
      ).toHaveLength(0);
      await expect(
        core.createProject(
          userPrincipal(person.id),
          provision.workspaces[0].id,
          { name: "Forbidden" },
        ),
      ).rejects.toMatchObject({ code: "forbidden" });
    });
    it("is idempotent without password reset and leaves private audit details empty", async () => {
      const [credential] = await connection.db
        .select()
        .from(account)
        .where(
          and(
            eq(account.userId, provision.orgAdminUserId),
            eq(account.providerId, "credential"),
          ),
        );
      const before = await connection.db
        .select()
        .from(activity)
        .where(eq(activity.actorId, "system:administration"));
      const again = await core.provisionAdministration(input);
      expect(again.createdOrgAdmin).toBe(false);
      const [afterCredential] = await connection.db
        .select()
        .from(account)
        .where(eq(account.id, credential.id));
      expect(afterCredential.password).toBe(credential.password);
      const after = await connection.db
        .select()
        .from(activity)
        .where(eq(activity.actorId, "system:administration"));
      expect(after).toHaveLength(before.length);
      expect(after.every((r) => JSON.stringify(r.details) === "{}")).toBe(true);
      expect(JSON.stringify(after)).not.toContain(phones[0]);
      expect(JSON.stringify(after)).not.toContain(shortPassword);
      await expect(
        core.provisionAdministration({
          ...input,
          orgAdmin: { ...input.orgAdmin, password: `wrong-${randomUUID()}` },
        }),
      ).rejects.toMatchObject({ code: "conflict" });
    });
  },
);
