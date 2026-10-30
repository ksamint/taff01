import { randomUUID } from "node:crypto";
import { activity, agentTokens, connectDatabase, members } from "@taff/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import {
  type Core,
  createCore,
  type Principal,
  RESTORE_WINDOW_MS,
  userPrincipal,
} from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn("SKIP agent token PostgreSQL tests: TEST_DATABASE_URL required");
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("agent token tests require an isolated _test database");

describe.skipIf(!url)("agent token restore (undo revoke)", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let admin: Principal;
  let adminId: string;
  let member: Principal;
  let outsider: Principal;
  let agent: Principal;
  let workspaceId: string;
  let agentId: string;
  /** Writes directly with an explicit audit actor, as another code path would. */
  const writeAs = (actor: string, tokenId: string, revokedAt: Date | null) =>
    connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id', ${actor}, true)`);
      await tx
        .update(agentTokens)
        .set({ revokedAt })
        .where(eq(agentTokens.id, tokenId));
    });
  const issue = async (name = `Client ${randomUUID().slice(0, 8)}`) =>
    core.createAgentToken(admin, {
      workspaceId,
      memberId: agentId,
      name,
      scopes: ["tasks:read", "tasks:write"],
    });

  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "agent-token-test-secret-longer-than-thirty-two",
      tokenPepper: "agent-token-test-pepper-16",
    });
    const signup = (name: string) =>
      core.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
    const a = await signup("Admin");
    adminId = a.user.id;
    admin = userPrincipal(adminId);
    workspaceId = (await core.getMe(adminId)).workspaces[0].id;
    const m = await signup("Member");
    member = userPrincipal(m.user.id);
    outsider = userPrincipal((await signup("Outsider")).user.id);
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', ${adminId}, true)`,
      );
      await tx.insert(members).values({
        workspaceId,
        userId: m.user.id,
        name: "Member",
        kind: "person",
      });
      const [row] = await tx
        .insert(members)
        .values({ workspaceId, name: "Restore Agent", kind: "agent" })
        .returning();
      agentId = row.id;
    });
    const own = await issue("Agent's own");
    agent = (await core.authenticateAgentToken(own.token))!;
  }, 30000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });

  it("restores a person's recent revocation with the same secret and an audit row", async () => {
    const issued = await issue();
    await core.revokeAgentToken(admin, issued.id);
    expect(await core.authenticateAgentToken(issued.token)).toBeNull();
    const restored = await core.restoreAgentToken(admin, issued.id);
    expect(restored).toMatchObject({
      id: issued.id,
      name: issued.name,
      scopes: issued.scopes,
      revokedAt: null,
    });
    expect(await core.authenticateAgentToken(issued.token)).toMatchObject({
      kind: "agent",
      tokenId: issued.id,
      memberId: agentId,
    });
    const rows = await connection.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.resourceId, issued.id),
          eq(activity.action, "agent_tokens.update"),
        ),
      )
      .orderBy(desc(activity.createdAt));
    expect(rows.map((row) => row.actorId)).toEqual([adminId, adminId]);
    // Restoring an active token changes nothing.
    expect(await core.restoreAgentToken(admin, issued.id)).toMatchObject({
      revokedAt: null,
    });
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.resourceId, issued.id)),
    ).toHaveLength(3);
  });

  const refusals: [
    string,
    () => Principal,
    (tokenId: string) => Promise<unknown>,
    string,
  ][] = [
    [
      "a member without token:manage",
      () => member,
      async () => {},
      "forbidden",
    ],
    [
      "a person outside the workspace",
      () => outsider,
      async () => {},
      "forbidden",
    ],
    [
      "an agent, even with tasks scopes",
      () => agent,
      async () => {},
      "forbidden",
    ],
    [
      "a revocation older than ten minutes",
      () => admin,
      (tokenId) =>
        writeAs(
          adminId,
          tokenId,
          new Date(Date.now() - RESTORE_WINDOW_MS - 1000),
        ),
      "conflict",
    ],
    [
      "a revocation not made by a person",
      () => admin,
      (tokenId) => writeAs("system:test", tokenId, new Date()),
      "conflict",
    ],
    [
      "a revocation recorded for an agent actor",
      () => admin,
      (tokenId) => writeAs(`agent:${agentId}`, tokenId, new Date()),
      "conflict",
    ],
  ];
  it.each(refusals)("refuses %s", async (_, principal, prepare, code) => {
    const issued = await issue();
    await core.revokeAgentToken(admin, issued.id);
    await prepare(issued.id);
    await expect(
      core.restoreAgentToken(principal(), issued.id),
    ).rejects.toMatchObject({ code });
    expect(await core.authenticateAgentToken(issued.token)).toBeNull();
  });

  it("rejects unknown and malformed ids", async () => {
    await expect(
      core.restoreAgentToken(admin, randomUUID()),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(core.restoreAgentToken(admin, "nope")).rejects.toMatchObject({
      code: "invalid_input",
    });
  });
  it("rechecks workspace grants and ignores forged scopes", async () => {
    const issued = await issue();
    const p = (await core.authenticateAgentToken(issued.token))!;
    expect(await core.resolveAgentWorkspace(p)).toMatchObject({
      workspaceId,
      memberId: agentId,
    });
    await core.setAgentTokenWorkspace(admin, issued.id, {
      workspaceId,
      memberId: agentId,
      scopes: ["tasks:read"],
    });
    expect(await core.resolveAgentWorkspace(p)).toMatchObject({
      scopes: ["tasks:read"],
    });
    await expect(
      core.resolveAgentWorkspace(p, randomUUID()),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.setAgentTokenWorkspace(outsider, issued.id, {
        workspaceId,
        memberId: agentId,
        scopes: ["tasks:write"],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await core.setAgentTokenWorkspace(admin, issued.id, {
      workspaceId,
      memberId: agentId,
      scopes: ["tasks:read"],
      revoked: true,
    });
    await expect(core.resolveAgentWorkspace(p)).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("isolates concurrent organization reads and revokes only the target grant", async () => {
    const other = await core.auth.api.signUpEmail({
      body: {
        name: "Other owner",
        email: `${randomUUID()}@test.local`,
        password: `test-${randomUUID()}`,
      },
    });
    const target = (await core.getMe(other.user.id)).workspaces[0].id;
    let targetAgent = "";
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', ${adminId}, true)`,
      );
      await tx.insert(members).values({
        workspaceId: target,
        userId: adminId,
        name: "Both admin",
        kind: "person",
        role: "admin",
      });
      const [row] = await tx
        .insert(members)
        .values({ workspaceId: target, name: "Target agent", kind: "agent" })
        .returning();
      targetAgent = row.id;
    });
    const issued = await issue();
    const p = (await core.authenticateAgentToken(issued.token))!;
    await core.setAgentTokenWorkspace(admin, issued.id, {
      workspaceId: target,
      memberId: targetAgent,
      scopes: ["tasks:read"],
    });
    expect(
      await core.listAgentTokenWorkspaces(admin, issued.id, workspaceId),
    ).toHaveLength(2);
    expect(
      await core.listAgentTokenWorkspaces(
        userPrincipal(other.user.id),
        issued.id,
        target,
      ),
    ).toHaveLength(1);
    const [original, selected] = await Promise.all([
      core.resolveAgentWorkspace(p),
      core.resolveAgentWorkspace(p, target),
    ]);
    expect(original.workspaceId).toBe(workspaceId);
    expect(selected).toMatchObject({
      workspaceId: target,
      memberId: targetAgent,
      scopes: ["tasks:read"],
    });
    expect(await core.listTasks(selected, target, {})).toEqual([]);
    const [owner] = await connection.db
      .select()
      .from(members)
      .where(
        and(eq(members.workspaceId, target), eq(members.userId, other.user.id)),
      );
    const targetAdmin = userPrincipal(other.user.id);
    const task = await core.createTask(targetAdmin, {
      workspaceId: target,
      ownerId: owner.id,
      workerId: targetAgent,
      title: "Read only grant target",
    });
    const run = await core.startRun(targetAdmin, task.id, {});
    await expect(
      core.createTask(selected, {
        workspaceId: target,
        ownerId: owner.id,
        workerId: targetAgent,
        title: "Forbidden",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.createProject(selected, target, { name: "Forbidden" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.setTaskCalendar(selected, task.id, {
        version: (await core.getTask(targetAdmin, task.id)).version,
        schedule: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.attachRunArtifact(
        { ...selected, scopes: ["tasks:write", "files:write"] },
        run.id,
        {
          version: run.version,
          name: "forged.txt",
          mimeType: "text/plain",
          content: "forged",
          diff: null,
          sourceUrl: null,
        },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.resolveAgentWorkspace(
        p,
        (await core.getMe(outsider.kind === "user" ? outsider.userId : ""))
          .workspaces[0].id,
      ),
    ).rejects.toMatchObject({ code: "forbidden" });

    await expect(
      core.listTasks(selected, workspaceId, {}),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id', ${adminId}, true)`,
        );
        await tx.delete(members).where(eq(members.id, targetAgent));
      }),
    ).rejects.toThrow();
    await core.setAgentTokenWorkspace(userPrincipal(other.user.id), issued.id, {
      workspaceId: target,
      memberId: targetAgent,
      scopes: ["tasks:read"],
      revoked: true,
    });
    await expect(core.resolveAgentWorkspace(p, target)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(core.resolveAgentWorkspace(p)).resolves.toMatchObject({
      workspaceId,
    });
    await expect(
      core.setAgentTokenWorkspace(userPrincipal(other.user.id), issued.id, {
        workspaceId: target,
        memberId: targetAgent,
        scopes: ["tasks:write"],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
