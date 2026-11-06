import { randomUUID } from "node:crypto";
import { connectDatabase, members, tasks, workspaces } from "@taff/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("isolated _test database required");
describe.skipIf(!url)("workspace archive concurrency", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let alice: string;
  let bob: string;
  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "workspace-concurrency-secret-at-least-32-chars",
      tokenPepper: "workspace-concurrency-pepper",
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
    alice = await signup("Archive Alice");
    bob = await signup("Archive Bob");
  });
  afterAll(async () => {
    await core?.close();
    await connection?.close();
  });
  const blockedBy = async (pid: number) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const rows =
        await connection.client`select pid from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))`;
      if (rows.length) return Number(rows[0].pid);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Expected workspace transaction to block");
  };
  it("waits for an in-flight task mutation before completing archive", async () => {
    const workspace = await core.createWorkspace(userPrincipal(alice), {
      name: `Archive wait ${randomUUID()}`,
    });
    const task = await core.createTask(userPrincipal(alice), {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      workerId: null,
      title: "In flight",
    });
    let release!: () => void;
    let ready!: (pid: number) => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<number>((resolve) => {
      ready = resolve;
    });
    const blocker = connection.db.transaction(async (tx) => {
      await tx.select().from(tasks).where(eq(tasks.id, task.id)).for("update");
      const rows = await tx.execute(sql`select pg_backend_pid() as pid`);
      ready(Number(rows[0].pid));
      await held;
    });
    const taskPid = await locked;
    const mutation = core.updateTaskStatus(userPrincipal(alice), task.id, {
      status: "in_progress",
      version: task.version,
    });
    let archive: ReturnType<typeof core.archiveWorkspace> | undefined;
    try {
      const mutationPid = await blockedBy(taskPid);
      archive = core.archiveWorkspace(userPrincipal(alice), workspace.id);
      await blockedBy(mutationPid);
      release();
      await blocker;
      expect((await mutation).status).toBe("in_progress");
      await archive;
      await expect(
        core.updateTaskStatus(userPrincipal(alice), task.id, {
          status: "todo",
        }),
      ).rejects.toMatchObject({ status: 404 });
    } finally {
      release();
      await blocker;
      await Promise.allSettled([mutation, archive]);
    }
  });
  it("rechecks archive authority after a queued member demotion", async () => {
    const workspace = await core.createWorkspace(userPrincipal(alice), {
      name: `Archive demotion ${randomUUID()}`,
    });
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id', ${alice}, true)`);
      await tx.insert(members).values({
        workspaceId: workspace.id,
        userId: bob,
        name: "Archive Bob",
        kind: "person",
        role: "admin",
      });
    });
    let release!: () => void;
    let ready!: (pid: number) => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const locked = new Promise<number>((resolve) => {
      ready = resolve;
    });
    const blocker = connection.db.transaction(async (tx) => {
      await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspace.id))
        .for("update");
      const rows = await tx.execute(sql`select pg_backend_pid() as pid`);
      ready(Number(rows[0].pid));
      await held;
    });
    const workspacePid = await locked;
    const demotion = core.updateMemberRole(
      userPrincipal(bob),
      workspace.id,
      workspace.memberId,
      { role: "member" },
    );
    let archive: Promise<unknown> | undefined;
    try {
      const demotionPid = await blockedBy(workspacePid);
      archive = core.archiveWorkspace(userPrincipal(alice), workspace.id).then(
        () => ({ status: "unexpected_success" }),
        (error: unknown) => error,
      );
      await blockedBy(demotionPid);
      release();
      await blocker;
      await demotion;
      expect(await archive).toMatchObject({ status: 403 });
      const [row] = await connection.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspace.id));
      expect(row.archivedAt).toBeNull();
    } finally {
      release();
      await blocker;
      await Promise.allSettled([demotion, archive]);
    }
  });
  it("completes concurrent archives without upgrading a shared lifecycle lock", async () => {
    const first = await core.createWorkspace(userPrincipal(alice), {
      name: `Archive parallel A ${randomUUID()}`,
    });
    const second = await core.createWorkspace(userPrincipal(alice), {
      name: `Archive parallel B ${randomUUID()}`,
    });
    expect(
      await Promise.all([
        core.archiveWorkspace(userPrincipal(alice), first.id),
        core.archiveWorkspace(userPrincipal(alice), second.id),
      ]),
    ).toEqual([
      { id: first.id, archived: true },
      { id: second.id, archived: true },
    ]);
  });
});
