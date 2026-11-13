import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  activity,
  agentTokens,
  agentTokenWorkspaces,
  connectDatabase,
  members,
  tasks,
  user,
  workspaces,
} from "@taff/db";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("isolated _test database required");
describe.skipIf(!url)("organization lifecycle and login defaults", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let alice: string;
  let bob: string;
  let personal: string;
  let organization: string;
  const signup = async (name: string) =>
    (
      await core.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      })
    ).user.id;
  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "workspace-test-secret-at-least-32-chars",
      tokenPepper: "workspace-test-pepper-long-enough",
    });
    const signup = async (name: string) =>
      (
        await core.auth.api.signUpEmail({
          body: {
            name,
            email: `${randomUUID()}@test.local`,
            password: `test-${randomUUID()}`,
          },
        })
      ).user.id;
    alice = await signup("Workspace Alice");
    bob = await signup("Workspace Bob");
    personal = (await core.getMe(alice)).workspaces[0].id;
  });
  afterAll(async () => {
    await core?.close();
    await connection?.close();
  });
  it("backfills legacy personal ownership from audit history and preserves later namesakes", async () => {
    const name = `Legacy personal ${randomUUID()}`;
    const legacy = await core.auth.api.signUpEmail({
      body: {
        name,
        email: `${randomUUID()}@test.local`,
        password: `test-${randomUUID()}`,
      },
    });
    const original = (await core.getMe(legacy.user.id)).workspaces[0];
    const namesake = await core.createWorkspace(userPrincipal(legacy.user.id), {
      name,
    });
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${alice},true)`);
      await tx
        .update(workspaces)
        .set({ personalOwnerId: null })
        .where(eq(workspaces.id, original.id));
    });
    const statements = readFileSync(
      new URL(
        "../../db/migrations/0030_workspace_lifecycle.sql",
        import.meta.url,
      ),
      "utf8",
    ).split("--> statement-breakpoint");
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql.raw(statements.find((text) => text.includes("SELECT set_config"))!),
      );
      await tx.execute(
        sql.raw(statements.find((text) => text.includes("WITH candidates"))!),
      );
    });
    const [recovered] = await connection.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, original.id));
    const [team] = await connection.db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, namesake.id));
    expect(recovered.personalOwnerId).toBe(legacy.user.id);
    expect(team.personalOwnerId).toBe(null);
  });
  it("uses the named personal workspace until an organization exists, then prefers the organization", async () => {
    expect((await core.getMe(alice)).workspaces[0].name).toBe(
      "Workspace Alice",
    );
    const created = await core.createWorkspace(userPrincipal(alice), {
      name: "Lifecycle team",
    });
    organization = created.id;
    expect((await core.getMe(alice)).workspaces[0].id).toBe(organization);
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${alice},true)`);
      await tx.insert(members).values({
        workspaceId: organization,
        userId: bob,
        name: "Workspace Bob",
        kind: "person",
        role: "member",
      });
    });
    expect((await core.getMe(bob)).workspaces[0].id).toBe(organization);
  });
  it("saves the user's explicit choice and rejects another user or a nonmember workspace", async () => {
    await core.setDefaultWorkspace(userPrincipal(alice), alice, {
      workspaceId: personal,
    });
    expect((await core.getMe(alice)).workspaces[0].id).toBe(personal);
    await expect(
      core.setDefaultWorkspace(userPrincipal(bob), alice, {
        workspaceId: organization,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      core.setDefaultWorkspace(userPrincipal(bob), bob, {
        workspaceId: personal,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await core.setDefaultWorkspace(userPrincipal(alice), alice, {
      workspaceId: null,
    });
    expect((await core.getMe(alice)).workspaces[0].id).toBe(organization);
  });
  it("preserves a person's explicit invitation to another personal workspace", async () => {
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${alice},true)`);
      await tx.insert(members).values({
        workspaceId: personal,
        userId: bob,
        name: "Workspace Bob",
        kind: "person",
        role: "member",
      });
    });
    expect(
      (await core.getMe(bob)).workspaces.some((row) => row.id === personal),
    ).toBe(true);
    await core.setDefaultWorkspace(userPrincipal(bob), bob, {
      workspaceId: personal,
    });
    expect((await core.getMe(bob)).workspaces[0].id).toBe(personal);
    await core.setDefaultWorkspace(userPrincipal(bob), bob, {
      workspaceId: organization,
    });
  });
  it("allows a system admin to set a member's default, and hides other people's personal workspaces", async () => {
    const priorMemberships = await connection.db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.userId, alice));
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${alice},true)`);
      await tx
        .update(user)
        .set({ systemAdmin: true })
        .where(eq(user.id, alice));
    });
    try {
      await core.setDefaultWorkspace(userPrincipal(alice), bob, {
        workspaceId: organization,
      });
      expect((await core.getMe(bob)).user.defaultWorkspaceId).toBe(
        organization,
      );
      const audit = await connection.db
        .select()
        .from(activity)
        .where(and(eq(activity.resourceId, bob), eq(activity.actorId, alice)));
      expect(audit).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "users.update",
            details: expect.objectContaining({
              operation: "default_workspace",
              workspaceId: organization,
            }),
          }),
        ]),
      );
      const me = await core.getMe(alice);
      expect(me.workspaces.some((row) => row.name === "Workspace Bob")).toBe(
        false,
      );
      expect(me.user.systemAdmin).toBe(true);
    } finally {
      await connection.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('taff.actor_id',${alice},true)`);
        await tx
          .update(user)
          .set({ systemAdmin: false })
          .where(eq(user.id, alice));
        await tx.delete(members).where(
          and(
            eq(members.userId, alice),
            notInArray(
              members.id,
              priorMemberships.map((row) => row.id),
            ),
          ),
        );
      });
    }
  });
  it("archives a team without deleting tasks; denies stale access, resets defaults and preserves personal workspaces", async () => {
    const me = await core.getMe(alice);
    const ownerId = me.workspaces.find(
      (row) => row.id === organization,
    )!.memberId;
    const task = await core.createTask(userPrincipal(alice), {
      workspaceId: organization,
      ownerId,
      workerId: null,
      title: "Preserve archived history",
    });
    await expect(
      core.archiveWorkspace(userPrincipal(bob), organization),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      core.archiveWorkspace(userPrincipal(alice), personal),
    ).rejects.toMatchObject({ status: 409 });
    await core.archiveWorkspace(userPrincipal(alice), organization);
    expect(
      (await core.getMe(alice)).workspaces.some(
        (row) => row.id === organization,
      ),
    ).toBe(false);
    expect((await core.getMe(bob)).user.defaultWorkspaceId).toBe(null);
    await expect(
      core.listTasks(userPrincipal(alice), organization),
    ).rejects.toMatchObject({ status: 403 });
    expect(
      await connection.db.select().from(tasks).where(eq(tasks.id, task.id)),
    ).toHaveLength(1);
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.resourceId, organization)),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "workspaces.update",
          actorId: alice,
        }),
      ]),
    );
    await core.archiveWorkspace(userPrincipal(alice), organization);
    expect(await core.listArchivedWorkspaces(userPrincipal(alice))).toEqual([
      expect.objectContaining({ id: organization, personalOwnerId: null }),
    ]);
    await core.restoreWorkspace(userPrincipal(alice), organization);
    expect(
      (await core.listTasks(userPrincipal(bob), organization)).some(
        (row) => row.id === task.id,
      ),
    ).toBe(true);
    expect((await core.getMe(bob)).user.defaultWorkspaceId).toBeNull();
    expect(await core.listArchivedWorkspaces(userPrincipal(alice))).toEqual([]);
    const before = await connection.db
      .select()
      .from(activity)
      .where(eq(activity.resourceId, organization));
    await core.restoreWorkspace(userPrincipal(alice), organization);
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.resourceId, organization)),
    ).toHaveLength(before.length);
  });
  it("refuses list/archive/restore to members, guests, agents and outsiders, including after demotion", async () => {
    const p = userPrincipal(alice);
    const team = await core.createWorkspace(p, { name: "Archive authority" });
    const guestId = await signup("Archive guest");
    const outsiderId = await signup("Archive outsider");
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${alice},true)`);
      await tx.insert(members).values([
        {
          workspaceId: team.id,
          userId: bob,
          name: "Second admin",
          kind: "person",
          role: "admin",
        },
        {
          workspaceId: team.id,
          userId: guestId,
          name: "Guest",
          kind: "person",
          role: "guest",
        },
      ]);
    });
    const agent = await core.createWorkspaceAgent(p, team.id, {
      name: "Archive agent",
      kind: "agent",
    });
    const denied: Principal[] = [
      userPrincipal(guestId),
      userPrincipal(outsiderId),
      {
        kind: "agent",
        memberId: agent.id,
        tokenId: randomUUID(),
        workspaceId: team.id,
        scopes: ["tasks:read"],
      },
    ];
    for (const caller of denied) {
      await expect(core.listArchivedWorkspaces(caller)).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        core.archiveWorkspace(caller, team.id),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        core.restoreWorkspace(caller, team.id),
      ).rejects.toMatchObject({ status: 403 });
    }
    // Lowest allowed role, not a system admin; personal ownership alone is insufficient.
    expect((await core.getMe(alice)).user.systemAdmin).toBe(false);
    expect(
      (await core.getWorkspaceAccess(p, personal)).canArchiveWorkspace,
    ).toBe(false);
    expect(
      (await core.getWorkspaceAccess(p, team.id)).canArchiveWorkspace,
    ).toBe(true);
    await expect(core.restoreWorkspace(p, personal)).rejects.toMatchObject({
      status: 409,
    });
    await core.updateMemberRole(userPrincipal(bob), team.id, team.memberId, {
      role: "member",
    });
    await core.archiveWorkspace(userPrincipal(bob), team.id);
    await expect(core.archiveWorkspace(p, team.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(core.restoreWorkspace(p, team.id)).rejects.toMatchObject({
      status: 403,
    });
    expect(
      (await core.listArchivedWorkspaces(p)).some((row) => row.id === team.id),
    ).toBe(false);
    await expect(
      core.listArchivedWorkspaces(userPrincipal(guestId)),
    ).rejects.toMatchObject({ status: 403 });
    // A person who has lost their only nonpersonal admin role cannot list either.
    const sole = await core.createWorkspace(userPrincipal(outsiderId), {
      name: "Only administered team",
    });
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${outsiderId},true)`,
      );
      await tx.insert(members).values({
        workspaceId: sole.id,
        userId: bob,
        name: "Admin",
        kind: "person",
        role: "admin",
      });
    });
    await core.updateMemberRole(userPrincipal(bob), sole.id, sole.memberId, {
      role: "member",
    });
    await core.archiveWorkspace(userPrincipal(bob), sole.id);
    for (const operation of [
      () => core.listArchivedWorkspaces(userPrincipal(outsiderId)),
      () => core.archiveWorkspace(userPrincipal(outsiderId), sole.id),
      () => core.restoreWorkspace(userPrincipal(outsiderId), sole.id),
    ])
      await expect(operation()).rejects.toMatchObject({ status: 403 });
    await core.restoreWorkspace(userPrincipal(bob), team.id);
    await expect(
      core.listTasks(userPrincipal(outsiderId), team.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(core.listTasks(p, team.id)).resolves.toEqual([]);
  });
  it("system admins restore nonpersonal workspaces, retain defaults and never revive revoked token grants", async () => {
    const p = userPrincipal(alice);
    const team = await core.createWorkspace(p, {
      name: "Revocation preservation",
    });
    const agent = await core.createWorkspaceAgent(p, team.id, {
      name: "Revoked agent",
      kind: "agent",
    });
    const token = await core.createAgentToken(p, {
      workspaceId: team.id,
      memberId: agent.id,
      name: "Revoked token",
      scopes: ["tasks:read"],
    });
    await core.setAgentTokenWorkspace(p, token.id, {
      workspaceId: team.id,
      memberId: agent.id,
      scopes: ["tasks:read"],
      revoked: true,
    });
    await core.revokeAgentToken(p, token.id);
    const beforeToken = await connection.db
      .select()
      .from(agentTokens)
      .where(eq(agentTokens.id, token.id));
    const beforeGrants = await connection.db
      .select()
      .from(agentTokenWorkspaces)
      .where(eq(agentTokenWorkspaces.tokenId, token.id));
    const systemId = await signup("Archive system admin");
    const priorMemberships = await connection.db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.userId, systemId));
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${systemId},true)`,
      );
      await tx
        .update(user)
        .set({ systemAdmin: true })
        .where(eq(user.id, systemId));
    });
    const system = userPrincipal(systemId);
    const beforeMembers = await connection.db
      .select()
      .from(members)
      .where(eq(members.workspaceId, team.id));
    try {
      await core.setDefaultWorkspace(p, alice, { workspaceId: team.id });
      await core.archiveWorkspace(system, team.id);
      expect(
        (await core.listArchivedWorkspaces(system)).some(
          (row) => row.id === team.id,
        ),
      ).toBe(true);
      await expect(
        core.archiveWorkspace(system, personal),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        core.restoreWorkspace(system, personal),
      ).rejects.toMatchObject({ status: 409 });
      await core.restoreWorkspace(system, team.id);
      expect((await core.getMe(alice)).user.defaultWorkspaceId).toBeNull();
      expect(await core.authenticateAgentToken(token.token)).toBeNull();
      expect(
        await connection.db
          .select()
          .from(agentTokens)
          .where(eq(agentTokens.id, token.id)),
      ).toEqual(beforeToken);
      expect(
        await connection.db
          .select()
          .from(agentTokenWorkspaces)
          .where(eq(agentTokenWorkspaces.tokenId, token.id)),
      ).toEqual(beforeGrants);
      expect(
        await connection.db
          .select()
          .from(members)
          .where(eq(members.workspaceId, team.id)),
      ).toEqual(beforeMembers);
    } finally {
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id',${systemId},true)`,
        );
        await tx
          .update(user)
          .set({ systemAdmin: false })
          .where(eq(user.id, systemId));
        await tx.delete(members).where(
          and(
            eq(members.userId, systemId),
            notInArray(
              members.id,
              priorMemberships.map((row) => row.id),
            ),
          ),
        );
      });
    }
  });
});
