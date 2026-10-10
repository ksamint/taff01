import { randomUUID } from "node:crypto";
import { activity, connectDatabase, tasks } from "@taff/db";
import type { ChangeEvent } from "@taff/schemas";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, userPrincipal } from "./index";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  console.warn(
    "SKIP task number rollback tests: TEST_DATABASE_URL is not configured",
  );
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error(
    "TEST_DATABASE_URL must point to a separate database ending in _test",
  );

type Fixture = { userId: string; workspaceId: string; ownerId: string };

describe.skipIf(!databaseUrl)("task numbering after an image rollback", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let fixture: Fixture;
  const notifications: ChangeEvent[] = [];

  async function person(): Promise<Fixture> {
    const signup = await core.auth.api.signUpEmail({
      body: {
        name: "Rollback compatibility",
        email: `${randomUUID()}@test.local`,
        password: `test-${randomUUID()}`,
      },
    });
    const workspace = (await core.getMe(signup.user.id)).workspaces[0];
    return {
      userId: signup.user.id,
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
    };
  }

  // The 55b315b API's schema has no number column. Reproduce its INSERT with
  // defaults and optional fields, without using the current Drizzle task shape.
  async function legacyCreate(f: Fixture, parentId: string | null = null) {
    return connection.client.begin(async (tx) => {
      await tx`set local lock_timeout = '5s'`;
      await tx`select set_config('taff.actor_id', ${f.userId}, true)`;
      const [task] = await tx<{ id: string; number: number }[]>`
        insert into tasks (workspace_id, title, description, priority, labels,
          project_id, parent_id, owner_id, worker_id, due_at)
        values (${f.workspaceId}, 'Legacy task', '', 3, ARRAY[]::text[],
          null, ${parentId}, ${f.ownerId}, null, null)
        returning id, number
      `;
      return task;
    });
  }

  async function currentCreate(f: Fixture, parentId?: string) {
    return core.createTask(userPrincipal(f.userId), {
      workspaceId: f.workspaceId,
      ownerId: f.ownerId,
      workerId: null,
      dueAt: null,
      parentId,
      title: "Current task",
    });
  }

  beforeAll(async () => {
    await migrateDatabase(databaseUrl!);
    connection = connectDatabase(databaseUrl!);
    core = createCore({
      databaseUrl: databaseUrl!,
      authUrl: "http://localhost:3000",
      authSecret: "rollback-integration-secret-minimum-32-characters",
      tokenPepper: "rollback-integration-pepper-16-chars",
    });
    await core.subscribeChanges((event) => {
      notifications.push(event);
    });
    fixture = await person();
  });
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });

  it("accepts the legacy insert and keeps its actor, audit and notification", async () => {
    const task = await legacyCreate(fixture);
    expect(task.number).toBe(1);
    const rows = await connection.db
      .select()
      .from(activity)
      .where(eq(activity.resourceId, task.id));
    expect(rows).toMatchObject([
      { actorId: fixture.userId, action: "tasks.insert", details: {} },
    ]);
    await vi.waitFor(() =>
      expect(
        notifications.filter((event) => event.resourceId === task.id),
      ).toMatchObject([
        { action: "tasks.insert", workspaceId: fixture.workspaceId },
      ]),
    );
  });

  it("preserves explicit numbers, uniqueness, NOT NULL updates and transactional audit", async () => {
    const id = randomUUID();
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', ${fixture.userId}, true)`,
      );
      await tx.insert(tasks).values({
        id,
        workspaceId: fixture.workspaceId,
        ownerId: fixture.ownerId,
        number: 100,
        title: "Explicit reference",
      });
    });
    expect((await legacyCreate(fixture)).number).toBe(101);
    await expect(
      connection.client.begin(async (tx) => {
        await tx`select set_config('taff.actor_id', ${fixture.userId}, true)`;
        await tx`insert into tasks (workspace_id, owner_id, title, number)
        values (${fixture.workspaceId}, ${fixture.ownerId}, 'Duplicate', 100)`;
      }),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      connection.client.begin(async (tx) => {
        await tx`select set_config('taff.actor_id', ${fixture.userId}, true)`;
        await tx`update tasks set number = null where id = ${id}`;
      }),
    ).rejects.toMatchObject({ code: "23502" });
    const rollbackId = randomUUID();
    await expect(
      connection.client.begin(async (tx) => {
        await tx`select set_config('taff.actor_id', ${fixture.userId}, true)`;
        await tx`insert into tasks (id, workspace_id, owner_id, title)
        values (${rollbackId}, ${fixture.workspaceId}, ${fixture.ownerId}, 'Rollback')`;
        throw new Error("rollback legacy insert");
      }),
    ).rejects.toThrow("rollback legacy insert");
    const next = await legacyCreate(fixture);
    expect(next.number).toBe(102);
    await vi.waitFor(() =>
      expect(notifications.some((event) => event.resourceId === next.id)).toBe(
        true,
      ),
    );
    expect(
      await connection.db.select().from(tasks).where(eq(tasks.id, rollbackId)),
    ).toEqual([]);
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.resourceId, rollbackId)),
    ).toEqual([]);
    expect(notifications.some((event) => event.resourceId === rollbackId)).toBe(
      false,
    );
  });

  it("serializes mixed legacy/current root and subtask creates independently in two workspaces", async () => {
    const people = await Promise.all([person(), person()]);
    const parents = await Promise.all(people.map((f) => currentCreate(f)));
    const created = await Promise.all(
      people.flatMap((f, workspaceIndex) =>
        Array.from({ length: 16 }, (_, index) => {
          const parent = index >= 8 ? parents[workspaceIndex].id : undefined;
          return index % 2 === 0
            ? legacyCreate(f, parent)
            : currentCreate(f, parent);
        }),
      ),
    );
    expect(created).toHaveLength(32);
    for (const f of people) {
      const rows = await connection.db
        .select()
        .from(tasks)
        .where(eq(tasks.workspaceId, f.workspaceId));
      expect(rows.map((row) => row.number).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 17 }, (_, index) => index + 1),
      );
      expect(rows.filter((row) => row.parentId !== null)).toHaveLength(8);
    }
  });

  it("locks parents before allocating and does not block a separate workspace", async () => {
    const triggers = await connection.client<{ tgname: string }[]>`
      select tgname from pg_trigger where tgrelid = 'tasks'::regclass
        and not tgisinternal and (tgtype & 7) = 7 order by tgname
    `;
    const names = triggers.map((row) => row.tgname);
    expect(names).toContain("tasks_planning_guard");
    expect(names.indexOf("tasks_reference_number")).toBeGreaterThan(
      names.indexOf("tasks_planning_guard"),
    );
    const other = await person();
    let release!: () => void;
    let locked!: () => void;
    const ready = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocker = connection.client.begin(async (tx) => {
      await tx`select id from workspaces where id = ${fixture.workspaceId} for update`;
      locked();
      await gate;
    });
    try {
      await ready;
      const task = await legacyCreate(other);
      expect(task.number).toBe(1);
    } finally {
      release();
      await blocker;
    }
  });
});
