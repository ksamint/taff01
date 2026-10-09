import {
  activity,
  agentPermissions,
  agentProfiles,
  type Database,
  grants,
  inboxItems,
  members,
  reviewChecks,
  reviewComments,
  reviewItems,
  runArtifacts,
  runEvents,
  runs,
  type Transaction,
  tasks,
} from "@taff/db";
import {
  type AgentPermissionInput,
  type AgentProfile,
  type AgentProfileInput,
  type AppendRunEvent,
  type AttachRunArtifact,
  agentPermissionInputSchema,
  agentProfileInputSchema,
  appendRunEventSchema,
  attachRunArtifactSchema,
  type ControlRun,
  capabilitySchema,
  controlRunSchema,
  type DecideGrant,
  decideGrantSchema,
  type Grant,
  type Inbox,
  type InboxItem,
  type InboxItemInput,
  idSchema,
  inboxFilterSchema,
  inboxItemInputSchema,
  mcpInboxRequestReviewArgs,
  type RequestGrant,
  type ReviewComment,
  type ReviewCommentInput,
  type ReviewRun,
  type ReviewWorkspace,
  type Run,
  type RunArtifact,
  type RunDetail,
  type RunEvent,
  requestGrantSchema,
  reviewCommentSchema,
  reviewRunSchema,
  SchemaError,
  type StartRun,
  type SubmitRun,
  startRunSchema,
  submitRunSchema,
  type Task,
} from "@taff/schemas";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import {
  type Action,
  type Actor,
  can,
  DEFAULT_PERMISSIONS,
  type Resource,
} from "./permissions";

