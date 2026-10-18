import { createHash } from "node:crypto";
import {
  agentProfiles,
  type Database,
  grants,
  members,
  milestones,
  projectPayments,
  projects,
  runs,
  type Transaction,
  taskDependencies,
  taskPlans,
  tasks,
  user,
  workspaces,
} from "@taff/db";
import {
  type Dependency,
  type DependencyInput,
  dependencyInputSchema,
  idSchema,
  type Milestone,
  type MilestoneInput,
  type MilestoneUpdate,
  milestoneInputSchema,
  milestoneUpdateSchema,
  type Payment,
  type PaymentInput,
  paymentInputSchema,
  SchemaError,
  type Task,
  type TaskPlan,
  type TaskPlanInput,
  type TaskPlanResult,
  type Timeline,
  taskPlanInputSchema,
} from "@taff/schemas";
import { and, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import { type Action, type Actor, can, type Resource } from "./permissions";
import {
  buildPlanModel,
  civilDate,
  dayNumber,
  type PlanEnd,
  type PlanModelInput,
  type PlanModelTask,
} from "./plan-model";
import { localDate, zonedInstant } from "./quick-add";

function parse<T>(schema: { parse(v: unknown): T }, v: unknown): T {
  try {
    return schema.parse(v);
  } catch (e) {
    if (e instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw e;
  }
}
function invalid(): never {
  throw new CoreError("invalid_input", 400);
}
function conflict(): never {
  throw new CoreError("conflict", 409);
}
function notFound(): never {
  throw new CoreError("not_found", 404);
}
function dtoTask(row: typeof tasks.$inferSelect): Task {
  return {
    ...row,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function dtoPlan(row: typeof taskPlans.$inferSelect): TaskPlan {
  return {
    taskId: row.taskId,
    workspaceId: row.workspaceId,
    startDate: row.startDate,
    durationDays: row.durationDays,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}
function dtoMilestone(row: typeof milestones.$inferSelect): Milestone {
  return {
    ...row,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function dtoDependency(row: typeof taskDependencies.$inferSelect): Dependency {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    predecessorTaskId: row.predecessorTaskId,
    predecessorMilestoneId: row.predecessorMilestoneId,
    successorTaskId: row.successorTaskId,
    successorMilestoneId: row.successorMilestoneId,
    createdAt: row.createdAt.toISOString(),
  };
}
function dtoPayment(row: typeof projectPayments.$inferSelect): Payment {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
    amount: row.amount,
    paidOn: row.paidOn,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Wall-clock parts of an instant in a zone. */
function wallParts(instant: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
    extraMs: Number(part("second")) * 1000 + instant.getUTCMilliseconds(),
  };
}
/**
 * The instant on `date` at a wall time in `tz`. A time inside a DST gap falls
 * back to 23:59 local, the default deadline.
 */
function wallInstant(
  date: string,
  time: { time: string; extraMs: number } | null,
  tz: string,
): Date {
  const at = time ? zonedInstant(date, time.time, tz) : null;
  if (at) return new Date(at.getTime() + (time?.extraMs ?? 0));
  return zonedInstant(date, "23:59", tz) ?? new Date(`${date}T23:59:00Z`);
}
const shiftDate = (date: string, days: number) =>
  civilDate(dayNumber(date) + days);

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

/** Timeline plans, milestones, dependencies and payments (ADR 0015). */
export function createTimelineOperations({
  db,
  mutation,
  requireMember,
  lockTask,
  currentRunId,
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
  /**
   * The zone that names "today" and civil due dates: a person's saved zone;
   * for an agent, its supervisor's saved zone, else UTC (agents have none).
   */
  async function zoneOf(
    q: Database | Transaction,
    p: Principal,
    actor: Actor,
  ): Promise<string> {
    if (p.kind === "user") {
      const [row] = await q
        .select({ tz: user.tz })
        .from(user)
        .where(eq(user.id, p.userId));
      return row?.tz ?? "UTC";
    }
    const [row] = await q
      .select({ tz: user.tz })
      .from(agentProfiles)
      .innerJoin(members, eq(members.id, agentProfiles.supervisorId))
      .innerJoin(user, eq(user.id, members.userId))
      .where(eq(agentProfiles.id, actor.id));
    return row?.tz ?? "UTC";
  }
  async function readProject(projectId: string) {
    parse(idSchema, projectId);
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!project) notFound();
    return project;
  }
  async function lockProject(tx: Transaction, projectId: string) {
    parse(idSchema, projectId);
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .for("share");
    if (!project) notFound();
    return project;
  }

  /**
   * The plan-model input of one project as `actor` sees it: finance only
   * with finance:read (ADR 0021). The timeline and the brief share it, so their
   * numbers are the same by construction.
   */
  async function planSource(
    actor: Actor,
    project: typeof projects.$inferSelect,
    timeZone: string,
  ) {
    const w = project.workspaceId;
    const projectId = project.id;
    const rows = await db
      .select({ task: tasks, plan: taskPlans, workerKind: members.kind })
      .from(tasks)
      .leftJoin(
        taskPlans,
        and(eq(taskPlans.taskId, tasks.id), isNull(taskPlans.archivedAt)),
      )
      .leftJoin(members, eq(members.id, tasks.workerId))
      .where(
        and(
          eq(tasks.workspaceId, w),
          eq(tasks.projectId, projectId),
          isNull(tasks.archivedAt),
        ),
      )
      .orderBy(tasks.number);
    const ids = rows.map((row) => row.task.id);
    const blocked = new Set(
      ids.length
        ? (
            await db
              .selectDistinct({ taskId: grants.taskId })
              .from(grants)
              .where(
                and(
                  eq(grants.workspaceId, w),
                  eq(grants.status, "pending"),
                  inArray(grants.taskId, ids),
                ),
              )
          ).map((row) => row.taskId)
        : [],
    );
    const active = ids.length
      ? await db
          .select({ taskId: runs.taskId, id: runs.id })
          .from(runs)
          .where(
            and(
              eq(runs.workspaceId, w),
              inArray(runs.taskId, ids),
              sql`${runs.status} IN ('running','paused','needs_review','changes_requested')`,
            ),
          )
      : [];
    const runIds = new Map(active.map((run) => [run.taskId, run.id]));
    const milestoneRows = await db
      .select()
      .from(milestones)
      .where(
        and(
          eq(milestones.workspaceId, w),
          eq(milestones.projectId, projectId),
          isNull(milestones.archivedAt),
        ),
      )
      .orderBy(milestones.date, milestones.id);
    const msIds = milestoneRows.map((row) => row.id);
    const touching: SQL[] = [];
    if (ids.length)
      touching.push(
        inArray(taskDependencies.predecessorTaskId, ids),
        inArray(taskDependencies.successorTaskId, ids),
      );
    if (msIds.length)
      touching.push(
        inArray(taskDependencies.predecessorMilestoneId, msIds),
        inArray(taskDependencies.successorMilestoneId, msIds),
      );
    const dependencyRows = touching.length
      ? await db
          .select()
          .from(taskDependencies)
          .where(and(eq(taskDependencies.workspaceId, w), or(...touching)))
          .orderBy(taskDependencies.createdAt, taskDependencies.id)
      : [];
    let finance = null;
    if (can(actor, "finance:read", { workspaceId: w })) {
      const [paid] = await db
        .select({
          total: sql<string>`coalesce(sum(${projectPayments.amount}), 0)::numeric(14,2)::text`,
        })
        .from(projectPayments)
        .where(
          and(
            eq(projectPayments.workspaceId, w),
            eq(projectPayments.projectId, projectId),
          ),
        );
      finance = {
        contractAmount: project.contractAmount,
        currency: project.currency,
        collected: paid?.total ?? "0.00",
      };
    }
    const end = (taskId: string | null, milestoneId: string | null): PlanEnd =>
      taskId
        ? { kind: "task", id: taskId }
        : { kind: "milestone", id: milestoneId as string };
    const input: PlanModelInput = {
      today: localDate(new Date(), timeZone),
      tasks: rows.map(
        ({ task, plan, workerKind }): PlanModelTask => ({
          id: task.id,
          parentId: task.parentId,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueAt ? localDate(task.dueAt, timeZone) : null,
          plan: plan
            ? {
                startDate: plan.startDate,
                durationDays: plan.durationDays,
                version: plan.version,
              }
            : null,
          ownerId: task.ownerId,
          workerId: task.workerId,
          workerIsAgent: workerKind === "agent",
          blocked: blocked.has(task.id),
          version: task.version,
        }),
      ),
      milestones: milestoneRows.map((row) => ({
        id: row.id,
        name: row.name,
        date: row.date,
        version: row.version,
      })),
      dependencies: dependencyRows.map((row) => ({
        id: row.id,
        from: end(row.predecessorTaskId, row.predecessorMilestoneId),
        to: end(row.successorTaskId, row.successorMilestoneId),
      })),
      finance,
    };
    return { input, rows, runIds };
  }

  async function getTimeline(
    p: Principal,
    projectId: string,
  ): Promise<Timeline> {
    const project = await readProject(projectId);
    const w = project.workspaceId;
    const actor = await requireMember(db, p, w, "workspace:read");
    const timeZone = await zoneOf(db, p, actor);
    const { input, rows, runIds } = await planSource(actor, project, timeZone);
    const model = buildPlanModel(input);
    return {
      projectId,
      timeZone,
      canEditPlan:
        (actor.kind === "person" && actor.role === "admin") ||
        rows.some(({ task }) =>
          can(actor, "task:schedule", {
            workspaceId: w,
            ownerId: task.ownerId,
            workerId: task.workerId,
            taskId: task.id,
            runId: runIds.get(task.id),
          }),
        ),
      ...model,
    };
  }

  /** The task and every descendant, parents first, each row locked. */
  async function lockSubtree(tx: Transaction, root: typeof tasks.$inferSelect) {
    const out: (typeof tasks.$inferSelect)[] = [];
    let frontier = [root.id];
    const seen = new Set(frontier);
    while (frontier.length) {
      const children = await tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, root.workspaceId),
            isNull(tasks.archivedAt),
            inArray(tasks.parentId, frontier),
          ),
        )
        .orderBy(tasks.number)
        .for("update");
      frontier = [];
      for (const child of children)
        if (!seen.has(child.id)) {
          seen.add(child.id);
          out.push(child);
          frontier.push(child.id);
        }
    }
    return out;
  }
  /** Caller holds the root and descendant task locks (creation locks parents). */
  async function planState(tx: Transaction, ids: string[]) {
    const rows = await tx
      .select()
      .from(tasks)
      .where(inArray(tasks.id, ids))
      .orderBy(tasks.id);
    const plans = await tx
      .select()
      .from(taskPlans)
      .where(inArray(taskPlans.taskId, ids))
      .orderBy(taskPlans.taskId);
    return createHash("sha256")
      .update(
        JSON.stringify({
          tasks: rows.map((row) => [
            row.id,
            row.version,
            row.parentId,
            row.dueAt,
            row.archivedAt,
          ]),
          plans: plans.map((row) => [row.taskId, row.version, row.archivedAt]),
        }),
      )
      .digest("hex");
  }
  async function setTaskPlan(
    p: Principal,
    taskId: string,
    input: TaskPlanInput,
  ): Promise<TaskPlanResult> {
    parse(idSchema, taskId);
    const body = parse(taskPlanInputSchema, input);
    return mutation(p, (tx) => applyTaskPlan(tx, p, taskId, body));
  }
  /**
   * The plan write inside a caller's transaction, with the same checks as
   * PATCH /api/tasks/:id/plan (applying a reschedule suggestion uses it).
   */
  async function applyTaskPlan(
    tx: Transaction,
    p: Principal,
    taskId: string,
    body: TaskPlanInput,
  ): Promise<TaskPlanResult> {
    {
      const task = await lockTask(tx, taskId);
      const actor = await requireMember(
        tx,
        p,
        task.workspaceId,
        "task:schedule",
        await taskResource(tx, task),
      );
      const tz = await zoneOf(tx, p, actor);
      const [stored] = await tx
        .select()
        .from(taskPlans)
        .where(eq(taskPlans.taskId, taskId))
        .for("update");
      const existing = stored?.archivedAt ? undefined : stored;
      if (
        body.version === undefined
          ? existing
          : !existing || existing.version !== body.version
      )
        conflict();
      const result: TaskPlanResult = { plans: [], tasks: [] };
      const descendants = body.shiftChildren ? await lockSubtree(tx, task) : [];
      const stateIds = [taskId, ...descendants.map((row) => row.id)];
      if (
        body.expectedState &&
        body.expectedState !== (await planState(tx, stateIds))
      )
        conflict();
      if (descendants.length) {
        // The day delta is measured from the start the timeline showed: a
        // parent's span comes from its children (D10).
        const plans = new Map(
          (
            await tx
              .select()
              .from(taskPlans)
              .where(
                inArray(
                  taskPlans.taskId,
                  descendants.map((row) => row.id),
                ),
              )
              .for("update")
          ).map((row) => [row.taskId, row]),
        );
        if (existing) plans.set(taskId, existing);
        const shown = buildPlanModel({
          today: body.startDate,
          tasks: [task, ...descendants].map((row) => {
            const storedPlan = plans.get(row.id);
            const plan = storedPlan?.archivedAt ? undefined : storedPlan;
            return {
              ...row,
              parentId: row.id === taskId ? null : row.parentId,
              dueDate: row.dueAt ? localDate(row.dueAt, tz) : null,
              plan: plan ?? null,
              workerIsAgent: false,
              blocked: false,
            };
          }),
          milestones: [],
          dependencies: [],
          finance: null,
        }).items.find((item) => item.id === taskId);
        const delta = shown
          ? dayNumber(body.startDate) - dayNumber(shown.start)
          : 0;
        if (delta)
          for (const row of descendants) {
            const storedPlan = plans.get(row.id);
            const plan = storedPlan?.archivedAt ? undefined : storedPlan;
            if (!plan && !row.dueAt) continue;
            // Moving someone else's work needs the same right as moving it alone.
            await requireMember(
              tx,
              p,
              row.workspaceId,
              "task:schedule",
              await taskResource(tx, row),
            );
            if (plan) {
              const [moved] = await tx
                .update(taskPlans)
                .set({
                  startDate: shiftDate(plan.startDate, delta),
                  version: plan.version + 1,
                  updatedAt: new Date(),
                })
                .where(eq(taskPlans.taskId, row.id))
                .returning();
              result.plans.push(dtoPlan(moved));
            }
            if (row.dueAt) {
              const wall = wallParts(row.dueAt, tz);
              const [moved] = await tx
                .update(tasks)
                .set({
                  dueAt: wallInstant(shiftDate(wall.date, delta), wall, tz),
                  updatedAt: new Date(),
                })
                .where(eq(tasks.id, row.id))
                .returning();
              result.tasks.push(dtoTask(moved));
            }
          }
      }
      const values = {
        startDate: body.startDate,
        durationDays: body.durationDays,
        updatedAt: new Date(),
        archivedAt: null,
      };
      const [plan] = stored
        ? await tx
            .update(taskPlans)
            .set({ ...values, version: stored.version + 1 })
            .where(eq(taskPlans.taskId, taskId))
            .returning()
        : await tx
            .insert(taskPlans)
            .values({ ...values, taskId, workspaceId: task.workspaceId })
            .returning();
      result.plans.unshift(dtoPlan(plan));
      // tasks.due_at follows the plan's last day at the previous local time.
      const due = wallInstant(
        shiftDate(body.startDate, body.durationDays - 1),
        task.dueAt ? wallParts(task.dueAt, tz) : null,
        tz,
      );
      if (task.dueAt?.getTime() !== due.getTime()) {
        const [updated] = await tx
          .update(tasks)
          .set({ dueAt: due, updatedAt: new Date() })
          .where(eq(tasks.id, taskId))
          .returning();
        result.tasks.unshift(dtoTask(updated));
      }
      result.undoState = await planState(tx, stateIds);
      return result;
    }
  }

  async function listMilestones(
    p: Principal,
    projectId: string,
  ): Promise<Milestone[]> {
    const project = await readProject(projectId);
    await requireMember(db, p, project.workspaceId, "workspace:read");
    return (
      await db
        .select()
        .from(milestones)
        .where(
          and(
            eq(milestones.workspaceId, project.workspaceId),
            eq(milestones.projectId, projectId),
            isNull(milestones.archivedAt),
          ),
        )
        .orderBy(milestones.date, milestones.id)
    ).map(dtoMilestone);
  }
  async function createMilestone(
    p: Principal,
    projectId: string,
    input: MilestoneInput,
  ): Promise<Milestone> {
    const body = parse(milestoneInputSchema, input);
    return mutation(p, async (tx) => {
      const project = await lockProject(tx, projectId);
      await requireMember(tx, p, project.workspaceId, "project:manage");
      if (project.archived) invalid();
      const [row] = await tx
        .insert(milestones)
        .values({ ...body, workspaceId: project.workspaceId, projectId })
        .returning();
      return dtoMilestone(row);
    });
  }
  async function updateMilestone(
    p: Principal,
    id: string,
    input: MilestoneUpdate,
  ): Promise<Milestone> {
    parse(idSchema, id);
    const body = parse(milestoneUpdateSchema, input);
    return mutation(p, async (tx) => {
      const [row] = await tx
        .select()
        .from(milestones)
        .where(eq(milestones.id, id))
        .for("update");
      if (!row) notFound();
      await requireMember(tx, p, row.workspaceId, "project:manage");
      if (row.version !== body.version) conflict();
      const [updated] = await tx
        .update(milestones)
        .set({
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.date !== undefined ? { date: body.date } : {}),
          ...(body.archived !== undefined
            ? {
                archivedAt: body.archived
                  ? (row.archivedAt ?? new Date())
                  : null,
              }
            : {}),
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(milestones.id, id))
        .returning();
      return dtoMilestone(updated);
    });
  }
  /** DELETE archives; a milestone is never hard-deleted (ADR 0015). */
  async function archiveMilestone(
    p: Principal,
    id: string,
    version?: number,
  ): Promise<Milestone> {
    parse(idSchema, id);
    if (version !== undefined)
      return updateMilestone(p, id, { version, archived: true });
    return mutation(p, async (tx) => {
      const [row] = await tx
        .select()
        .from(milestones)
        .where(eq(milestones.id, id))
        .for("update");
      if (!row) notFound();
      await requireMember(tx, p, row.workspaceId, "project:manage");
      if (row.archivedAt) return dtoMilestone(row);
      const [updated] = await tx
        .update(milestones)
        .set({
          archivedAt: new Date(),
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(milestones.id, id))
        .returning();
      return dtoMilestone(updated);
    });
  }

  /** Authorizes an edit of links into a successor; returns its workspace. */
  async function authorizeSuccessor(
    tx: Transaction,
    p: Principal,
    successor: PlanEnd,
  ): Promise<string> {
    if (successor.kind === "task") {
      const task = await lockTask(tx, successor.id);
      await requireMember(
        tx,
        p,
        task.workspaceId,
        "dependency:edit",
        await taskResource(tx, task),
      );
      return task.workspaceId;
    }
    const [row] = await tx
      .select()
      .from(milestones)
      .where(eq(milestones.id, successor.id))
      .for("share");
    if (!row) notFound();
    await requireMember(tx, p, row.workspaceId, "project:manage");
    return row.workspaceId;
  }
  const nodeKey = (taskId: string | null, milestoneId: string | null) =>
    taskId ? `t:${taskId}` : `m:${milestoneId}`;
  async function addDependency(
    p: Principal,
    input: DependencyInput,
  ): Promise<Dependency> {
    const body = parse(dependencyInputSchema, input);
    const from: PlanEnd = body.predecessorTaskId
      ? { kind: "task", id: body.predecessorTaskId }
      : { kind: "milestone", id: body.predecessorMilestoneId as string };
    const to: PlanEnd = body.successorTaskId
      ? { kind: "task", id: body.successorTaskId }
      : { kind: "milestone", id: body.successorMilestoneId as string };
    return mutation(p, async (tx) => {
      const w = await authorizeSuccessor(tx, p, to);
      // Both ends live in one workspace; another workspace's row is not found.
      const [predecessor] =
        from.kind === "task"
          ? await tx
              .select({ archivedAt: tasks.archivedAt })
              .from(tasks)
              .where(and(eq(tasks.id, from.id), eq(tasks.workspaceId, w)))
              .for("share")
          : await tx
              .select({ archivedAt: milestones.archivedAt })
              .from(milestones)
              .where(
                and(eq(milestones.id, from.id), eq(milestones.workspaceId, w)),
              )
              .for("share");
      if (!predecessor) notFound();
      if (predecessor.archivedAt) invalid();
      if (to.kind === "milestone") {
        const [row] = await tx
          .select({ archivedAt: milestones.archivedAt })
          .from(milestones)
          .where(eq(milestones.id, to.id));
        if (row?.archivedAt) invalid();
      }
      // One writer per workspace graph, so two inserts cannot close a cycle.
      await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, w))
        .for("update");
      const fromKey = nodeKey(
        body.predecessorTaskId ?? null,
        body.predecessorMilestoneId ?? null,
      );
      const toKey = nodeKey(
        body.successorTaskId ?? null,
        body.successorMilestoneId ?? null,
      );
      if (fromKey === toKey) conflict();
      const duplicate = await tx
        .select({ id: taskDependencies.id })
        .from(taskDependencies)
        .where(
          and(
            eq(taskDependencies.workspaceId, w),
            sql`${taskDependencies.predecessorTaskId} IS NOT DISTINCT FROM ${body.predecessorTaskId ?? null}::uuid`,
            sql`${taskDependencies.predecessorMilestoneId} IS NOT DISTINCT FROM ${body.predecessorMilestoneId ?? null}::uuid`,
            sql`${taskDependencies.successorTaskId} IS NOT DISTINCT FROM ${body.successorTaskId ?? null}::uuid`,
            sql`${taskDependencies.successorMilestoneId} IS NOT DISTINCT FROM ${body.successorMilestoneId ?? null}::uuid`,
          ),
        )
        .limit(1);
      if (duplicate.length) conflict();
      // A cycle exists when the successor already reaches the predecessor.
      const reach = await tx.execute(sql`
        WITH RECURSIVE reach(node) AS (
          SELECT ${toKey}::text
          UNION
          SELECT coalesce('t:' || d.successor_task_id::text, 'm:' || d.successor_milestone_id::text)
          FROM task_dependencies d
          JOIN reach r ON r.node = coalesce('t:' || d.predecessor_task_id::text, 'm:' || d.predecessor_milestone_id::text)
          WHERE d.workspace_id = ${w}
        )
        SELECT 1 AS found FROM reach WHERE node = ${fromKey} LIMIT 1`);
      if (reach.length) conflict();
      const [row] = await tx
        .insert(taskDependencies)
        .values({
          workspaceId: w,
          predecessorTaskId: body.predecessorTaskId ?? null,
          predecessorMilestoneId: body.predecessorMilestoneId ?? null,
          successorTaskId: body.successorTaskId ?? null,
          successorMilestoneId: body.successorMilestoneId ?? null,
        })
        .returning();
      return dtoDependency(row);
    });
  }
  /** Removes a link row; the audit trigger records it, undo re-adds it. */
  async function removeDependency(
    p: Principal,
    id: string,
  ): Promise<Dependency> {
    parse(idSchema, id);
    return mutation(p, async (tx) => {
      const [row] = await tx
        .select()
        .from(taskDependencies)
        .where(eq(taskDependencies.id, id))
        .for("update");
      if (!row) notFound();
      await authorizeSuccessor(
        tx,
        p,
        row.successorTaskId
          ? { kind: "task", id: row.successorTaskId }
          : { kind: "milestone", id: row.successorMilestoneId as string },
      );
      await tx.delete(taskDependencies).where(eq(taskDependencies.id, id));
      return dtoDependency(row);
    });
  }

  async function listPayments(
    p: Principal,
    projectId: string,
  ): Promise<Payment[]> {
    const project = await readProject(projectId);
    await requireMember(db, p, project.workspaceId, "finance:read");
    return (
      await db
        .select()
        .from(projectPayments)
        .where(
          and(
            eq(projectPayments.workspaceId, project.workspaceId),
            eq(projectPayments.projectId, projectId),
          ),
        )
        .orderBy(projectPayments.paidOn, projectPayments.createdAt)
    ).map(dtoPayment);
  }
  async function addPayment(
    p: Principal,
    projectId: string,
    input: PaymentInput,
  ): Promise<Payment> {
    const body = parse(paymentInputSchema, input);
    return mutation(p, async (tx) => {
      const project = await lockProject(tx, projectId);
      const actor = await requireMember(
        tx,
        p,
        project.workspaceId,
        "finance:manage",
      );
      const [row] = await tx
        .insert(projectPayments)
        .values({
          workspaceId: project.workspaceId,
          projectId,
          amount: body.amount,
          paidOn: body.paidOn,
          note: body.note ?? "",
          createdBy: actor.id,
        })
        .returning();
      return dtoPayment(row);
    });
  }

  return {
    zoneOf,
    planSource,
    applyTaskPlan,
    operations: {
      getTimeline,
      setTaskPlan,
      listMilestones,
      createMilestone,
      updateMilestone,
      archiveMilestone,
      addDependency,
      removeDependency,
      listPayments,
      addPayment,
    },
  };
}
