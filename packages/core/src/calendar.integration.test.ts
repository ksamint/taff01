import { randomUUID } from "node:crypto";
import {
  activity,
  connectDatabase,
  members,
  taskCalendar,
  tasks,
} from "@taff/db";
import {
  type CalendarScheduleInput,
  type ChangeEvent,
  calendarViewDataSchema,
} from "@taff/schemas";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url) console.warn("SKIP M6 PostgreSQL tests: TEST_DATABASE_URL required");
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("M6 tests require isolated _test database");
const block: CalendarScheduleInput = {
  startAt: "2026-10-09T01:00:00Z",
  endAt: "2026-10-09T02:00:00Z",
  timeZone: "Asia/Singapore",
  rrule: null,
};
const range = { from: "2026-10-08T16:00:00Z", to: "2026-10-09T16:00:00Z" };
describe.skipIf(!url)("M6 PostgreSQL calendar", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let person: Principal;
  let member: Principal;
  let guest: Principal;
  let outsider: Principal;
  let agent: Principal;
  let calendarOnly: Principal;
  let writeOnly: Principal;
  let userId: string;
  let w: string;
  let ownerId: string;
  let memberId: string;
  let guestId: string;
  let agentId: string;
  const changes: ChangeEvent[] = [];
  const actor = (
    tx: Parameters<
      Parameters<ReturnType<typeof connectDatabase>["db"]["transaction"]>[0]
    >[0],
  ) => tx.execute(sql`select set_config('taff.actor_id',${userId},true)`);
  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    const [version] = await connection.client`show server_version_num`;
    expect(Number(version.server_version_num)).toBeGreaterThanOrEqual(180000);
    expect(Number(version.server_version_num)).toBeLessThan(190000);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "m6-test-secret-longer-than-thirty-two-characters",
      tokenPepper: "m6-test-pepper-at-least-sixteen",
    });
    await core.subscribeChanges((e) => {
      changes.push(e);
    });
    const signup = async (name: string) =>
      core.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
    const p = await signup("M6 owner");
    userId = p.user.id;
    person = userPrincipal(userId);
    const me = await core.getMe(userId);
    w = me.workspaces[0].id;
    ownerId = me.workspaces[0].memberId;
    const m = await signup("M6 member");
    member = userPrincipal(m.user.id);
    const g = await signup("M6 guest");
    guest = userPrincipal(g.user.id);
    const o = await signup("M6 outsider");
    outsider = userPrincipal(o.user.id);
    await connection.db.transaction(async (tx) => {
      await actor(tx);
      const [membership] = await tx
        .insert(members)
        .values({
          workspaceId: w,
          userId: m.user.id,
          name: m.user.name,
          kind: "person",
        })
        .returning();
      memberId = membership.id;
      const [readOnly] = await tx
        .insert(members)
        .values({
          workspaceId: w,
          userId: g.user.id,
          name: g.user.name,
          kind: "person",
          role: "guest",
        })
        .returning();
      guestId = readOnly.id;
      const [worker] = await tx
        .insert(members)
        .values({ workspaceId: w, name: "M6 Calendar Agent", kind: "agent" })
        .returning();
      agentId = worker.id;
    });
    const token = async (
      scopes: Parameters<Core["createAgentToken"]>[1]["scopes"],
    ) => {
      const issued = await core.createAgentToken(person, {
        workspaceId: w,
        memberId: agentId,
        name: "M6 scopes",
        scopes,
      });
      return (await core.authenticateAgentToken(issued.token))!;
    };
    agent = await token(["tasks:read", "tasks:write", "calendar:write"]);
    calendarOnly = await token(["calendar:write"]);
    writeOnly = await token(["tasks:read", "tasks:write"]);
  }, 30000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });
  const create = (
    title: string,
    fields: Partial<Parameters<Core["createTask"]>[1]> = {},
  ) =>
    core.createTask(person, {
      workspaceId: w,
      ownerId,
      workerId: null,
      title,
      ...fields,
    });
  it("atomic task+calendar creates two audits/notifications and leaves deadline independent", async () => {
    const created = await create("Atomic slot", {
      dueAt: "2026-10-10T15:59:59.999Z",
      calendar: { ...block, timeZone: "+0800" },
    });
    expect(created.version).toBe(1);
    const scheduled = await core.getTaskCalendar(person, created.id);
    expect(scheduled).toMatchObject({
      task: { id: created.id, dueAt: created.dueAt, version: 1 },
      schedule: {
        taskId: created.id,
        workspaceId: w,
        startAt: "2026-10-09T01:00:00.000Z",
        endAt: "2026-10-09T02:00:00.000Z",
        timeZone: "+08:00",
        rrule: null,
      },
      canSchedule: true,
    });
    const rows = await connection.db
      .select()
      .from(activity)
      .where(eq(activity.resourceId, created.id));
    expect(rows.map((row) => [row.action, row.actorId])).toEqual([
      ["tasks.insert", userId],
      ["task_calendar.insert", userId],
    ]);
    await vi.waitFor(() =>
      expect(
        changes.filter((e) => e.resourceId === created.id).map((e) => e.action),
      ).toEqual(["tasks.insert", "task_calendar.insert"]),
    );
  });
  it("denied or malformed atomic calendar rolls task and audit back", async () => {
    const title = `denied-slot-${randomUUID()}`;
    await expect(
      core.createTask(member, {
        workspaceId: w,
        ownerId,
        workerId: null,
        title,
        calendar: block,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(
      await connection.db.select().from(tasks).where(eq(tasks.title, title)),
    ).toEqual([]);
    const badTitle = `bad-recurrence-${randomUUID()}`;
    await expect(
      create(badTitle, { calendar: { ...block, rrule: "FREQ=SECONDLY" } }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(
      await connection.db.select().from(tasks).where(eq(tasks.title, badTitle)),
    ).toEqual([]);
    const own = await core.createTask(member, {
      workspaceId: w,
      ownerId: memberId,
      workerId: null,
      title: "Member own slot",
      calendar: block,
    });
    expect((await core.getTaskCalendar(member, own.id)).canSchedule).toBe(true);
  });
  it("schedule and clear advance current Task.version while preserving dueAt", async () => {
    const task = await create("Versioned slot", {
      dueAt: "2026-10-10T15:59:59.999Z",
    });
    const set = await core.setTaskCalendar(person, task.id, {
      version: 1,
      schedule: block,
    });
    expect(set).toMatchObject({
      task: { version: 2, dueAt: task.dueAt },
      schedule: { taskId: task.id },
    });
    await expect(
      core.setTaskCalendar(person, task.id, { version: 1, schedule: null }),
    ).rejects.toMatchObject({ code: "conflict" });
    const resized = await core.setTaskCalendar(person, task.id, {
      version: 2,
      schedule: { ...block, endAt: "2026-10-09T03:00:00Z" },
    });
    expect(resized.task.version).toBe(3);
    const cleared = await core.setTaskCalendar(person, task.id, {
      version: 3,
      schedule: null,
    });
    expect(cleared).toMatchObject({
      task: { version: 4, dueAt: task.dueAt },
      schedule: null,
    });
    const clearAgain = await core.setTaskCalendar(person, task.id, {
      version: 4,
      schedule: null,
    });
    expect(clearAgain.task.version).toBe(5);
    expect(
      await connection.db
        .select()
        .from(taskCalendar)
        .where(eq(taskCalendar.taskId, task.id)),
    ).toEqual([]);
    await vi.waitFor(() =>
      expect(
        changes.filter((e) => e.resourceId === task.id).map((e) => e.action),
      ).toEqual([
        "tasks.insert",
        "task_calendar.insert",
        "tasks.update",
        "task_calendar.update",
        "tasks.update",
        "task_calendar.delete",
        "tasks.update",
        "tasks.update",
      ]),
    );
  });
  it("concurrent schedule/field edits with same task version have one winner", async () => {
    const task = await create("Schedule race");
    const results = await Promise.allSettled([
      core.setTaskCalendar(person, task.id, { version: 1, schedule: block }),
      core.updateTask(person, task.id, { version: 1, title: "Field wins" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results)
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ code: "conflict" });
    expect((await core.getTask(person, task.id)).version).toBe(2);
  });
  it("authoritative read/guest/bystander/token boundaries hold on calendar paths", async () => {
    const task = await create("Calendar permissions", { workerId: agentId });
    await expect(core.listCalendar(outsider, w, range)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(core.getTaskCalendar(outsider, task.id)).rejects.toMatchObject(
      { code: "forbidden" },
    );
    expect((await core.getTaskCalendar(guest, task.id)).canSchedule).toBe(
      false,
    );
    await expect(
      core.setTaskCalendar(guest, task.id, { version: 1, schedule: block }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.setTaskCalendar(member, task.id, { version: 1, schedule: block }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.setTaskCalendar(writeOnly, task.id, { version: 1, schedule: block }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.listCalendar(calendarOnly, w, range),
    ).rejects.toMatchObject({ code: "forbidden" });
    const permitted = await core.setTaskCalendar(calendarOnly, task.id, {
      version: 1,
      schedule: block,
    });
    expect(permitted.task.version).toBe(2);
    expect((await core.getTaskCalendar(agent, task.id)).canSchedule).toBe(true);
    const other = await create("Not assigned");
    await expect(
      core.setTaskCalendar(calendarOnly, other.id, {
        version: 1,
        schedule: block,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.createTask(guest, {
        workspaceId: w,
        ownerId: guestId,
        workerId: null,
        title: "Guest slot",
        calendar: block,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("actual run/task scoped ask grants apply to metadata, expire with run context and cannot widen scope", async () => {
    const task = await create("Scoped calendar", { workerId: agentId });
    const run = await core.startRun(person, task.id, {});
    await expect(
      core.setTaskCalendar(person, task.id, { version: 1, schedule: block }),
    ).rejects.toMatchObject({ code: "conflict" });
    await core.setAgentPermission(person, agentId, {
      capability: "calendar.schedule",
      decision: "ask",
    });
    const current = await core.getTask(person, task.id);
    await expect(
      core.setTaskCalendar(calendarOnly, task.id, {
        version: current.version,
        schedule: block,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const grant = await core.requestGrant(calendarOnly, agentId, {
      capability: "calendar.schedule",
      taskId: task.id,
      runId: run.id,
      reason: "Schedule current task",
    });
    await core.decideGrant(person, grant.id, {
      decision: "allow",
      expiresAt: new Date(Date.now() + 600000).toISOString(),
    });
    const allowed = await core.setTaskCalendar(calendarOnly, task.id, {
      version: current.version,
      schedule: block,
    });
    expect(allowed.canSchedule).toBe(true);
    await expect(
      core.setTaskCalendar(writeOnly, task.id, {
        version: allowed.task.version,
        schedule: block,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await core.setAgentPermission(person, agentId, {
      capability: "calendar.schedule",
      decision: "deny",
    });
    await expect(
      core.setTaskCalendar(calendarOnly, task.id, {
        version: allowed.task.version,
        schedule: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await core.setAgentPermission(person, agentId, {
      capability: "calendar.schedule",
      decision: "ask",
    });
    await core.controlRun(person, run.id, {
      version: (await core.getRun(person, run.id)).run.version,
      action: "cancel",
    });
    const after = await core.getTask(person, task.id);
    await expect(
      core.setTaskCalendar(calendarOnly, task.id, {
        version: after.version,
        schedule: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await core.setAgentPermission(person, agentId, {
      capability: "calendar.schedule",
      decision: "allow",
    });
  });
  it("deadline-only tasks stay unscheduled; occurrences are real zoned schedules with agent lane metadata", async () => {
    const deadline = await create("Deadline only", {
      dueAt: "2026-10-09T15:59:59.999Z",
    });
    const recurring = await create("Agent background", {
      workerId: agentId,
      calendar: { ...block, rrule: "FREQ=DAILY;COUNT=2" },
    });
    const data = await core.listCalendar(person, w, range);
    expect(calendarViewDataSchema.safeParse(data).success).toBe(true);
    expect(data.unscheduled).toContainEqual(
      expect.objectContaining({
        task: expect.objectContaining({ id: deadline.id }),
        schedule: null,
        canSchedule: true,
      }),
    );
    expect(data.occurrences).not.toContainEqual(
      expect.objectContaining({
        task: expect.objectContaining({ id: deadline.id }),
      }),
    );
    expect(data.occurrences).toContainEqual(
      expect.objectContaining({
        id: `${recurring.id}:2026-10-09T01:00:00.000Z`,
        isAgent: true,
        canSchedule: true,
        schedule: expect.objectContaining({ taskId: recurring.id }),
      }),
    );
    expect(
      (await core.listCalendar(guest, w, range)).occurrences.every(
        (event) => event.canSchedule === false,
      ),
    ).toBe(true);
  });
  it("recurrence uses its saved zone after profile changes and completion hides whole series", async () => {
    const task = await create("Saved timezone", {
      calendar: {
        startAt: "2026-03-06T14:00:00Z",
        endAt: "2026-03-06T15:00:00Z",
        timeZone: "America/New_York",
        rrule: "FREQ=DAILY;COUNT=4",
      },
    });
    await core.updateProfile(userId, { locale: "zh-HK", tz: "Asia/Tokyo" });
    const data = await core.listCalendar(person, w, {
      from: "2026-03-06T00:00:00Z",
      to: "2026-03-11T00:00:00Z",
    });
    expect(
      data.occurrences
        .filter((o) => o.task.id === task.id)
        .map((o) => o.startAt),
    ).toEqual([
      "2026-03-06T14:00:00.000Z",
      "2026-03-07T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-09T13:00:00.000Z",
    ]);
    await core.updateTaskStatus(person, task.id, { status: "done" });
    expect(
      (
        await core.listCalendar(person, w, {
          from: "2026-03-06T00:00:00Z",
          to: "2026-03-11T00:00:00Z",
        })
      ).occurrences.filter((o) => o.task.id === task.id),
    ).toEqual([]);
    expect(
      (await core.getTaskCalendar(person, task.id)).schedule,
    ).not.toBeNull();
  });
  it("calendar mutation rollback emits no event and leaves neither schedule nor task version change", async () => {
    const task = await create("Calendar rollback");
    await expect(
      connection.db.transaction(async (tx) => {
        await actor(tx);
        await tx.insert(taskCalendar).values({
          taskId: task.id,
          workspaceId: w,
          startAt: new Date(block.startAt),
          endAt: new Date(block.endAt),
          timeZone: block.timeZone,
        });
        await tx
          .update(tasks)
          .set({ updatedAt: new Date() })
          .where(eq(tasks.id, task.id));
        throw new Error("rollback M6");
      }),
    ).rejects.toThrow("rollback M6");
    expect((await core.getTaskCalendar(person, task.id)).schedule).toBeNull();
    expect((await core.getTask(person, task.id)).version).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(
      changes.filter((e) => e.resourceId === task.id).map((e) => e.action),
    ).toEqual(["tasks.insert"]);
  });
  it("database guards reject cross-workspace/negative durations and invalid body produces no audit", async () => {
    const workspace = await core.createWorkspace(person, {
      name: "Calendar foreign FK",
    });
    const task = await create("FK guard");
    await expect(
      connection.db.transaction(async (tx) => {
        await actor(tx);
        await tx.insert(taskCalendar).values({
          taskId: task.id,
          workspaceId: workspace.id,
          startAt: new Date(block.startAt),
          endAt: new Date(block.endAt),
          timeZone: "UTC",
        });
      }),
    ).rejects.toThrow();
    await expect(
      connection.db.transaction(async (tx) => {
        await actor(tx);
        await tx.insert(taskCalendar).values({
          taskId: task.id,
          workspaceId: w,
          startAt: new Date(block.endAt),
          endAt: new Date(block.startAt),
          timeZone: "UTC",
        });
      }),
    ).rejects.toThrow();
    await expect(
      core.setTaskCalendar(person, task.id, {
        version: 1,
        schedule: { ...block, endAt: block.startAt },
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect((await core.getTask(person, task.id)).version).toBe(1);
  });
  it.each(["2026-03-07T14:00:00Z", "2026-10-31T13:00:00Z"])(
    "database duration stays exactly168h under NY session timezone across DST %s",
    async (startAt) => {
      const task = await create("Elapsed duration guard");
      const endAt = new Date(Date.parse(startAt) + 168 * 3600000);
      await connection.db.transaction(async (tx) => {
        await actor(tx);
        await tx.execute(sql`SET LOCAL TIME ZONE 'America/New_York'`);
        await tx.insert(taskCalendar).values({
          taskId: task.id,
          workspaceId: w,
          startAt: new Date(startAt),
          endAt,
          timeZone: "America/New_York",
        });
      });
      await expect(
        connection.db.transaction(async (tx) => {
          await actor(tx);
          await tx.execute(sql`SET LOCAL TIME ZONE 'America/New_York'`);
          await tx
            .update(taskCalendar)
            .set({ endAt: new Date(endAt.getTime() + 1) })
            .where(eq(taskCalendar.taskId, task.id));
        }),
      ).rejects.toThrow();
      expect(
        (await core.getTaskCalendar(person, task.id)).schedule?.endAt,
      ).toBe(endAt.toISOString());
    },
  );
  async function bulkWorkspace(
    name: string,
    count: number,
    series: boolean,
    startAt: string,
  ) {
    const workspace = await core.createWorkspace(person, { name });
    await connection.db.transaction(async (tx) => {
      await actor(tx);
      const ids = Array.from({ length: count }, () => randomUUID());
      await tx.insert(tasks).values(
        ids.map((id) => ({
          id,
          workspaceId: workspace.id,
          title: "Bounded calendar",
          ownerId: workspace.memberId,
        })),
      );
      await tx.insert(taskCalendar).values(
        ids.map((id, index) => ({
          taskId: id,
          workspaceId: workspace.id,
          startAt: new Date(Date.parse(startAt) + (series ? 0 : index * 60000)),
          endAt: new Date(
            Date.parse(startAt) + (series ? 3600000 : index * 60000 + 3600000),
          ),
          timeZone: "UTC",
          rrule: series ? "FREQ=DAILY" : null,
        })),
      );
    });
    return workspace;
  }
  it("fixed future schedules and future recurrence anchors are filtered before row cap", async () => {
    const ws = await bulkWorkspace(
      "Future-only cap",
      210,
      false,
      "2027-01-01T00:00:00Z",
    );
    const visible = await core.createTask(person, {
      workspaceId: ws.id,
      ownerId: ws.memberId,
      workerId: null,
      title: "Visible one",
      calendar: { ...block, timeZone: "UTC" },
    });
    const future = await core.createTask(person, {
      workspaceId: ws.id,
      ownerId: ws.memberId,
      workerId: null,
      title: "Future recurrence",
      calendar: {
        startAt: "2027-02-01T09:00:00Z",
        endAt: "2027-02-01T10:00:00Z",
        timeZone: "UTC",
        rrule: "FREQ=DAILY",
      },
    });
    const data = await core.listCalendar(person, ws.id, range);
    expect(data.truncated).toBe(false);
    expect(data.occurrences.map((o) => o.task.id)).toEqual([visible.id]);
    expect(data.occurrences.some((o) => o.task.id === future.id)).toBe(false);
  });
  it("bounded row/output/tray caps always mark truncation rather than hiding data", async () => {
    const rows = await bulkWorkspace(
      "Schedule row cap",
      201,
      false,
      "2026-10-09T01:00:00Z",
    );
    const data = await core.listCalendar(person, rows.id, range);
    expect(data.occurrences).toHaveLength(200);
    expect(data.truncated).toBe(true);
    const outputs = await bulkWorkspace(
      "Occurrence cap",
      40,
      true,
      "2026-10-01T09:00:00Z",
    );
    const expanded = await core.listCalendar(person, outputs.id, {
      from: "2026-10-01T00:00:00Z",
      to: "2026-12-02T00:00:00Z",
    });
    expect(expanded.occurrences).toHaveLength(2000);
    expect(expanded.truncated).toBe(true);
    const tray = await core.createWorkspace(person, { name: "Tray cap" });
    await connection.db.transaction(async (tx) => {
      await actor(tx);
      await tx.insert(tasks).values(
        Array.from({ length: 201 }, () => ({
          workspaceId: tray.id,
          title: "Unscheduled",
          ownerId: tray.memberId,
        })),
      );
    });
    const unscheduled = await core.listCalendar(person, tray.id, range);
    expect(unscheduled.unscheduled).toHaveLength(200);
    expect(unscheduled.truncated).toBe(true);
  });
});