function parse<T>(schema: { parse(input: unknown): T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw error;
  }
}
function conflict(): never {
  throw new CoreError("conflict", 409);
}
function invalid(): never {
  throw new CoreError("invalid_input", 400);
}
function toRun(row: typeof runs.$inferSelect): Run {
  return {
    ...row,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}
function toTask(row: typeof tasks.$inferSelect): Task {
  return {
    ...row,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function toEvent(row: typeof runEvents.$inferSelect): RunEvent {
  return {
    ...row,
    kind: row.kind as RunEvent["kind"],
    capability: row.capability as RunEvent["capability"],
    testStatus: row.testStatus as RunEvent["testStatus"],
    createdAt: row.createdAt.toISOString(),
  };
}
function toArtifact(row: typeof runArtifacts.$inferSelect): RunArtifact {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
function toComment(row: typeof reviewComments.$inferSelect): ReviewComment {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
function toGrant(row: typeof grants.$inferSelect): Grant {
  return {
    ...row,
    capability: row.capability as Grant["capability"],
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function toInbox(row: typeof inboxItems.$inferSelect): InboxItem {
  return {
    ...row,
    kind: row.kind as InboxItem["kind"],
    readAt: row.readAt?.toISOString() ?? null,
    snoozedUntil: row.snoozedUntil?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
const ACTIVE: Run["status"][] = [
  "running",
  "paused",
  "needs_review",
  "changes_requested",
];

type Dependencies = {
  db: Database;
  mutation<T>(
    principal: Principal,
    run: (tx: Transaction) => Promise<T>,
  ): Promise<T>;
  loadActor(
    query: Database | Transaction,
    principal: Principal,
    workspaceId: string,
  ): Promise<Actor | null>;
  requireMember(
    query: Database | Transaction,
    principal: Principal,
    workspaceId: string,
    action: Action,
    resource?: Resource,
  ): Promise<Actor>;
  lockTask(tx: Transaction, taskId: string): Promise<typeof tasks.$inferSelect>;
};
export function createRunOperations({
  db,
  mutation,
  loadActor,
  requireMember,
  lockTask,
}: Dependencies) {
  async function getTask(principal: Principal, taskId: string): Promise<Task> {
    parse(idSchema, taskId);
    const [task] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1);
    if (!task) throw new CoreError("not_found", 404);
    await requireMember(db, principal, task.workspaceId, "workspace:read", {
      workspaceId: task.workspaceId,
      taskId,
    });
    return toTask(task);
  }
  async function listRuns(
    principal: Principal,
    workspaceId: string,
  ): Promise<Run[]> {
    parse(idSchema, workspaceId);
    await requireMember(db, principal, workspaceId, "workspace:read");
    return (
      await db
        .select()
        .from(runs)
        .where(eq(runs.workspaceId, workspaceId))
        .orderBy(desc(runs.startedAt))
        .limit(200)
    ).map(toRun);
  }
  async function getRun(
    principal: Principal,
    runId: string,
  ): Promise<RunDetail> {
    parse(idSchema, runId);
    const [run] = await db
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);
    if (!run) throw new CoreError("not_found", 404);
    const task = await getTask(principal, run.taskId);
    const actor = await loadActor(db, principal, run.workspaceId);
    const resource = {
      workspaceId: run.workspaceId,
      taskId: task.id,
      runId: run.id,
      ownerId: task.ownerId,
      workerId: run.agentId,
    };
    const [events, artifacts] = await Promise.all([
      db
        .select()
        .from(runEvents)
        .where(eq(runEvents.runId, runId))
        .orderBy(runEvents.createdAt, runEvents.id),
      db
        .select()
        .from(runArtifacts)
        .where(eq(runArtifacts.runId, runId))
        .orderBy(runArtifacts.createdAt, runArtifacts.id),
    ]);
    return {
      run: toRun(run),
      events: events.map(toEvent),
      artifacts: artifacts.map(toArtifact),
      canControl:
        ACTIVE.includes(run.status) && can(actor, "run:control", resource),
      canSubmit: run.status === "running" && can(actor, "run:submit", resource),
    };
  }
  async function lockedRun(
    tx: Transaction,
    principal: Principal,
    runId: string,
    version: number,
    action: Action,
  ) {
    parse(idSchema, runId);
    const [candidate] = await tx
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .limit(1);
    if (!candidate) throw new CoreError("not_found", 404);
    const task = await lockTask(tx, candidate.taskId);
    const [run] = await tx
      .select()
      .from(runs)
      .where(eq(runs.id, runId))
      .for("update");
    const resource = {
      workspaceId: run.workspaceId,
      taskId: task.id,
      runId,
      agentId: run.agentId,
      ownerId: task.ownerId,
      workerId: run.agentId,
    };
    const [profile] = await tx
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.id, run.agentId));
    const actor = await requireMember(tx, principal, run.workspaceId, action, {
      ...resource,
      supervisorId: profile?.supervisorId,
    });
    if (run.version !== version) conflict();
    if (task.workerId !== run.agentId) conflict();
    return { run, task, actor, resource };
  }
  async function bump(
    tx: Transaction,
    run: typeof runs.$inferSelect,
    change: Partial<typeof runs.$inferInsert> = {},
  ) {
    const [updated] = await tx
      .update(runs)
      .set({ ...change, version: run.version + 1, updatedAt: new Date() })
      .where(eq(runs.id, run.id))
      .returning();
    return updated;
  }
  async function notifyPeople(
    tx: Transaction,
    task: typeof tasks.$inferSelect,
    run: typeof runs.$inferSelect | null,
    kind: InboxItem["kind"],
    title: string,
    grantId: string | null = null,
    supervisorId: string | null = null,
  ) {
    const people = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.workspaceId, task.workspaceId),
          eq(members.kind, "person"),
        ),
      );
    const recipients = people.filter(
      (person) =>
        person.role === "admin" ||
        person.id === task.ownerId ||
        person.id === supervisorId,
    );
    if (recipients.length)
      await tx.insert(inboxItems).values(
        recipients.map((person) => ({
          workspaceId: task.workspaceId,
          memberId: person.id,
          agentId: run?.agentId ?? task.workerId,
          taskId: task.id,
          runId: run?.id ?? null,
          grantId,
          kind,
          title,
        })),
      );
  }
  async function startRun(
    principal: Principal,
    taskId: string,
    input: StartRun = {},
  ): Promise<Run> {
    parse(startRunSchema, input);
    return mutation(principal, async (tx) => {
      const task = await lockTask(tx, taskId);
      await requireMember(tx, principal, task.workspaceId, "run:start", {
        workspaceId: task.workspaceId,
        taskId,
        ownerId: task.ownerId,
        workerId: task.workerId,
      });
      if (!task.workerId || task.status === "done") conflict();
      const [worker] = await tx
        .select()
        .from(members)
        .where(
          and(
            eq(members.id, task.workerId),
            eq(members.workspaceId, task.workspaceId),
          ),
        );
      if (worker?.kind !== "agent") invalid();
      const active = await tx
        .select({ id: runs.id })
        .from(runs)
        .where(and(eq(runs.taskId, task.id), inArray(runs.status, ACTIVE)));
      if (active.length) conflict();
      const [run] = await tx
        .insert(runs)
        .values({ workspaceId: task.workspaceId, taskId, agentId: worker.id })
        .returning();
      await tx
        .update(tasks)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(tasks.id, task.id));
      return toRun(run);
    });
  }
  async function controlRun(
    principal: Principal,
    runId: string,
    input: ControlRun,
  ): Promise<Run> {
    const body = parse(controlRunSchema, input);
    return mutation(principal, async (tx) => {
      const { run, task } = await lockedRun(
        tx,
        principal,
        runId,
        body.version,
        "run:control",
      );
      const next: Run["status"] =
        body.action === "pause"
          ? "paused"
          : body.action === "resume"
            ? "running"
            : "canceled";
      if (body.action === "pause" && run.status !== "running") conflict();
      if (
        body.action === "resume" &&
        !(["paused", "changes_requested"] as Run["status"][]).includes(
          run.status,
        )
      )
        conflict();
      if (body.action === "cancel" && !ACTIVE.includes(run.status)) conflict();
      if (body.action === "resume") {
        const unresolved = await tx
          .select()
          .from(grants)
          .where(and(eq(grants.runId, run.id), eq(grants.status, "pending")));
        if (unresolved.length) conflict();
        const [profile] = await tx
          .select()
          .from(agentProfiles)
          .where(eq(agentProfiles.id, run.agentId));
        if (
          profile &&
          ((profile.maxCostMicros !== null &&
            run.costMicros >= profile.maxCostMicros) ||
            (profile.maxDurationMs !== null &&
              run.durationMs >= profile.maxDurationMs))
        )
          conflict();
      }
      const updated = await bump(tx, run, {
        status: next,
        finishedAt: body.action === "cancel" ? new Date() : null,
      });
      await tx
        .update(tasks)
        .set({
          status: body.action === "cancel" ? "todo" : "in_progress",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id));
      if (body.action === "cancel")
        await tx
          .update(inboxItems)
          .set({ resolvedAt: new Date(), updatedAt: new Date() })
          .where(eq(inboxItems.runId, runId));
      if (body.action === "resume")
        await tx
          .update(inboxItems)
          .set({ resolvedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(inboxItems.runId, runId),
              isNull(inboxItems.grantId),
              eq(inboxItems.kind, "blocker"),
            ),
          );
      return toRun(updated);
    });
  }
  async function appendRunEvent(
    principal: Principal,
    runId: string,
    input: AppendRunEvent,
  ): Promise<RunEvent> {
    const body = parse(appendRunEventSchema, input);
    if (
      (body.kind === "source" && !body.sourceUrl) ||
      (body.kind === "test" && !body.testStatus) ||
      (body.kind === "tool_call" && !body.capability)
    )
      invalid();
    return mutation(principal, async (tx) => {
      const { run, task, actor, resource } = await lockedRun(
        tx,
        principal,
        runId,
        body.version,
        "run:submit",
      );
      if (run.status !== "running") conflict();
      if (
        body.capability &&
        !can(actor, "capability:use", {
          ...resource,
          capability: body.capability,
        })
      )
        throw new CoreError("forbidden", 403);
      const durationMs = run.durationMs + body.durationMs,
        costMicros = run.costMicros + body.costMicros;
      if (
        !Number.isSafeInteger(durationMs) ||
        !Number.isSafeInteger(costMicros)
      )
        invalid();
      const [event] = await tx
        .insert(runEvents)
        .values({
          workspaceId: run.workspaceId,
          runId,
          kind: body.kind,
          capability: body.capability ?? null,
          title: body.title,
          text: body.text,
          sourceUrl: body.sourceUrl,
          testStatus: body.testStatus,
          durationMs: body.durationMs,
          costMicros: body.costMicros,
        })
        .returning();
      const [profile] = await tx
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, run.agentId));
      const limited =
        profile &&
        ((profile.maxDurationMs !== null &&
          durationMs >= profile.maxDurationMs) ||
          (profile.maxCostMicros !== null &&
            costMicros >= profile.maxCostMicros));
      await bump(tx, run, {
        durationMs,
        costMicros,
        ...(limited ? { status: "paused" as const } : {}),
      });
      if (limited)
        await notifyPeople(
          tx,
          task,
          run,
          "blocker",
          "run_limit_reached",
          null,
          profile.supervisorId,
        );
      return toEvent(event);
    });
  }
  async function attachRunArtifact(
    principal: Principal,
    runId: string,
    input: AttachRunArtifact,
  ): Promise<RunArtifact> {
    const body = parse(attachRunArtifactSchema, input);
    return mutation(principal, async (tx) => {
      const { run } = await lockedRun(
        tx,
        principal,
        runId,
        body.version,
        "files:attach",
      );
      if (run.status !== "running") conflict();
      const count = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(runArtifacts)
        .where(eq(runArtifacts.runId, runId));
      if (count[0].count >= 100) conflict();
      const { version: _, ...artifact } = body;
      const [row] = await tx
        .insert(runArtifacts)
        .values({ ...artifact, workspaceId: run.workspaceId, runId })
        .returning();
      await bump(tx, run);
      return toArtifact(row);
    });
  }
  async function submitRun(
    principal: Principal,
    runId: string,
    input: SubmitRun,
  ): Promise<Run> {
    const body = parse(submitRunSchema, input);
    return mutation(principal, async (tx) => {
      const { run, task, actor, resource } = await lockedRun(
        tx,
        principal,
        runId,
        body.version,
        "run:submit",
      );
      if (run.status !== "running") conflict();
      const artifacts = await tx
        .select({ id: runArtifacts.id })
        .from(runArtifacts)
        .where(eq(runArtifacts.runId, runId));
      if (!artifacts.length) invalid();
      const [profile] = await tx
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, run.agentId));
      const agentActor: Actor = {
        ...actor,
        kind: "agent",
        id: run.agentId,
        reviewPolicy: profile?.reviewPolicy ?? "always_review",
        scopes: ["tasks:write"],
        permissions: [],
        grants: [],
      };
      const maySkip = can(agentActor, "task:finish", {
        ...resource,
        requestedReview: body.requestReview,
      });
      if (!maySkip && !can(actor, "run:request_review", resource))
        throw new CoreError("forbidden", 403);
      const status = maySkip ? "completed" : "needs_review";
      await tx
        .insert(reviewChecks)
        .values({
          id: runId,
          workspaceId: run.workspaceId,
          matchesDescription: false,
          verifiable: false,
          withinPermissions: false,
        })
        .onConflictDoUpdate({
          target: reviewChecks.id,
          set: {
            matchesDescription: false,
            verifiable: false,
            withinPermissions: false,
            updatedAt: new Date(),
          },
        });
      const updated = await bump(tx, run, {
        status,
        summary: body.summary,
        finishedAt: maySkip ? new Date() : null,
      });
      await tx
        .update(tasks)
        .set({
          status: maySkip ? "done" : "needs_review",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id));
      await tx
        .update(inboxItems)
        .set({ resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(inboxItems.runId, runId), isNull(inboxItems.grantId)));
      if (maySkip)
        await notifyPeople(
          tx,
          task,
          run,
          "done",
          task.title,
          null,
          profile?.supervisorId ?? null,
        );
      else
        await notifyPeople(
          tx,
          task,
          run,
          "review",
          task.title,
          null,
          profile?.supervisorId ?? null,
        );
      return toRun(updated);
    });
  }
  async function getReview(
    principal: Principal,
    taskId: string,
  ): Promise<ReviewWorkspace> {
    const task = await getTask(principal, taskId);
    const [latest] = await db
      .select()
      .from(runs)
      .where(eq(runs.taskId, taskId))
      .orderBy(desc(runs.startedAt), desc(runs.id))
      .limit(1);
    if (!latest) throw new CoreError("not_found", 404);
    const detail = await getRun(principal, latest.id);
    const [checks] = await db
      .select()
      .from(reviewChecks)
      .where(eq(reviewChecks.id, latest.id));
    const comments = await db
      .select()
      .from(reviewComments)
      .where(eq(reviewComments.runId, latest.id))
      .orderBy(reviewComments.createdAt, reviewComments.id);
    const actor = await loadActor(db, principal, task.workspaceId);
    const [profile] = await db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.id, latest.agentId));
    return {
      ...detail,
      task,
      checks: checks
        ? {
            matchesDescription: checks.matchesDescription,
            verifiable: checks.verifiable,
            withinPermissions: checks.withinPermissions,
          }
        : {
            matchesDescription: false,
            verifiable: false,
            withinPermissions: false,
          },
      comments: comments.map(toComment),
      canReview:
        latest.status === "needs_review" &&
        can(actor, "task:review", {
          workspaceId: task.workspaceId,
          ownerId: task.ownerId,
          supervisorId: profile?.supervisorId,
        }),
    };
  }
  async function addReviewComment(
    principal: Principal,
    runId: string,
    input: ReviewCommentInput,
  ): Promise<ReviewComment> {
    const body = parse(reviewCommentSchema, input);
    return mutation(principal, async (tx) => {
      const { run, actor } = await lockedRun(
        tx,
        principal,
        runId,
        body.version,
        "review:comment",
      );
      if (!ACTIVE.includes(run.status)) conflict();
      if (body.artifactId) {
        const [item] = await tx
          .select()
          .from(runArtifacts)
          .where(
            and(
              eq(runArtifacts.id, body.artifactId),
              eq(runArtifacts.runId, runId),
            ),
          );
        if (!item) invalid();
        if (body.line && body.line > item.content.split("\n").length) invalid();
      } else if (body.line) invalid();
      if (
        body.eventId &&
        !(
          await tx
            .select()
            .from(runEvents)
            .where(
              and(eq(runEvents.id, body.eventId), eq(runEvents.runId, runId)),
            )
        ).length
      )
        invalid();
      const { version: _, ...comment } = body;
      const [row] = await tx
        .insert(reviewComments)
        .values({
          ...comment,
          workspaceId: run.workspaceId,
          runId,
          authorId: actor.id,
        })
        .returning();
      await bump(tx, run);
      return toComment(row);
    });
  }
  async function reviewRun(
    principal: Principal,
    runId: string,
    input: ReviewRun,
  ): Promise<Run> {
    const body = parse(reviewRunSchema, input);
    return mutation(principal, async (tx) => {
      const { run, task, actor } = await lockedRun(
        tx,
        principal,
        runId,
        body.version,
        "task:review",
      );
      if (run.status !== "needs_review" || task.status !== "needs_review")
        conflict();
      const artifacts = await tx
        .select()
        .from(runArtifacts)
        .where(eq(runArtifacts.runId, runId));
      const ids = new Set(body.items.map((item) => item.artifactId));
      if (
        ids.size !== body.items.length ||
        body.items.some(
          (item) =>
            !artifacts.some((artifact) => artifact.id === item.artifactId),
        )
      )
        invalid();
      if (
        body.decision === "approve" &&
        (!body.checks.matchesDescription ||
          !body.checks.verifiable ||
          !body.checks.withinPermissions ||
          !artifacts.length ||
          ids.size !== artifacts.length ||
          body.items.some((item) => item.decision !== "approve"))
      )
        invalid();
      if (
        body.decision === "request_changes" &&
        !body.comment &&
        !body.items.some((item) => item.comment)
      )
        invalid();
      await tx
        .insert(reviewChecks)
        .values({ id: runId, workspaceId: run.workspaceId, ...body.checks })
        .onConflictDoUpdate({
          target: reviewChecks.id,
          set: { ...body.checks, updatedAt: new Date() },
        });
      for (const item of body.items) {
        await tx.insert(reviewItems).values({
          workspaceId: run.workspaceId,
          runId,
          artifactId: item.artifactId,
          decision: item.decision,
          reviewedBy: actor.id,
        });
        if (item.comment)
          await tx.insert(reviewComments).values({
            workspaceId: run.workspaceId,
            runId,
            artifactId: item.artifactId,
            authorId: actor.id,
            body: item.comment,
          });
      }
      if (body.comment)
        await tx.insert(reviewComments).values({
          workspaceId: run.workspaceId,
          runId,
          authorId: actor.id,
          body: body.comment,
        });
      const approved = body.decision === "approve";
      const updated = await bump(tx, run, {
        status: approved ? "completed" : "changes_requested",
        finishedAt: approved ? new Date() : null,
      });
      await tx
        .update(tasks)
        .set({
          status: approved ? "done" : "in_progress",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, task.id));
      await tx
        .update(inboxItems)
        .set({ resolvedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(inboxItems.runId, runId), eq(inboxItems.kind, "review")));
      return toRun(updated);
    });
  }
  async function agentMember(query: Database | Transaction, agentId: string) {
    parse(idSchema, agentId);
    const [member] = await query
      .select()
      .from(members)
      .where(eq(members.id, agentId))
      .limit(1);
    if (!member) throw new CoreError("not_found", 404);
    if (member.kind !== "agent") invalid();
    return member;
  }
  async function getAgentProfile(
    principal: Principal,
    agentId: string,
  ): Promise<AgentProfile> {
    const member = await agentMember(db, agentId);
    const actor = await requireMember(
      db,
      principal,
      member.workspaceId,
      "workspace:read",
    );
    const [profile] = await db
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.id, agentId));
    const permissions = await db
      .select()
      .from(agentPermissions)
      .where(eq(agentPermissions.agentId, agentId));
    const grantRows = await db
      .select()
      .from(grants)
      .where(eq(grants.agentId, agentId))
      .orderBy(desc(grants.createdAt))
      .limit(200);
    const history = await db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.workspaceId, member.workspaceId),
          or(
            eq(activity.resourceId, agentId),
            inArray(activity.resourceId, [
              ...permissions.map((row) => row.id),
              ...grantRows.map((row) => row.id),
            ]),
          ),
        ),
      )
      .orderBy(desc(activity.createdAt))
      .limit(200);
    return {
      member,
      supervisorId: profile?.supervisorId ?? null,
      reviewPolicy: profile?.reviewPolicy ?? "always_review",
      maxDurationMs: profile?.maxDurationMs ?? null,
      maxCostMicros: profile?.maxCostMicros ?? null,
      permissions: capabilitySchema.options.map((capability) => ({
        capability,
        decision:
          permissions.find((row) => row.capability === capability)?.decision ??
          DEFAULT_PERMISSIONS[capability],
      })),
      grants: grantRows.map(toGrant),
      history: history.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        action: row.action,
        resourceId: row.resourceId,
        details: row.details as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      })),
      runs: (
        await db
          .select()
          .from(runs)
          .where(eq(runs.agentId, agentId))
          .orderBy(desc(runs.startedAt))
          .limit(100)
      ).map(toRun),
      canManage: can(actor, "agent:manage", {
        workspaceId: member.workspaceId,
      }),
      canDecideGrants: can(actor, "grant:decide", {
        workspaceId: member.workspaceId,
        supervisorId: profile?.supervisorId ?? null,
      }),
    };
  }
  async function updateAgentProfile(
    principal: Principal,
    agentId: string,
    input: AgentProfileInput,
  ): Promise<AgentProfile> {
    const body = parse(agentProfileInputSchema, input);
    await mutation(principal, async (tx) => {
      const member = await agentMember(tx, agentId);
      await requireMember(tx, principal, member.workspaceId, "agent:manage");
      if (body.supervisorId) {
        const [supervisor] = await tx
          .select()
          .from(members)
          .where(
            and(
              eq(members.id, body.supervisorId),
              eq(members.workspaceId, member.workspaceId),
            ),
          );
        if (supervisor?.kind !== "person") invalid();
      }
      await tx
        .insert(agentProfiles)
        .values({ id: agentId, workspaceId: member.workspaceId, ...body })
        .onConflictDoUpdate({
          target: agentProfiles.id,
          set: { ...body, updatedAt: new Date() },
        });
    });
    return getAgentProfile(principal, agentId);
  }
  async function setAgentPermission(
    principal: Principal,
    agentId: string,
    input: AgentPermissionInput,
  ): Promise<AgentProfile> {
    const body = parse(agentPermissionInputSchema, input);
    await mutation(principal, async (tx) => {
      const member = await agentMember(tx, agentId);
      await requireMember(tx, principal, member.workspaceId, "agent:manage");
      await tx
        .insert(agentPermissions)
        .values({ workspaceId: member.workspaceId, agentId, ...body })
        .onConflictDoUpdate({
          target: [agentPermissions.agentId, agentPermissions.capability],
          set: { decision: body.decision, updatedAt: new Date() },
        });
    });
    return getAgentProfile(principal, agentId);
  }
  async function requestGrant(
    principal: Principal,
    agentId: string,
    input: RequestGrant,
  ): Promise<Grant> {
    const body = parse(requestGrantSchema, input);
    return mutation(principal, async (tx) => {
      const member = await agentMember(tx, agentId);
      let task: typeof tasks.$inferSelect | undefined;
      let run: typeof runs.$inferSelect | undefined;
      if (body.runId) {
        const [candidate] = await tx
          .select()
          .from(runs)
          .where(
            and(
              eq(runs.id, body.runId),
              eq(runs.workspaceId, member.workspaceId),
              eq(runs.agentId, agentId),
            ),
          );
        if (!candidate) invalid();
        task = await lockTask(tx, candidate.taskId);
        [run] = await tx
          .select()
          .from(runs)
          .where(eq(runs.id, candidate.id))
          .for("update");
        if (body.taskId && body.taskId !== task.id) invalid();
        if (!["running", "paused"].includes(run.status)) conflict();
      } else if (body.taskId) {
        task = await lockTask(tx, body.taskId);
        if (
          task.workspaceId !== member.workspaceId ||
          task.workerId !== agentId
        )
          invalid();
      }
      const actor = await requireMember(
        tx,
        principal,
        member.workspaceId,
        "grant:request",
        {
          workspaceId: member.workspaceId,
          agentId,
          ownerId: task?.ownerId,
          capability: body.capability,
        },
      );
      const [permission] = await tx
        .select()
        .from(agentPermissions)
        .where(
          and(
            eq(agentPermissions.agentId, agentId),
            eq(agentPermissions.capability, body.capability),
          ),
        );
      if (
        (permission?.decision ?? DEFAULT_PERMISSIONS[body.capability]) ===
        "deny"
      )
        throw new CoreError("forbidden", 403);
      if (principal.kind === "agent" && actor.id !== agentId)
        throw new CoreError("forbidden", 403);
      await tx
        .select({ id: members.id })
        .from(members)
        .where(eq(members.id, agentId))
        .for("update");
      const pending = await tx
        .select()
        .from(grants)
        .where(
          and(
            eq(grants.agentId, agentId),
            eq(grants.capability, body.capability),
            eq(grants.status, "pending"),
            body.runId ? eq(grants.runId, body.runId) : isNull(grants.runId),
            task ? eq(grants.taskId, task.id) : isNull(grants.taskId),
          ),
        );
      if (pending.length) conflict();
      const [grant] = await tx
        .insert(grants)
        .values({
          workspaceId: member.workspaceId,
          agentId,
          capability: body.capability,
          taskId: task?.id ?? null,
          runId: run?.id ?? null,
          reason: body.reason,
        })
        .returning();
      const [profile] = await tx
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, agentId));
      if (run?.status === "running") await bump(tx, run, { status: "paused" });
      if (task)
        await notifyPeople(
          tx,
          task,
          run ?? null,
          "blocker",
          body.reason,
          grant.id,
          profile?.supervisorId ?? null,
        );
      else {
        const people = await tx
          .select()
          .from(members)
          .where(
            and(
              eq(members.workspaceId, member.workspaceId),
              eq(members.kind, "person"),
            ),
          );
        const recipients = people.filter(
          (person) =>
            person.role === "admin" || person.id === profile?.supervisorId,
        );
        if (recipients.length)
          await tx.insert(inboxItems).values(
            recipients.map((person) => ({
              workspaceId: member.workspaceId,
              memberId: person.id,
              agentId,
              grantId: grant.id,
              kind: "blocker",
              title: body.reason,
            })),
          );
      }
      return toGrant(grant);
    });
  }
  async function decideGrant(
    principal: Principal,
    grantId: string,
    input: DecideGrant,
  ): Promise<Grant> {
    parse(idSchema, grantId);
    const body = parse(decideGrantSchema, input);
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (
      body.decision === "allow" &&
      (!expiresAt ||
        expiresAt.getTime() <= Date.now() ||
        expiresAt.getTime() > Date.now() + 30 * 86400000)
    )
      invalid();
    return mutation(principal, async (tx) => {
      const [candidate] = await tx
        .select()
        .from(grants)
        .where(eq(grants.id, grantId));
      if (!candidate) throw new CoreError("not_found", 404);
      if (candidate.taskId) await lockTask(tx, candidate.taskId);
      const [grant] = await tx
        .select()
        .from(grants)
        .where(eq(grants.id, grantId))
        .for("update");
      const [profile] = await tx
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, grant.agentId));
      const actor = await requireMember(
        tx,
        principal,
        grant.workspaceId,
        "grant:decide",
        { workspaceId: grant.workspaceId, supervisorId: profile?.supervisorId },
      );
      if (
        body.decision === "revoke"
          ? grant.status !== "allowed"
          : grant.status !== "pending"
      )
        conflict();
      if (body.decision === "allow") {
        const [permission] = await tx
          .select()
          .from(agentPermissions)
          .where(
            and(
              eq(agentPermissions.agentId, grant.agentId),
              eq(agentPermissions.capability, grant.capability),
            ),
          );
        if (
          (permission?.decision ??
            DEFAULT_PERMISSIONS[grant.capability as Grant["capability"]]) ===
          "deny"
        )
          throw new CoreError("forbidden", 403);
      }
      const [updated] = await tx
        .update(grants)
        .set({
          status:
            body.decision === "allow"
              ? "allowed"
              : body.decision === "deny"
                ? "denied"
                : "revoked",
          decidedBy: actor.id,
          expiresAt: body.decision === "allow" ? expiresAt : null,
          updatedAt: new Date(),
        })
        .where(eq(grants.id, grantId))
        .returning();
      await tx
        .update(inboxItems)
        .set({ resolvedAt: new Date(), updatedAt: new Date() })
        .where(eq(inboxItems.grantId, grantId));
      return toGrant(updated);
    });
  }
  async function listInbox(
    principal: Principal,
    workspaceId: string,
    filter: { tab?: "all" | "reviews" | "blockers" } = {},
  ): Promise<Inbox> {
    parse(idSchema, workspaceId);
    const body = parse(inboxFilterSchema, filter);
    const actor = await requireMember(db, principal, workspaceId, "inbox:read");
    const visible = (
      await db
        .select()
        .from(inboxItems)
        .where(
          and(
            eq(inboxItems.workspaceId, workspaceId),
            eq(inboxItems.memberId, actor.id),
            isNull(inboxItems.resolvedAt),
            or(
              isNull(inboxItems.snoozedUntil),
              sql`${inboxItems.snoozedUntil} <= now()`,
            ),
          ),
        )
        .orderBy(desc(inboxItems.createdAt))
    ).map(toInbox);
    const unread = visible.filter((item) => !item.readAt);
    const items = visible.filter(
      (item) =>
        body.tab === "all" ||
        item.kind === (body.tab === "reviews" ? "review" : "blocker"),
    );
    const groups = [...new Set(items.map((item) => item.taskId))].map(
      (taskId) => ({
        taskId,
        items: items.filter((item) => item.taskId === taskId),
      }),
    );
    return {
      items,
      groups,
      unreadCount: unread.length,
      reviewCount: unread.filter((item) => item.kind === "review").length,
      blockerCount: unread.filter((item) => item.kind === "blocker").length,
    };
  }
  async function updateInboxItem(
    principal: Principal,
    itemId: string,
    input: InboxItemInput,
  ): Promise<InboxItem> {
    parse(idSchema, itemId);
    const body = parse(inboxItemInputSchema, input);
    if (body.snoozedUntil && Date.parse(body.snoozedUntil) <= Date.now())
      invalid();
    return mutation(principal, async (tx) => {
      const [item] = await tx
        .select()
        .from(inboxItems)
        .where(eq(inboxItems.id, itemId))
        .for("update");
      if (!item) throw new CoreError("not_found", 404);
      await requireMember(tx, principal, item.workspaceId, "inbox:update", {
        workspaceId: item.workspaceId,
        memberId: item.memberId,
      });
      const [updated] = await tx
        .update(inboxItems)
        .set({
          ...(body.read === undefined
            ? {}
            : { readAt: body.read ? new Date() : null }),
          ...(body.snoozedUntil === undefined
            ? {}
            : {
                snoozedUntil: body.snoozedUntil
                  ? new Date(body.snoozedUntil)
                  : null,
              }),
          updatedAt: new Date(),
        })
        .where(eq(inboxItems.id, itemId))
        .returning();
      return toInbox(updated);
    });
  }
  async function requestReview(
    principal: Principal,
    taskId: string,
    input: { note?: string } = {},
  ): Promise<Task> {
    const body = parse(mcpInboxRequestReviewArgs, { ...input, taskId });
    const task = await getTask(principal, taskId);
    const [run] = await db
      .select()
      .from(runs)
      .where(and(eq(runs.taskId, taskId), eq(runs.status, "running")))
      .orderBy(desc(runs.startedAt))
      .limit(1);
    if (!run) conflict();
    await submitRun(principal, run.id, {
      version: run.version,
      summary: body.note?.trim() || task.title,
      requestReview: true,
    });
    return getTask(principal, taskId);
  }
  return {
    requestReview,
    getTask,
    listRuns,
    getRun,
    startRun,
    controlRun,
    appendRunEvent,
    attachRunArtifact,
    submitRun,
    getReview,
    addReviewComment,
    reviewRun,
    getAgentProfile,
    updateAgentProfile,
    setAgentPermission,
    requestGrant,
    decideGrant,
    listInbox,
    updateInboxItem,
  };
}
