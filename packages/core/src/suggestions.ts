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
  suggestionDecisionSchema,
  suggestionFilterSchema,
  suggestionInputSchema,
  type Task,
  type TaskPlanInput,
  type TaskPlanResult,
} from "@taff/schemas";
import { and, desc, eq, inArray, type SQL } from "drizzle-orm";
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
  ) {
    const [updated] = await tx
      .update(suggestions)
      .set({
        status,
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
      const payload = dtoSuggestion(row);
      if (payload.kind === "split")
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
      else {
        // The normal plan path: task:schedule on the task, applied to the
        // plan as it is now.
        const [current] = await tx
          .select({ version: taskPlans.version })
          .from(taskPlans)
          .where(eq(taskPlans.taskId, task.id));
        plan = await applyTaskPlan(tx, p, task.id, {
          startDate: payload.payload.startDate,
          durationDays: payload.payload.durationDays,
          ...(current ? { version: current.version } : {}),
        });
      }
      return {
        suggestion: await close(tx, row, actor, "applied"),
        tasks: created,
        plan,
      };
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
    },
  };
}
