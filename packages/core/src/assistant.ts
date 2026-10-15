import {
  agentProfiles,
  type Database,
  grants,
  members,
  projects,
  runs,
  suggestions,
  type Transaction,
  tasks,
  workspaces,
} from "@taff/db";
import {
  type AiSettings,
  type AskAnswer,
  type AskInput,
  type AskItem,
  aiSettingsInputSchema,
  askInputSchema,
  type Brief,
  type BriefLabels,
  type BriefQuery,
  type BriefScope,
  briefQuerySchema,
  idSchema,
  SchemaError,
  type SuggestionKind,
} from "@taff/schemas";
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { AiProvider } from "./ai-provider";
import { answerAsk } from "./ask";
import { type BriefSource, buildBrief } from "./brief";
import { CoreError, type Principal } from "./index";
import { type Action, type Actor, can, type Resource } from "./permissions";
import type { PlanModelInput } from "./plan-model";
import { localDate } from "./quick-add";

function parse<T>(schema: { parse(v: unknown): T }, v: unknown): T {
  try {
    return schema.parse(v);
  } catch (e) {
    if (e instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw e;
  }
}

/** The only instructions the model gets; the data is codes, ids and numbers. */
const SYSTEM_PROMPT =
  "You are taff, a progress assistant for teams of people and AI agents. Answer the question in one to three plain sentences, in the language of the question, using only the structured answer given. Refer to items by their kind and position, never invent tasks, people, dates or numbers.";

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
  zoneOf(
    q: Database | Transaction,
    p: Principal,
    actor: Actor,
  ): Promise<string>;
  planSource(
    actor: Actor,
    project: typeof projects.$inferSelect,
    timeZone: string,
  ): Promise<{ input: PlanModelInput }>;
  ai?: AiProvider;
};

