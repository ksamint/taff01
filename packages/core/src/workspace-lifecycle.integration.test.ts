import { randomUUID } from "node:crypto";
import { activity, connectDatabase, members, tasks, user } from "@taff/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, userPrincipal } from "./index";

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
      await tx
        .insert(members)
        .values({
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
  });
});
