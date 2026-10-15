import {
  type Database,
  members,
  suggestions,
  type Transaction,
  taskPlans,
  tasks,
} from "@taff/db";
import {
  type CreateTask,
  createTaskSchema,
  idSchema,
  SchemaError,
  type Suggestion,
  type SuggestionApplyResult,
  type SuggestionDecision,
  type SuggestionFilter,
  type SuggestionInput,
  type SuggestionInverse,
  suggestionDecisionSchema,
  suggestionFilterSchema,
  suggestionInputSchema,
  suggestionInverseSchema,
  type Task,
  type TaskPlanInput,
  type TaskPlanResult,
} from "@taff/schemas";
import { and, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import type { Action, Actor, Resource } from "./permissions";

function parse<T>(schema: { parse(v: unknown): T }, v: unknown): T {
  try {
    return schema.parse(v);
  } catch (e) {
    if (e instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw e;
  }
}
const conflict = (): never => {
  throw new CoreError("conflict", 409);
};
const notFound = (): never => {
  throw new CoreError("not_found", 404);
};
type Row = typeof suggestions.$inferSelect;
function dtoSuggestion(row: Row): Suggestion {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    taskId: row.taskId,
    createdBy: row.createdBy,
    kind: row.kind,
    payload: row.payload,
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    undoneAt: row.undoneAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  } as Suggestion;
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
  insertTask(tx: Transaction, p: Principal, body: CreateTask): Promise<Task>;
  applyTaskPlan(
    tx: Transaction,
    p: Principal,
    taskId: string,
    body: TaskPlanInput,
  ): Promise<TaskPlanResult>;
};

/**
 * Agent proposals (M17, plan §4.4). An agent working on a task proposes a
 * split or a reschedule; a person applies it through the normal create and
 * plan paths in one transaction, or dismisses it. Agents get no apply path.
 */
export function createSuggestionOperations({
  db,
  mutation,
  requireMember,
  lockTask,
  currentRunId,
  insertTask,
  applyTaskPlan,
}: Dependencies) {
  async function taskResource(
    q: Database | Transaction,
    task: typeof tasks.$inferSelect,
  ) {
    return {
      workspaceId: task.workspaceId,
      ownerId: task.ownerId,
      workerId: task.workerId,
      taskId: task.id,
      runId: await currentRunId(q, task.id),
    };
  }
  async function createSuggestion(
    p: Principal,
    input: SuggestionInput,
  ): Promise<Suggestion> {
    const body = parse(suggestionInputSchema, input);
    if (p.kind !== "agent") throw new CoreError("forbidden", 403);
    return mutation(p, async (tx) => {
      const task = await lockTask(tx, body.taskId);
      // Another workspace's task stays private.
      if (task.workspaceId !== p.workspaceId) notFound();
      const actor = await requireMember(
        tx,
        p,
        task.workspaceId,
        "suggestion:create",
        await taskResource(tx, task),
      );
      if (task.status === "done") conflict();
      if ("subtasks" in body.payload) {
        // Proposed owners must be people of this workspace; apply re-checks.
        const owners = [
          ...new Set(
            body.payload.subtasks.flatMap((row) =>
              row.ownerId ? [row.ownerId] : [],
            ),
          ),
        ];
        if (owners.length) {
          const found = await tx
            .select({ id: members.id })
            .from(members)
            .where(
              and(
                eq(members.workspaceId, task.workspaceId),
                eq(members.kind, "person"),
                inArray(members.id, owners),
              ),
            );
          if (found.length !== owners.length)
            throw new CoreError("invalid_input", 400);
        }
      }
      const [row] = await tx
        .insert(suggestions)
        .values({
          workspaceId: task.workspaceId,
          taskId: task.id,
          createdBy: actor.id,
          kind: body.kind,
          payload: body.payload,
        })
        .returning();
      return dtoSuggestion(row);
    });
  }
  async function listSuggestions(
    p: Principal,
    workspaceId: string,
    filter: SuggestionFilter = {},
  ): Promise<Suggestion[]> {
    parse(idSchema, workspaceId);
    const body = parse(suggestionFilterSchema, filter);
    await requireMember(db, p, workspaceId, "workspace:read");
    const where: SQL[] = [eq(suggestions.workspaceId, workspaceId)];
    if (body.status) where.push(eq(suggestions.status, body.status));
    if (body.taskId) where.push(eq(suggestions.taskId, body.taskId));
    const rows = await db
      .select()
      .from(suggestions)
      .where(and(...where))
      .orderBy(desc(suggestions.createdAt), suggestions.id)
      .limit(200);
    return rows.map(dtoSuggestion);
  }
  /** Locks a pending suggestion at `version` and its task, and authorizes. */
  async function decide(
    tx: Transaction,
    p: Principal,
    id: string,
    version: number,
  ) {
    const [row] = await tx
      .select()
      .from(suggestions)
      .where(eq(suggestions.id, id))
      .for("update");
    if (!row) notFound();
    if (!row.taskId) notFound();
    const task = await lockTask(tx, row.taskId as string);
    const actor = await requireMember(
      tx,
      p,
      row.workspaceId,
      "suggestion:decide",
      await taskResource(tx, task),
    );
    if (row.status !== "pending" || row.version !== version) conflict();
    return { row, task, actor };
  }
  async function close(
    tx: Transaction,
    row: Row,
    actor: Actor,
    status: "applied" | "dismissed",
    inverse?: SuggestionInverse,
  ) {
    const [updated] = await tx
      .update(suggestions)
      .set({
        status,
        ...(inverse ? { inverse } : {}),
        decidedBy: actor.id,
        decidedAt: new Date(),
        version: row.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(suggestions.id, row.id))
      .returning();
    return dtoSuggestion(updated);
  }
  async function applySuggestion(
    p: Principal,
    id: string,
    input: SuggestionDecision,
  ): Promise<SuggestionApplyResult> {
    parse(idSchema, id);
    const body = parse(suggestionDecisionSchema, input);
    return mutation(p, async (tx) => {
      const { row, task, actor } = await decide(tx, p, id, body.version);
      const created: Task[] = [];
      let plan: TaskPlanResult | null = null;
      let inverse: SuggestionInverse;
      const payload = dtoSuggestion(row);
      if (payload.kind === "split") {
        // The normal create path: the person needs task:create and the
        // parent must be open with no active run, as for any subtask.
        for (const subtask of payload.payload.subtasks)
          created.push(
            await insertTask(
              tx,
              p,
              parse(createTaskSchema, {
                workspaceId: task.workspaceId,
                parentId: task.id,
                title: subtask.title,
                ownerId: subtask.ownerId ?? task.ownerId,
                workerId: null,
                ...(subtask.dueAt ? { dueAt: subtask.dueAt } : {}),
              }),
            ),
          );
        inverse = {
          kind: "split",
          tasks: created.map(({ id, version, updatedAt }) => ({
            id,
            version,
            updatedAt,
          })),
        };
      } else {
        // The normal plan path: task:schedule on the task, applied to the
        // plan as it is now.
        const [current] = await tx
          .select()
          .from(taskPlans)
          .where(eq(taskPlans.taskId, task.id));
        plan = await applyTaskPlan(tx, p, task.id, {
          startDate: payload.payload.startDate,
          durationDays: payload.payload.durationDays,
          ...(current && !current.archivedAt
            ? { version: current.version }
            : {}),
        });
        const after = await lockTask(tx, task.id);
        inverse = {
          kind: "reschedule",
          task: {
            id: after.id,
            version: after.version,
            updatedAt: after.updatedAt.toISOString(),
          },
          dueAt: task.dueAt?.toISOString() ?? null,
          planVersion: plan.plans[0].version,
          plan: current
            ? {
                startDate: current.startDate,
                durationDays: current.durationDays,
                archivedAt: current.archivedAt?.toISOString() ?? null,
              }
            : null,
        };
      }
      return {
        suggestion: await close(tx, row, actor, "applied", inverse),
        tasks: created,
        plan,
      };
    });
  }
  /** Inverse of this apply only. Newer work is never overwritten or hidden. */
  async function undoSuggestion(
    p: Principal,
    id: string,
    input: SuggestionDecision,
  ): Promise<Suggestion> {
    parse(idSchema, id);
    const body = parse(suggestionDecisionSchema, input);
    return mutation(p, async (tx) => {
      const [row] = await tx
        .select()
        .from(suggestions)
        .where(eq(suggestions.id, id))
        .for("update");
      if (!row?.taskId) notFound();
      const task = await lockTask(tx, row.taskId as string);
      await requireMember(
        tx,
        p,
        row.workspaceId,
        "suggestion:undo",
        await taskResource(tx, task),
      );
      if (
        row.status !== "applied" ||
        row.undoneAt ||
        row.version !== body.version ||
        !row.inverse
      )
        conflict();
      const inverse = parse(suggestionInverseSchema, row.inverse);
      const now = new Date();
      if (inverse.kind === "split") {
        // Deterministic locking and all checks precede writes: undo is atomic.
        const children = [];
        for (const expected of [...inverse.tasks].sort((a, b) =>
          a.id.localeCompare(b.id),
        )) {
          const child = await lockTask(tx, expected.id);
          if (
            child.workspaceId !== task.workspaceId ||
            child.parentId !== task.id ||
            child.version !== expected.version ||
            child.updatedAt.toISOString() !== expected.updatedAt
          )
            conflict();
          // Child owners may differ: undo permission is scoped to the parent's
          // generated records, and cannot archive an arbitrary person's task.
          // Any downstream use makes a generated record ineligible, including
          // read-independent links, completed runs, comments and schedules.
          const [used] = await tx.execute<{ used: boolean }>(sql`select (
            exists(select 1 from tasks where parent_id=${child.id}) or
            exists(select 1 from runs where task_id=${child.id}) or
            exists(select 1 from grants where task_id=${child.id}) or
            exists(select 1 from inbox_items where task_id=${child.id}) or
            exists(select 1 from task_comments where task_id=${child.id}) or
            exists(select 1 from task_calendar where id=${child.id}) or
            exists(select 1 from task_plans where id=${child.id}) or
            exists(select 1 from task_contacts where task_id=${child.id}) or
            exists(select 1 from task_dependencies where predecessor_task_id=${child.id} or successor_task_id=${child.id}) or
            exists(select 1 from suggestions where task_id=${child.id}) or
            exists(select 1 from mind_nodes where task_id=${child.id}) or
            exists(select 1 from activity where resource_id=${child.id} and action <> 'tasks.insert')
          ) as used`);
          if (used?.used) conflict();
          children.push(child);
        }
        for (const child of children)
          await tx
            .update(tasks)
            .set({
              archivedAt: now,
              version: child.version + 1,
              updatedAt: now,
            })
            .where(eq(tasks.id, child.id));
      } else {
        await requireMember(
          tx,
          p,
          task.workspaceId,
          "task:schedule",
          await taskResource(tx, task),
        );
        const [current] = await tx
          .select()
          .from(taskPlans)
          .where(eq(taskPlans.taskId, task.id))
          .for("update");
        if (
          task.id !== inverse.task.id ||
          task.version !== inverse.task.version ||
          task.updatedAt.toISOString() !== inverse.task.updatedAt ||
          !current ||
          current.version !== inverse.planVersion ||
          current.archivedAt
        )
          conflict();
        await tx
          .update(taskPlans)
          .set({
            ...(inverse.plan
              ? {
                  startDate: inverse.plan.startDate,
                  durationDays: inverse.plan.durationDays,
                }
              : {}),
            archivedAt: inverse.plan
              ? inverse.plan.archivedAt
                ? new Date(inverse.plan.archivedAt)
                : null
              : now,
            version: current.version + 1,
            updatedAt: now,
          })
          .where(eq(taskPlans.taskId, task.id));
        await tx
          .update(tasks)
          .set({
            dueAt: inverse.dueAt ? new Date(inverse.dueAt) : null,
            version: task.version + 1,
            updatedAt: now,
          })
          .where(eq(tasks.id, task.id));
      }
      const [undone] = await tx
        .update(suggestions)
        .set({ undoneAt: now, version: row.version + 1, updatedAt: now })
        .where(eq(suggestions.id, row.id))
        .returning();
      return dtoSuggestion(undone);
    });
  }
  async function dismissSuggestion(
    p: Principal,
    id: string,
    input: SuggestionDecision,
  ): Promise<Suggestion> {
    parse(idSchema, id);
    const body = parse(suggestionDecisionSchema, input);
    return mutation(p, async (tx) => {
      const { row, actor } = await decide(tx, p, id, body.version);
      return close(tx, row, actor, "dismissed");
    });
  }
  return {
    operations: {
      createSuggestion,
      listSuggestions,
      applySuggestion,
      dismissSuggestion,
      undoSuggestion,
    },
  };
}
