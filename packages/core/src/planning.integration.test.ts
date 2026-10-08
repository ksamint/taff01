import { randomUUID } from "node:crypto";
import {
  activity,
  connectDatabase,
  members,
  projects,
  tasks,
  workspaceInvites,
} from "@taff/db";
import {
  type ChangeEvent,
  changeEventSchema,
  workspaceInviteSchema,
} from "@taff/schemas";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url) console.warn("SKIP M5 PostgreSQL tests: TEST_DATABASE_URL required");
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("M5 tests require isolated _test database");
describe.skipIf(!url)("M5 PostgreSQL invariants", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let alice: Principal;
  let bob: Principal;
  let guest: Principal;
  let outsider: Principal;
  let agent: Principal;
  let aliceId: string;
  let bobId: string;
  let guestId: string;
  let outsiderId: string;
  let bobEmail: string;
  let outsiderEmail: string;
  let w: string;
  let owner: string;
  let bobMember: string;
  let guestMember: string;
  let agentId: string;
  let otherW: string;
  const events: ChangeEvent[] = [];
  const actor = (
    tx: Parameters<
      Parameters<ReturnType<typeof connectDatabase>["db"]["transaction"]>[0]
    >[0],
  ) => tx.execute(sql`select set_config('taff.actor_id',${aliceId},true)`);
  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    const [version] = await connection.client`show server_version_num`;
    expect(Number(version.server_version_num)).toBeGreaterThanOrEqual(180000);
    expect(Number(version.server_version_num)).toBeLessThan(190000);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "m5-test-secret-longer-than-thirty-two-characters",
      tokenPepper: "m5-test-pepper-at-least-sixteen",
    });
    await core.subscribeChanges((event) => {
      events.push(event);
    });
    const signup = async (name: string) =>
      core.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
    const a = await signup("Alex Chen");
    aliceId = a.user.id;
    alice = userPrincipal(aliceId);
    const me = await core.getMe(aliceId);
    w = me.workspaces[0].id;
    owner = me.workspaces[0].memberId;
    const b = await signup("Bob Lee");
    bobId = b.user.id;
    bobEmail = b.user.email;
    bob = userPrincipal(bobId);
    const g = await signup("Guest");
    guestId = g.user.id;
    guest = userPrincipal(guestId);
    const o = await signup("Outsider");
    outsiderId = o.user.id;
    outsiderEmail = o.user.email;
    outsider = userPrincipal(outsiderId);
    otherW = (await core.getMe(outsiderId)).workspaces[0].id;
    await connection.db.transaction(async (tx) => {
      await actor(tx);
      const [bm] = await tx
        .insert(members)
        .values({
          workspaceId: w,
          userId: bobId,
          name: "Bob Lee",
          kind: "person",
        })
        .returning();
      bobMember = bm.id;
      const [gm] = await tx
        .insert(members)
        .values({
          workspaceId: w,
          userId: guestId,
          name: "Guest",
          kind: "person",
          role: "guest",
        })
        .returning();
      guestMember = gm.id;
      const [am] = await tx
        .insert(members)
        .values({ workspaceId: w, name: "Research Agent", kind: "agent" })
        .returning();
      agentId = am.id;
    });
    const token = await core.createAgentToken(alice, {
      workspaceId: w,
      memberId: agentId,
      name: "M5 test",
      scopes: [
        "tasks:read",
        "tasks:write",
        "calendar:write",
        "inbox:review",
        "files:write",
      ],
    });
    agent = (await core.authenticateAgentToken(token.token))!;
  }, 30000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });
  const create = (
    title: string,
    fields: Partial<Parameters<Core["createTask"]>[1]> = {},
  ) =>
    core.createTask(alice, {
      workspaceId: w,
      ownerId: owner,
      workerId: null,
      title,
      ...fields,
    });
  it("creates rich versioned tasks and real subtasks with inherited fields", async () => {
    const project = await core.createProject(alice, w, { name: "Checkout v2" });
    const parent = await create("Ship checkout", {
      description: "Acceptance",
      priority: 1,
      labels: ["release"],
      projectId: project.id,
      dueAt: "2026-10-10T15:59:59.999Z",
    });
    expect(parent).toMatchObject({
      version: 1,
      priority: 1,
      labels: ["release"],
      description: "Acceptance",
      parentId: null,
    });
    const child = await create("Test checkout", { parentId: parent.id });
    expect(child).toMatchObject({
      parentId: parent.id,
      ownerId: owner,
      dueAt: parent.dueAt,
      priority: 1,
      projectId: project.id,
      workerId: null,
    });
    const noDate = await create("No deadline", {
      parentId: parent.id,
      dueAt: null,
    });
    expect(noDate.dueAt).toBeNull();
    expect(
      await core.listTasks(alice, w, { parentId: parent.id }),
    ).toHaveLength(2);
    expect(
      await core.listTasks(alice, w, {
        projectId: project.id,
        label: "release",
        priority: 1,
      }),
    ).toEqual([parent]);
    await expect(
      core.updateTaskStatus(alice, parent.id, { status: "done" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await core.updateTaskStatus(alice, child.id, { status: "done" });
    await core.updateTaskStatus(alice, noDate.id, { status: "done" });
    const completed = await core.updateTaskStatus(alice, parent.id, {
      status: "done",
    });
    expect(completed.version).toBe(2);
    await expect(
      create("Late child", { parentId: parent.id }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
  it("rejects cross-workspace parent/project/owner and immutable reparenting", async () => {
    const otherProject = await core.createProject(outsider, otherW, {
      name: "Private",
    });
    const otherOwner = (await core.getMe(outsiderId)).workspaces[0].memberId;
    const otherTask = await core.createTask(outsider, {
      workspaceId: otherW,
      ownerId: otherOwner,
      workerId: null,
      title: "Private parent",
    });
    await expect(
      create("Bad parent", { parentId: otherTask.id }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      create("Bad project", { projectId: otherProject.id }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const task = await create("Owner guard");
    await expect(
      core.updateTask(alice, task.id, {
        version: task.version,
        ownerId: agentId,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.updateTask(alice, task.id, {
        version: task.version,
        ownerId: otherOwner,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      connection.db.transaction(async (tx) => {
        await actor(tx);
        await tx
          .update(tasks)
          .set({ parentId: otherTask.id })
          .where(eq(tasks.id, task.id));
      }),
    ).rejects.toThrow();
    expect((await core.getTask(alice, task.id)).version).toBe(1);
  });
  it("one stale concurrent field edit wins and legacy writes advance the version", async () => {
    const task = await create("Concurrent");
    const results = await Promise.allSettled([
      core.updateTask(alice, task.id, { version: 1, title: "First" }),
      core.updateTask(alice, task.id, { version: 1, title: "Second" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((r) => r.status === "rejected");
    if (failed?.status === "rejected")
      expect(failed.reason).toMatchObject({ code: "conflict" });
    const after = await core.getTask(alice, task.id);
    expect(after.version).toBe(2);
    const assigned = await core.assignTask(alice, task.id, {
      workerId: bobMember,
      version: 2,
    });
    expect(assigned.version).toBe(3);
    const scheduled = await core.scheduleTask(alice, task.id, {
      dueAt: null,
      version: 3,
    });
    expect(scheduled.version).toBe(4);
    await expect(
      core.assignTask(alice, task.id, { workerId: null, version: 2 }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
  it("versioned board transitions preserve real review rules and active context", async () => {
    let task = await create("Agent contract", { workerId: agentId });
    const run = await core.startRun(alice, task.id, {});
    task = await core.getTask(alice, task.id);
    expect(task.version).toBe(2);
    expect(await core.getTaskAccess(alice, task.id)).toMatchObject({
      canEdit: false,
      canEditMetadata: true,
      allowedStatuses: [],
    });
    await expect(
      core.updateTask(alice, task.id, {
        version: task.version,
        description: "Changed requirements",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      core.updateTask(alice, task.id, {
        version: task.version,
        status: "done",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    task = await core.updateTask(alice, task.id, {
      version: task.version,
      priority: 2,
    });
    expect(task.version).toBe(3);
    await core.controlRun(alice, run.id, {
      version: run.version,
      action: "cancel",
    });
    task = await core.getTask(alice, task.id);
    expect(task.version).toBe(4);
    await expect(
      core.updateTask(alice, task.id, {
        version: task.version,
        status: "done",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    const human = await create("Board");
    const moved = await core.updateTask(alice, human.id, {
      version: human.version,
      status: "in_progress",
    });
    expect(moved).toMatchObject({ status: "in_progress", version: 2 });
  });
  it("guests read but cannot write, assigned agents share the same field/comment path", async () => {
    const task = await create("Permission target", { workerId: agentId });
    expect((await core.getTask(guest, task.id)).id).toBe(task.id);
    expect(await core.getWorkspaceAccess(guest, w)).toEqual({
      canCreateTasks: false,
      canManageProjects: false,
      canInvite: false,
      canManageRoles: false,
    });
    expect(await core.getTaskAccess(guest, task.id)).toMatchObject({
      canEdit: false,
      canEditMetadata: false,
      canComment: false,
      canAssign: false,
      allowedStatuses: [],
    });
    await expect(
      core.addTaskComment(guest, task.id, { body: "Forbidden" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.createTask(guest, {
        workspaceId: w,
        ownerId: guestMember,
        workerId: null,
        title: "Guest create",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const edited = await core.updateTask(agent, task.id, {
      version: 1,
      description: "Agent proposed plan",
    });
    expect(edited.version).toBe(2);
    await expect(
      core.updateTask(agent, task.id, { version: 2, ownerId: bobMember }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const comment = await core.addTaskComment(agent, task.id, {
      body: "Actual agent comment",
    });
    expect(comment.authorId).toBe(agentId);
    await core.addTaskComment(bob, task.id, { body: "Human member comment" });
    expect(await core.listTaskComments(guest, task.id)).toHaveLength(2);
    const other = await create("Other worker");
    await expect(
      core.updateTask(agent, other.id, { version: 1, title: "Take over" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("project version races and archive preserve tasks while preventing new assignment", async () => {
    const project = await core.createProject(alice, w, { name: "Archive me" });
    const task = await create("Existing", { projectId: project.id });
    await expect(
      core.createProject(bob, w, { name: "Denied" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.createProject(agent, w, { name: "Denied" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const updated = await core.updateProject(alice, project.id, {
      version: 1,
      name: "Archived",
      archived: true,
    });
    expect(updated).toMatchObject({ version: 2, archived: true });
    expect((await core.getTask(alice, task.id)).projectId).toBe(project.id);
    expect(
      await core.updateTask(alice, task.id, {
        version: task.version,
        projectId: project.id,
        priority: 2,
      }),
    ).toMatchObject({ projectId: project.id, priority: 2 });
    await expect(
      core.updateProject(alice, project.id, { version: 1, name: "Stale" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      create("New assignment", { projectId: project.id }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("authorized literal search ranks title and matches task/review comments without leakage", async () => {
    const keyword = `needle-${randomUUID()}`;
    const title = await create(keyword);
    const description = await create("Description match", {
      description: `before ${keyword} after`,
    });
    const commented = await create("Comment match");
    await core.addTaskComment(bob, commented.id, {
      body: `${"prefix ".repeat(60)}${keyword} evidence`,
    });
    const privateOwner = (await core.getMe(outsiderId)).workspaces[0].memberId;
    const privateTask = await core.createTask(outsider, {
      workspaceId: otherW,
      ownerId: privateOwner,
      workerId: null,
      title: keyword,
    });
    const hits = await core.search(alice, w, {
      query: keyword,
      scope: "all",
      limit: 50,
    });
    expect(hits.map((h) => h.taskId)).toEqual([
      title.id,
      description.id,
      commented.id,
    ]);
    expect(hits[2].snippet).toContain(keyword);
    expect(hits.every((h) => h.taskId !== privateTask.id)).toBe(true);
    expect(
      await core.search(agent, w, { query: keyword, scope: "all", limit: 50 }),
    ).toHaveLength(3);
    expect(
      await core.search(alice, w, {
        query: "%",
        scope: "workspace",
        limit: 50,
      }),
    ).toEqual([]);
    await expect(
      core.search(outsider, w, { query: keyword, scope: "all", limit: 50 }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("workspace create provisions creator and fresh selected agents atomically", async () => {
    const created = await core.createWorkspace(alice, {
      name: "New organization",
      agentIds: [agentId],
    });
    const roster = await core.listMembers(alice, created.id);
    expect(roster).toHaveLength(2);
    expect(roster[0]).toMatchObject({
      id: created.memberId,
      userId: aliceId,
      role: "admin",
    });
    expect(roster[1]).toMatchObject({
      kind: "agent",
      name: "Research Agent",
      role: "member",
    });
    expect(roster[1].id).not.toBe(agentId);
    const profile = await core.getAgentProfile(alice, roster[1].id);
    expect(profile.grants).toEqual([]);
    expect(profile.reviewPolicy).toBe("always_review");
    await expect(
      core.createWorkspace(bob, {
        name: "Copy unauthorized",
        agentIds: [agentId],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.createWorkspace(agent, { name: "Agent org" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      (await core.getMe(aliceId)).workspaces.some(
        (row) => row.id === created.id,
      ),
    ).toBe(true);
  });
  it("invitations show token only once and accept atomically with affected-user routing", async () => {
    const ws = await core.createWorkspace(alice, { name: "Invited org" });
    const issued = await core.createWorkspaceInvite(alice, ws.id, {
      email: bobEmail.toUpperCase(),
      role: "member",
    });
    const list = await core.listWorkspaceInvites(alice, ws.id);
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual([
      "createdAt",
      "email",
      "expiresAt",
      "id",
      "role",
      "status",
      "workspaceId",
    ]);
    expect(workspaceInviteSchema.parse(list[0])).toEqual(list[0]);
    const [stored] = await connection.db
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.id, issued.id));
    expect(stored.hash).not.toBe(issued.token);
    expect(stored.hash).toHaveLength(64);
    await expect(
      core.acceptWorkspaceInvite(outsider, { token: issued.token }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const result = await core.acceptWorkspaceInvite(bob, {
      token: issued.token,
    });
    expect(result.id).toBe(ws.id);
    await expect(
      core.acceptWorkspaceInvite(bob, { token: issued.token }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      (await core.getMe(bobId)).workspaces.some((row) => row.id === ws.id),
    ).toBe(true);
    await vi.waitFor(() =>
      expect(events).toContainEqual(
        expect.objectContaining({
          workspaceId: ws.id,
          resourceId: result.memberId,
          action: "members.insert",
          userId: bobId,
        }),
      ),
    );
    expect(
      events
        .filter((e) => e.resourceId === issued.id)
        .every(
          (e) =>
            !JSON.stringify(e).includes(issued.token) &&
            !JSON.stringify(e).includes(bobEmail),
        ),
    ).toBe(true);
  });
  it("invitation concurrent acceptance is single-use; expired/revoked links never join", async () => {
    const ws = await core.createWorkspace(alice, {
      name: "Concurrent invites",
    });
    const issue = await core.createWorkspaceInvite(alice, ws.id, {
      email: outsiderEmail,
      role: "guest",
    });
    const results = await Promise.allSettled([
      core.acceptWorkspaceInvite(outsider, { token: issue.token }),
      core.acceptWorkspaceInvite(outsider, { token: issue.token }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await core.listMembers(alice, ws.id)).filter(
        (m) => m.userId === outsiderId,
      ),
    ).toHaveLength(1);
    const expiredWs = await core.createWorkspace(alice, { name: "Expired" });
    const expired = await core.createWorkspaceInvite(alice, expiredWs.id, {
      email: outsiderEmail,
      role: "member",
    });
    await connection.db.transaction(async (tx) => {
      await actor(tx);
      await tx
        .update(workspaceInvites)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(workspaceInvites.id, expired.id));
    });
    expect(
      (await core.listWorkspaceInvites(alice, expiredWs.id))[0].status,
    ).toBe("expired");
    await expect(
      core.acceptWorkspaceInvite(outsider, { token: expired.token }),
    ).rejects.toMatchObject({ code: "conflict" });
    const revoked = await core.createWorkspaceInvite(alice, expiredWs.id, {
      email: bobEmail,
      role: "admin",
    });
    await core.revokeWorkspaceInvite(alice, revoked.id);
    await expect(
      core.acceptWorkspaceInvite(bob, { token: revoked.token }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      core.createWorkspaceInvite(guest, w, {
        email: outsiderEmail,
        role: "admin",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("workspace locking prevents concurrent admins from demoting the last admin", async () => {
    const ws = await core.createWorkspace(alice, { name: "Last admin race" });
    const invite = await core.createWorkspaceInvite(alice, ws.id, {
      email: bobEmail,
      role: "admin",
    });
    const joined = await core.acceptWorkspaceInvite(bob, {
      token: invite.token,
    });
    const results = await Promise.allSettled([
      core.updateMemberRole(alice, ws.id, ws.memberId, { role: "member" }),
      core.updateMemberRole(bob, ws.id, joined.memberId, { role: "member" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await core.listMembers(alice, ws.id)).filter(
        (m) => m.kind === "person" && m.role === "admin",
      ),
    ).toHaveLength(1);
    const admin = (await core.listMembers(alice, ws.id)).find(
      (m) => m.role === "admin",
    )!;
    await expect(
      core.updateMemberRole(
        admin.userId === aliceId ? alice : bob,
        ws.id,
        admin.id,
        { role: "guest" },
      ),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      core.updateMemberRole(alice, w, agentId, { role: "admin" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("new tables emit only safe committed events and rollback leaves no rows/activity/notification", async () => {
    const project = await core.createProject(alice, w, {
      name: "Notify project",
    });
    await vi.waitFor(() =>
      expect(
        events.some(
          (e) => e.resourceId === project.id && e.action === "projects.insert",
        ),
      ).toBe(true),
    );
    const id = randomUUID();
    await expect(
      connection.db.transaction(async (tx) => {
        await actor(tx);
        await tx
          .insert(projects)
          .values({ id, workspaceId: w, name: "Rollback" });
        throw new Error("rollback M5");
      }),
    ).rejects.toThrow("rollback M5");
    expect(
      await connection.db.select().from(projects).where(eq(projects.id, id)),
    ).toEqual([]);
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.resourceId, id)),
    ).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(events.some((e) => e.resourceId === id)).toBe(false);
    expect(events.every((e) => changeEventSchema.safeParse(e).success)).toBe(
      true,
    );
  });
  it("core quick add resolves only current workspace and uses user time zone", async () => {
    await core.updateProfile(aliceId, {
      locale: "zh-HK",
      tz: "Asia/Singapore",
    });
    const parsed = await core.parseQuickAdd(alice, w, {
      text: "交付報告 明天 下午2點半 @Research !high",
    });
    expect(parsed).toMatchObject({
      title: "交付報告",
      ownerId: owner,
      workerId: agentId,
      priority: 2,
      dueTime: "14:30",
      warnings: [],
    });
    expect(parsed.dueAt).toContain("T06:30:00.000Z");
    const other = await core.parseQuickAdd(outsider, otherW, {
      text: "Do @Research",
    });
    expect(other.workerId).toBeNull();
    expect(other.warnings).toContain("unknown_member");
  });
  it("completed parent forbids child reopening through new, legacy and run writes", async () => {
    const parent = await create("Completed parent");
    const child = await create("Completed child", { parentId: parent.id });
    let done = await core.updateTaskStatus(alice, child.id, { status: "done" });
    await core.updateTaskStatus(alice, parent.id, { status: "done" });
    await expect(
      core.updateTask(alice, child.id, {
        version: done.version,
        status: "todo",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      core.updateTaskStatus(alice, child.id, { status: "in_progress" }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect((await core.getTaskAccess(alice, child.id)).allowedStatuses).toEqual(
      ["done"],
    );
    done = await core.assignTask(alice, child.id, { workerId: agentId });
    await expect(core.startRun(alice, child.id, {})).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await core.listRuns(alice, w)).not.toContainEqual(
      expect.objectContaining({ taskId: child.id }),
    );
    await core.updateTaskStatus(alice, parent.id, { status: "todo" });
    const reopened = await core.updateTask(alice, child.id, {
      version: done.version,
      status: "in_progress",
    });
    expect(reopened.status).toBe("in_progress");
  });
  it("concurrent parent completion and sibling reopening always preserves done-parent invariant", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const parent = await create(`Race parent ${attempt}`);
      const children = await Promise.all([
        create("Race child A", { parentId: parent.id }),
        create("Race child B", { parentId: parent.id }),
      ]);
      for (const child of children)
        await core.updateTaskStatus(alice, child.id, { status: "done" });
      const operations = [
        () => core.updateTaskStatus(alice, parent.id, { status: "done" }),
        ...children.map(
          (child) => () =>
            core.updateTaskStatus(alice, child.id, { status: "todo" }),
        ),
      ];
      if (attempt % 2) operations.reverse();
      const results = await Promise.allSettled(
        operations.map((operation) => operation()),
      );
      expect(results.some((result) => result.status === "fulfilled")).toBe(
        true,
      );
      for (const result of results)
        if (result.status === "rejected")
          expect(result.reason).toMatchObject({ code: "conflict" });
      const storedParent = await core.getTask(alice, parent.id);
      const storedChildren = await core.listTasks(alice, w, {
        parentId: parent.id,
      });
      expect(
        storedParent.status !== "done" ||
          storedChildren.every((child) => child.status === "done"),
      ).toBe(true);
    }
  });
  it("review completion advances task version and submitted context remains locked", async () => {
    let task = await create("Actual reviewed deliverable", {
      workerId: agentId,
    });
    let run = await core.startRun(alice, task.id, {});
    const artifactResult = await core.attachRunArtifact(agent, run.id, {
      version: run.version,
      name: "report.txt",
      mimeType: "text/plain",
      content: "Actual text",
      diff: null,
      sourceUrl: null,
    });
    run = await core.submitRun(agent, run.id, {
      version: (await core.getRun(alice, run.id)).run.version,
      summary: "Evidence",
      requestReview: true,
    });
    task = await core.getTask(alice, task.id);
    expect(task).toMatchObject({ version: 3, status: "needs_review" });
    await expect(
      core.updateTask(alice, task.id, {
        version: 3,
        title: "Stale requirements",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    await core.addReviewComment(alice, run.id, {
      version: run.version,
      body: "Review-search-unique-evidence",
    });
    const hits = await core.search(alice, w, {
      query: "Review-search-unique-evidence",
      scope: "workspace",
      types: ["comment"],
      limit: 50,
    });
    expect(hits).toContainEqual(
      expect.objectContaining({ taskId: task.id, match: "comment" }),
    );
    const reviewed = await core.reviewRun(alice, run.id, {
      version: (await core.getRun(alice, run.id)).run.version,
      decision: "approve",
      checks: {
        matchesDescription: true,
        verifiable: true,
        withinPermissions: true,
      },
      comment: "",
      items: [
        { artifactId: artifactResult.id, decision: "approve", comment: "" },
      ],
    });
    expect(reviewed.status).toBe("completed");
    expect(await core.getTask(alice, task.id)).toMatchObject({
      version: 4,
      status: "done",
    });
  });
  it("today search never drops its date predicate when Havana midnight is skipped", async () => {
    await core.updateProfile(aliceId, { locale: "en", tz: "America/Havana" });
    const keyword = `havana-${randomUUID()}`;
    const seventh = await create(keyword, {
      dueAt: "2026-03-08T04:30:00.000Z",
    });
    const eighth = await create(keyword, { dueAt: "2026-03-08T06:30:00.000Z" });
    await create(keyword, { dueAt: "2026-03-09T06:30:00.000Z" });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-03-07T12:00:00.000Z"));
      expect(
        (
          await core.search(alice, w, {
            query: `${keyword} is:today`,
            scope: "workspace",
            limit: 50,
          })
        ).map((hit) => hit.taskId),
      ).toEqual([seventh.id]);
      vi.setSystemTime(new Date("2026-03-08T12:00:00.000Z"));
      expect(
        (
          await core.search(alice, w, {
            query: `${keyword} is:today`,
            scope: "workspace",
            limit: 50,
          })
        ).map((hit) => hit.taskId),
      ).toEqual([eighth.id]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("today search respects Intl fixed-offset zones instead of PostgreSQL POSIX sign", async () => {
    await core.updateProfile(aliceId, { locale: "en", tz: "+08:00" });
    const keyword = `offset-${randomUUID()}`;
    const localToday = await create(keyword, {
      dueAt: "2026-10-08T20:00:00.000Z",
    });
    await create(keyword, { dueAt: "2026-10-09T20:00:00.000Z" });
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-08T18:00:00.000Z"));
      expect(
        (
          await core.search(alice, w, {
            query: `${keyword} is:today`,
            scope: "workspace",
            limit: 50,
          })
        ).map((hit) => hit.taskId),
      ).toEqual([localToday.id]);
    } finally {
      vi.useRealTimers();
    }
  });
});
