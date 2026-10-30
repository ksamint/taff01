import { randomUUID } from "node:crypto";
import { activity, connectDatabase, members, workspaces } from "@taff/db";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import {
  backfillDefaultAgents,
  DEFAULT_AGENT_NAME,
  inspectDefaultAgents,
} from "./default-agents";
import { createCore, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("isolated _test database required");
describe.skipIf(!url)("default organization agents", () => {
  const connection = url ? connectDatabase(url) : null;
  const core = url
    ? createCore({
        databaseUrl: url,
        authUrl: "http://localhost:3000",
        authSecret: "default-agent-test-secret-at-least-32-characters",
        tokenPepper: "default-agent-test-pepper",
      })
    : null;
  let admin: string;
  let personal: string;
  beforeAll(async () => {
    await migrateDatabase(url!);
    const result = await core!.auth.api.signUpEmail({
      body: {
        name: "Default agent owner",
        email: `${randomUUID()}@test.local`,
        password: `test-${randomUUID()}`,
      },
    });
    admin = result.user.id;
    personal = (await core!.getMe(admin)).workspaces[0].id;
  });
  afterAll(async () => {
    await core?.close();
    await connection?.close();
  });
  it("creates one safe default for personal and newly created organizations, without credentials", async () => {
    const organization = await core!.createWorkspace(userPrincipal(admin), {
      name: "Default agents",
    });
    for (const workspaceId of [personal, organization.id]) {
      const agents = (
        await core!.listMembers(userPrincipal(admin), workspaceId)
      ).filter((m) => m.kind === "agent");
      expect(agents).toHaveLength(1);
      expect(agents[0]).toMatchObject({
        name: DEFAULT_AGENT_NAME,
        kind: "agent",
        role: "member",
        userId: null,
      });
      const profile = await core!.getAgentProfile(
        userPrincipal(admin),
        agents[0].id,
      );
      expect(profile).toMatchObject({
        reviewPolicy: "always_review",
        supervisorId: null,
        grants: [],
      });
      expect(profile.permissions).toEqual(
        expect.arrayContaining([
          { capability: "tasks.read", decision: "allow" },
          { capability: "repo.merge", decision: "deny" },
          { capability: "deploy.prod", decision: "deny" },
        ]),
      );
      expect(
        await core!.listAgentTokens(userPrincipal(admin), workspaceId),
      ).toEqual([]);
    }
  });
  it("backfills empty workspaces once, skips custom agents, and audits the migration actor", async () => {
    const ids = await connection!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${admin},true)`);
      const [empty, custom] = await tx
        .insert(workspaces)
        .values([{ name: "Legacy empty" }, { name: "Legacy custom" }])
        .returning();
      await tx.insert(members).values({
        workspaceId: custom.id,
        name: "Existing custom agent",
        kind: "agent",
      });
      return { empty: empty.id, custom: custom.id };
    });
    expect(
      (await inspectDefaultAgents(connection!.db)).workspacesWithoutAgents,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (await backfillDefaultAgents(connection!.db)).workspacesBackfilled,
    ).toBeGreaterThanOrEqual(1);
    const snapshot = await connection!.db
      .select()
      .from(members)
      .where(eq(members.workspaceId, ids.empty));
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].name).toBe(DEFAULT_AGENT_NAME);
    expect(
      await connection!.db
        .select()
        .from(members)
        .where(eq(members.workspaceId, ids.custom)),
    ).toEqual([expect.objectContaining({ name: "Existing custom agent" })]);
    expect(await backfillDefaultAgents(connection!.db)).toEqual({
      workspacesBackfilled: 0,
    });
    expect(
      await connection!.db
        .select()
        .from(members)
        .where(eq(members.workspaceId, ids.empty)),
    ).toEqual(snapshot);
    const audit = await connection!.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.resourceId, snapshot[0].id),
          eq(activity.action, "members.insert"),
        ),
      );
    expect(audit).toHaveLength(1);
    expect(audit[0].actorId).toBe("system:default-agent-migration");
  });
  it("does not let a guest or demoted admin create agents or issue, revoke or restore tokens; lists remain scoped", async () => {
    const workspace = await core!.createWorkspace(userPrincipal(admin), {
      name: "Default access",
    });
    const guest = await core!.auth.api.signUpEmail({
      body: {
        name: "Lowest role",
        email: `${randomUUID()}@test.local`,
        password: `test-${randomUUID()}`,
      },
    });
    const p = userPrincipal(guest.user.id);
    await connection!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${admin},true)`);
      await tx.insert(members).values({
        workspaceId: workspace.id,
        userId: guest.user.id,
        name: "Lowest role",
        kind: "person",
        role: "admin",
      });
    });
    const agent = (await core!.listMembers(p, workspace.id)).find(
      (m) => m.kind === "agent",
    )!;
    const issued = await core!.createAgentToken(p, {
      workspaceId: workspace.id,
      memberId: agent.id,
      name: "Prior access",
      scopes: ["tasks:read"],
    });
    await core!.revokeAgentToken(p, issued.id);
    for (const role of ["member", "guest"] as const) {
      await core!.updateMemberRole(
        userPrincipal(admin),
        workspace.id,
        (await core!.listMembers(p, workspace.id)).find(
          (m) => m.userId === guest.user.id,
        )!.id,
        { role },
      );
      const denied = [
        () =>
          core!.createWorkspaceAgent(p, workspace.id, {
            name: "Denied",
            kind: "agent",
          }),
        () =>
          core!.createAgentToken(p, {
            workspaceId: workspace.id,
            memberId: agent.id,
            name: "Denied",
            scopes: ["tasks:read"],
          }),
        () => core!.revokeAgentToken(p, issued.id),
        () => core!.restoreAgentToken(p, issued.id),
      ];
      for (const operation of denied)
        await expect(operation()).rejects.toMatchObject({ code: "forbidden" });
      if (role === "member")
        expect(await core!.listAgentTokens(p, workspace.id)).toEqual([]);
      else
        await expect(
          core!.listAgentTokens(p, workspace.id),
        ).rejects.toMatchObject({ code: "forbidden" });
      expect(await core!.authenticateAgentToken(issued.token)).toBeNull();
    }
  });
});