/** Brief, Ask taff and the model-path switch (M17, D6). */
export function createAssistantOperations({
  db,
  mutation,
  requireMember,
  zoneOf,
  planSource,
  ai,
}: Dependencies) {
  /** The caller's memberships only: one workspace, or all of a person's. */
  async function memberships(
    p: Principal,
    scope: BriefScope,
    workspaceId?: string,
  ): Promise<string[]> {
    if (p.kind === "agent") {
      if (workspaceId && workspaceId !== p.workspaceId)
        throw new CoreError("forbidden", 403);
      return [p.workspaceId];
    }
    if (scope === "workspace") return [workspaceId as string];
    const rows = await db
      .select({ id: members.workspaceId })
      .from(members)
      .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
      .where(eq(members.userId, p.userId))
      .orderBy(asc(workspaces.createdAt), asc(workspaces.id));
    return rows.map((row) => row.id);
  }

  async function loadSource(
    p: Principal,
    scope: BriefScope,
    workspaceId?: string,
  ): Promise<BriefSource> {
    const ids = await memberships(p, scope, workspaceId);
    const actors: Actor[] = [];
    for (const w of ids)
      actors.push(await requireMember(db, p, w, "workspace:read"));
    // A person's saved zone; an agent's supervisor's (it has one workspace).
    const timeZone = await zoneOf(db, p, actors[0] as Actor);
    const source: BriefSource = {
      today: localDate(new Date(), timeZone),
      timeZone,
      scope,
      workspaceIds: ids,
      projects: [],
      reviews: [],
      pendingGrants: [],
      suggestions: [],
      myTasks: [],
      agentRuns: [],
    };
    for (const actor of actors) {
      const w = actor.workspaceId;
      const projectRows = await db
        .select()
        .from(projects)
        .where(and(eq(projects.workspaceId, w), eq(projects.archived, false)))
        .orderBy(asc(projects.name), asc(projects.id));
      for (const project of projectRows)
        source.projects.push({
          workspaceId: w,
          projectId: project.id,
          name: project.name,
          plan: (await planSource(actor, project, timeZone)).input,
        });
      const reviewRows = await db
        .select({
          runId: runs.id,
          taskId: runs.taskId,
          agentId: runs.agentId,
          ownerId: tasks.ownerId,
          supervisorId: agentProfiles.supervisorId,
        })
        .from(runs)
        .innerJoin(tasks, eq(tasks.id, runs.taskId))
        .leftJoin(agentProfiles, eq(agentProfiles.id, runs.agentId))
        .where(and(eq(runs.workspaceId, w), eq(runs.status, "needs_review")))
        .orderBy(asc(runs.updatedAt), asc(runs.id));
      for (const row of reviewRows)
        if (
          can(actor, "task:review", {
            workspaceId: w,
            ownerId: row.ownerId,
            supervisorId: row.supervisorId,
          })
        )
          source.reviews.push({
            workspaceId: w,
            taskId: row.taskId,
            runId: row.runId,
            agentId: row.agentId,
          });
      const grantRows = await db
        .select({
          grantId: grants.id,
          agentId: grants.agentId,
          taskId: grants.taskId,
          capability: grants.capability,
          supervisorId: agentProfiles.supervisorId,
        })
        .from(grants)
        .leftJoin(agentProfiles, eq(agentProfiles.id, grants.agentId))
        .where(and(eq(grants.workspaceId, w), eq(grants.status, "pending")))
        .orderBy(asc(grants.createdAt), asc(grants.id));
      for (const row of grantRows)
        source.pendingGrants.push({
          workspaceId: w,
          grantId: row.grantId,
          agentId: row.agentId,
          taskId: row.taskId,
          capability: row.capability,
          canDecide: can(actor, "grant:decide", {
            workspaceId: w,
            supervisorId: row.supervisorId,
          }),
        });
      const suggestionRows = await db
        .select({
          id: suggestions.id,
          kind: suggestions.kind,
          taskId: suggestions.taskId,
          proposerId: suggestions.createdBy,
          proposerKind: members.kind,
          ownerId: tasks.ownerId,
        })
        .from(suggestions)
        .innerJoin(members, eq(members.id, suggestions.createdBy))
        .leftJoin(tasks, eq(tasks.id, suggestions.taskId))
        .where(
          and(
            eq(suggestions.workspaceId, w),
            eq(suggestions.status, "pending"),
          ),
        )
        .orderBy(asc(suggestions.createdAt), asc(suggestions.id));
      for (const row of suggestionRows)
        if (
          row.ownerId &&
          can(actor, "suggestion:decide", {
            workspaceId: w,
            ownerId: row.ownerId,
          })
        )
          source.suggestions.push({
            workspaceId: w,
            suggestionId: row.id,
            kind: row.kind as SuggestionKind,
            taskId: row.taskId,
            proposerId: row.proposerId,
            agentId: row.proposerKind === "agent" ? row.proposerId : undefined,
          });
      const mine = await db
        .select({
          id: tasks.id,
          projectId: tasks.projectId,
          status: tasks.status,
          dueAt: tasks.dueAt,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, w),
            ne(tasks.status, "done"),
            sql`${tasks.archivedAt} IS NULL`,
            or(eq(tasks.ownerId, actor.id), eq(tasks.workerId, actor.id)),
          ),
        )
        .orderBy(asc(tasks.number));
      for (const task of mine)
        source.myTasks.push({
          workspaceId: w,
          taskId: task.id,
          projectId: task.projectId,
          status: task.status,
          dueDate: task.dueAt ? localDate(task.dueAt, timeZone) : null,
        });
      const runRows = await db
        .select({
          runId: runs.id,
          agentId: runs.agentId,
          taskId: runs.taskId,
          status: runs.status,
        })
        .from(runs)
        .where(
          and(
            eq(runs.workspaceId, w),
            inArray(runs.status, ["running", "paused"]),
          ),
        )
        .orderBy(asc(runs.startedAt), asc(runs.id));
      for (const run of runRows)
        source.agentRuns.push({ workspaceId: w, ...run });
    }
    return source;
  }

  /**
   * Names for the ids a brief or answer mentions, from the reader's own
   * workspaces only (the web shows titles instead of ids). Never given to
   * the model, and not part of the MCP brief.
   */
  async function loadLabels(
    source: BriefSource,
    mentioned: {
      taskIds: Iterable<string | null | undefined>;
      agentIds: Iterable<string | undefined>;
    },
  ): Promise<BriefLabels> {
    const w = source.workspaceIds;
    const taskIds = [...new Set(mentioned.taskIds)].filter(
      (id): id is string => !!id,
    );
    const agentIds = [...new Set(mentioned.agentIds)].filter(
      (id): id is string => !!id,
    );
    const [workspaceRows, taskRows, agentRows] = await Promise.all([
      w.length
        ? db
            .select({
              id: workspaces.id,
              name: workspaces.name,
              key: workspaces.key,
            })
            .from(workspaces)
            .where(inArray(workspaces.id, w))
        : [],
      w.length && taskIds.length
        ? db
            .select({
              id: tasks.id,
              workspaceId: tasks.workspaceId,
              number: tasks.number,
              title: tasks.title,
              projectId: tasks.projectId,
            })
            .from(tasks)
            .where(
              and(inArray(tasks.workspaceId, w), inArray(tasks.id, taskIds)),
            )
        : [],
      w.length && agentIds.length
        ? db
            .select({
              id: members.id,
              workspaceId: members.workspaceId,
              name: members.name,
              kind: members.kind,
            })
            .from(members)
            .where(
              and(
                inArray(members.workspaceId, w),
                inArray(members.id, agentIds),
              ),
            )
        : [],
    ]);
    const byId = (a: { id: string }, b: { id: string }) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    return {
      workspaces: workspaceRows.sort(
        (a, b) => w.indexOf(a.id) - w.indexOf(b.id),
      ),
      projects: source.projects.map((project) => ({
        id: project.projectId,
        workspaceId: project.workspaceId,
        name: project.name,
      })),
      tasks: taskRows.sort(byId),
      milestones: source.projects.flatMap((project) =>
        project.plan.milestones.map((milestone) => ({
          id: milestone.id,
          projectId: project.projectId,
          name: milestone.name,
        })),
      ),
      members: agentRows.map(({ kind: _kind, ...row }) => row).sort(byId),
      agents: agentRows
        .filter((row) => row.kind === "agent")
        .map(({ kind: _kind, ...row }) => row)
        .sort(byId),
    };
  }

  async function getBrief(
    p: Principal,
    query: BriefQuery = {},
    options: { labels?: boolean } = {},
  ): Promise<Brief> {
    const body = parse(briefQuerySchema, query);
    const scope = body.scope ?? (body.workspaceId ? "workspace" : "all");
    const source = await loadSource(p, scope, body.workspaceId);
    const brief = buildBrief(source);
    if (!options.labels) return brief;
    return {
      ...brief,
      labels: await loadLabels(source, {
        taskIds: [
          ...brief.projects.flatMap((project) => [
            project.risk.blockedTaskId,
            project.risk.driverTaskId,
          ]),
          ...brief.actions.map((action) => action.taskId),
        ],
        agentIds: brief.actions.map((action) =>
          action.kind === "suggestion"
            ? (action.proposerId ?? action.agentId)
            : action.agentId,
        ),
      }),
    };
  }

  async function ask(
    p: Principal,
    input: AskInput,
    options: { labels?: boolean } = {},
  ): Promise<AskAnswer> {
    const { source, answer } = await answerQuestion(p, input);
    if (!options.labels) return answer;
    return {
      ...answer,
      labels: await loadLabels(source, {
        taskIds: answer.items.map((item: AskItem) => item.taskId),
        agentIds: answer.items.map(
          (item: AskItem) => item.proposerId ?? item.agentId,
        ),
      }),
    };
  }

  async function answerQuestion(
    p: Principal,
    input: AskInput,
  ): Promise<{ source: BriefSource; answer: AskAnswer }> {
    const body = parse(askInputSchema, input);
    const source = await loadSource(
      p,
      body.workspaceId ? "workspace" : "all",
      body.workspaceId,
    );
    const answer = answerAsk(body.question, source, buildBrief(source));
    // The model path (D6): only with a configured provider AND a workspace
    // that opted in. A question across every membership never leaves.
    if (ai && body.workspaceId && answer.intent !== "unknown") {
      const [workspace] = await db
        .select({ aiEnabled: workspaces.aiEnabled })
        .from(workspaces)
        .where(eq(workspaces.id, body.workspaceId));
      if (workspace?.aiEnabled) {
        // Minimum context: the question and the structured answer (codes,
        // ids and numbers). No titles, names, contacts or finance.
        const text = await ai.complete({
          system: SYSTEM_PROMPT,
          user: JSON.stringify({
            question: body.question,
            today: source.today,
            intent: answer.intent,
            items: answer.items.map(({ workspaceId: _w, ...item }) => item),
          }),
        });
        if (text)
          return { source, answer: { ...answer, text, source: "model" } };
      }
    }
    return { source, answer: { ...answer, text: null, source: "rules" } };
  }

  async function getAiSettings(
    p: Principal,
    workspaceId: string,
  ): Promise<AiSettings> {
    parse(idSchema, workspaceId);
    await requireMember(db, p, workspaceId, "workspace:read");
    const [row] = await db
      .select({ aiEnabled: workspaces.aiEnabled })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));
    if (!row) throw new CoreError("not_found", 404);
    return { enabled: row.aiEnabled, available: !!ai };
  }
  /** Admins opt a workspace in or out; the default is off (D6). */
  async function setAiSettings(
    p: Principal,
    workspaceId: string,
    input: { enabled: boolean },
  ): Promise<AiSettings> {
    parse(idSchema, workspaceId);
    const body = parse(aiSettingsInputSchema, input);
    return mutation(p, async (tx) => {
      await requireMember(tx, p, workspaceId, "workspace:manage");
      const [row] = await tx
        .select({ aiEnabled: workspaces.aiEnabled })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .for("update");
      if (!row) throw new CoreError("not_found", 404);
      if (row.aiEnabled !== body.enabled)
        await tx
          .update(workspaces)
          .set({ aiEnabled: body.enabled, updatedAt: new Date() })
          .where(eq(workspaces.id, workspaceId));
      return { enabled: body.enabled, available: !!ai };
    });
  }

  return {
    operations: { getBrief, ask, getAiSettings, setAiSettings },
  };
}
