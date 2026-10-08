import {
  type Database,
  members,
  runs,
  type Transaction,
  taskCalendar,
  tasks,
} from "@taff/db";
import {
  type CalendarRange,
  type CalendarSchedule,
  type CalendarScheduleInput,
  type CalendarViewData,
  calendarRangeSchema,
  idSchema,
  SchemaError,
  type SetTaskCalendar,
  setTaskCalendarSchema,
  type Task,
  type TaskCalendar,
} from "@taff/schemas";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  expandCalendarSchedule,
  normalizeCalendarSchedule,
} from "./calendar-recurrence";
import { CoreError, type Principal } from "./index";
import { type Action, type Actor, can, type Resource } from "./permissions";

function parse<T>(schema: { parse(v: unknown): T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw error;
  }
}
function taskDTO(row: typeof tasks.$inferSelect): Task {
  return {
    ...row,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function scheduleDTO(row: typeof taskCalendar.$inferSelect): CalendarSchedule {
  return {
    taskId: row.taskId,
    workspaceId: row.workspaceId,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    timeZone: row.timeZone,
    rrule: row.rrule,
  };
}
type Dependencies = {
  db: Database;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
  lockTask(tx: Transaction, id: string): Promise<typeof tasks.$inferSelect>;
  currentRunId(
    tx: Database | Transaction,
    id: string,
  ): Promise<string | undefined>;
};
export function createCalendarOperations({
  db,
  mutation,
  requireMember,
  lockTask,
  currentRunId,
}: Dependencies) {
  async function storeOnCreate(
    tx: Transaction,
    p: Principal,
    task: typeof tasks.$inferSelect,
    input: CalendarScheduleInput,
  ) {
    const body = normalizeCalendarSchedule(input);
    await requireMember(tx, p, task.workspaceId, "task:schedule", {
      workspaceId: task.workspaceId,
      ownerId: task.ownerId,
      workerId: task.workerId,
      taskId: task.id,
    });
    await tx.insert(taskCalendar).values({
      taskId: task.id,
      workspaceId: task.workspaceId,
      startAt: new Date(body.startAt),
      endAt: new Date(body.endAt),
      timeZone: body.timeZone,
      rrule: body.rrule,
    });
  }
  async function getTaskCalendar(
    p: Principal,
    id: string,
  ): Promise<TaskCalendar> {
    parse(idSchema, id);
    const [row] = await db
      .select({ task: tasks, schedule: taskCalendar })
      .from(tasks)
      .leftJoin(taskCalendar, eq(taskCalendar.taskId, tasks.id))
      .where(eq(tasks.id, id));
    if (!row) throw new CoreError("not_found", 404);
    const actor = await requireMember(
      db,
      p,
      row.task.workspaceId,
      "workspace:read",
      { workspaceId: row.task.workspaceId, taskId: id },
    );
    return {
      task: taskDTO(row.task),
      schedule: row.schedule ? scheduleDTO(row.schedule) : null,
      canSchedule: can(actor, "task:schedule", {
        workspaceId: row.task.workspaceId,
        ownerId: row.task.ownerId,
        workerId: row.task.workerId,
        taskId: id,
        runId: await currentRunId(db, id),
      }),
    };
  }
  async function setTaskCalendar(
    p: Principal,
    id: string,
    input: SetTaskCalendar,
  ): Promise<TaskCalendar> {
    const body = parse(setTaskCalendarSchema, input);
    return mutation(p, async (tx) => {
      const task = await lockTask(tx, id);
      if (task.version !== body.version) throw new CoreError("conflict", 409);
      await requireMember(tx, p, task.workspaceId, "task:schedule", {
        workspaceId: task.workspaceId,
        ownerId: task.ownerId,
        workerId: task.workerId,
        taskId: id,
        runId: await currentRunId(tx, id),
      });
      let schedule: CalendarSchedule | null = null;
      if (body.schedule) {
        const normalized = normalizeCalendarSchedule(body.schedule);
        const values = {
          taskId: id,
          workspaceId: task.workspaceId,
          startAt: new Date(normalized.startAt),
          endAt: new Date(normalized.endAt),
          timeZone: normalized.timeZone,
          rrule: normalized.rrule,
          updatedAt: new Date(),
        };
        const [row] = await tx
          .insert(taskCalendar)
          .values(values)
          .onConflictDoUpdate({ target: taskCalendar.taskId, set: values })
          .returning();
        schedule = scheduleDTO(row);
      } else await tx.delete(taskCalendar).where(eq(taskCalendar.taskId, id));
      const [updated] = await tx
        .update(tasks)
        .set({ updatedAt: new Date() })
        .where(eq(tasks.id, id))
        .returning();
      return { task: taskDTO(updated), schedule, canSchedule: true };
    });
  }
  async function listCalendar(
    p: Principal,
    w: string,
    input: CalendarRange,
  ): Promise<CalendarViewData> {
    parse(idSchema, w);
    const range = parse(calendarRangeSchema, input);
    const actor = await requireMember(db, p, w, "workspace:read");
    const scheduled = await db
      .select({ task: tasks, schedule: taskCalendar, isAgent: members.kind })
      .from(taskCalendar)
      .innerJoin(
        tasks,
        and(
          eq(tasks.id, taskCalendar.taskId),
          eq(tasks.workspaceId, taskCalendar.workspaceId),
        ),
      )
      .leftJoin(members, eq(members.id, tasks.workerId))
      .where(
        and(
          eq(taskCalendar.workspaceId, w),
          sql`${tasks.status}<>'done'`,
          sql`${taskCalendar.startAt}<${range.to}::timestamptz`,
          or(
            sql`${taskCalendar.rrule} IS NOT NULL`,
            sql`${taskCalendar.endAt}>${range.from}::timestamptz`,
          ),
        ),
      )
      .orderBy(desc(taskCalendar.startAt), taskCalendar.taskId)
      .limit(201);
    const unscheduledRows = await db
      .select({ task: tasks })
      .from(tasks)
      .leftJoin(taskCalendar, eq(taskCalendar.taskId, tasks.id))
      .where(
        and(
          eq(tasks.workspaceId, w),
          sql`${tasks.status}<>'done'`,
          isNull(taskCalendar.taskId),
        ),
      )
      .orderBy(desc(tasks.updatedAt), tasks.id)
      .limit(201);
    const selected = [
      ...scheduled.slice(0, 200).map((row) => row.task.id),
      ...unscheduledRows.slice(0, 200).map((row) => row.task.id),
    ];
    const active = selected.length
      ? await db
          .select({ taskId: runs.taskId, id: runs.id })
          .from(runs)
          .where(
            and(
              eq(runs.workspaceId, w),
              inArray(runs.taskId, selected),
              sql`${runs.status} IN ('running','paused','needs_review','changes_requested')`,
            ),
          )
      : [];
    const runIds = new Map(active.map((run) => [run.taskId, run.id]));
    const canSchedule = (task: typeof tasks.$inferSelect) =>
      can(actor, "task:schedule", {
        workspaceId: w,
        ownerId: task.ownerId,
        workerId: task.workerId,
        taskId: task.id,
        runId: runIds.get(task.id),
      });
    const out: CalendarViewData = {
      occurrences: [],
      unscheduled: unscheduledRows.slice(0, 200).map(({ task }) => ({
        task: taskDTO(task),
        schedule: null,
        canSchedule: canSchedule(task),
      })),
      truncated: scheduled.length > 200 || unscheduledRows.length > 200,
    };
    occurrenceRows: for (const row of scheduled.slice(0, 200)) {
      const schedule = scheduleDTO(row.schedule);
      const expanded = expandCalendarSchedule(schedule, range);
      if (expanded.truncated) out.truncated = true;
      for (const occurrence of expanded.occurrences) {
        if (out.occurrences.length >= 2000) {
          out.truncated = true;
          break occurrenceRows;
        }
        out.occurrences.push({
          ...occurrence,
          id: `${row.task.id}:${occurrence.startAt}`,
          task: taskDTO(row.task),
          schedule,
          canSchedule: canSchedule(row.task),
          isAgent: row.isAgent === "agent",
        });
      }
    }
    out.occurrences.sort(
      (a, b) => a.startAt.localeCompare(b.startAt) || a.id.localeCompare(b.id),
    );
    return out;
  }
  return {
    storeOnCreate,
    operations: { getTaskCalendar, setTaskCalendar, listCalendar },
  };
}
