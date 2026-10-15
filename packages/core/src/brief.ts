import type {
  Brief,
  BriefAction,
  BriefProject,
  BriefScope,
  RunStatus,
  SuggestionKind,
  TaskStatus,
} from "@taff/schemas";
import { buildPlanModel, type PlanModelInput } from "./plan-model";

/**
 * Everything the brief and Ask taff read, loaded by core from the caller's
 * memberships only. Pure data: no names beyond project names, no prose.
 */
export type BriefSource = {
  /** The reader's civil date and zone. */
  today: string;
  timeZone: string;
  scope: BriefScope;
  workspaceIds: string[];
  projects: {
    workspaceId: string;
    projectId: string;
    name: string;
    /** The same input the timeline builds (finance null without finance:read). */
    plan: PlanModelInput;
  }[];
  /** Runs waiting in needs_review that the reader may review. */
  reviews: {
    workspaceId: string;
    taskId: string;
    runId: string;
    agentId: string;
  }[];
  /** Every pending grant in the workspaces; `canDecide` for the reader. */
  pendingGrants: {
    workspaceId: string;
    grantId: string;
    agentId: string;
    taskId: string | null;
    capability: string;
    canDecide: boolean;
  }[];
  /** Pending person or agent proposals the reader may apply or dismiss. */
  suggestions: {
    workspaceId: string;
    suggestionId: string;
    kind: SuggestionKind;
    taskId: string | null;
    proposerId?: string;
    /** Legacy source fixtures. */
    agentId?: string;
  }[];
  /** Open tasks the reader owns or works on, with their civil due date. */
  myTasks: {
    workspaceId: string;
    taskId: string;
    projectId: string | null;
    status: TaskStatus;
    dueDate: string | null;
  }[];
  /** Agent runs that are running or paused. */
  agentRuns: {
    workspaceId: string;
    agentId: string;
    runId: string;
    taskId: string;
    status: RunStatus;
  }[];
};

const RANK = { high: 2, medium: 1, low: 0 } as const;
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The deterministic brief (plan §4.4, M17). Each project's risk is exactly
 * `buildPlanModel(plan).risk`, so brief numbers equal the timeline's. Codes
 * and numbers only; the web writes the sentences in the reader's language.
 */
export function buildBrief(source: BriefSource): Brief {
  const projects: BriefProject[] = source.projects
    .map((project) => ({
      workspaceId: project.workspaceId,
      projectId: project.projectId,
      name: project.name,
      risk: buildPlanModel(project.plan).risk,
    }))
    .sort(
      (a, b) =>
        RANK[b.risk.level] - RANK[a.risk.level] ||
        b.risk.slipDays - a.risk.slipDays ||
        byText(a.name, b.name) ||
        byText(a.projectId, b.projectId),
    );
  const onTrack = projects.filter((p) => p.risk.level === "low").length;
  const decidable = source.pendingGrants.filter((grant) => grant.canDecide);
  const actions: BriefAction[] = [
    ...source.reviews.map(
      (review): BriefAction => ({ kind: "review", ...review }),
    ),
    ...decidable.map(
      (grant): BriefAction => ({
        kind: "grant",
        workspaceId: grant.workspaceId,
        grantId: grant.grantId,
        agentId: grant.agentId,
        taskId: grant.taskId,
        capability: grant.capability,
      }),
    ),
    ...source.suggestions.map(
      (suggestion): BriefAction => ({
        kind: "suggestion",
        workspaceId: suggestion.workspaceId,
        suggestionId: suggestion.suggestionId,
        suggestionKind: suggestion.kind,
        taskId: suggestion.taskId,
        proposerId: suggestion.proposerId ?? suggestion.agentId,
        agentId: suggestion.agentId,
      }),
    ),
  ];
  return {
    today: source.today,
    timeZone: source.timeZone,
    scope: source.scope,
    workspaceIds: source.workspaceIds,
    projects,
    counts: {
      projects: projects.length,
      onTrack,
      atRisk: projects.length - onTrack,
      reviewsWaiting: source.reviews.length,
      pendingGrants: decidable.length,
      pendingSuggestions: source.suggestions.length,
      blockedAgents: new Set(
        source.pendingGrants.map(
          (grant) => `${grant.workspaceId}:${grant.agentId}`,
        ),
      ).size,
      dueToday: source.myTasks.filter(
        (task) => task.status !== "done" && task.dueDate === source.today,
      ).length,
      agentsWorking: new Set(
        source.agentRuns
          .filter((run) => run.status === "running")
          .map((run) => `${run.workspaceId}:${run.agentId}`),
      ).size,
    },
    actions,
  };
}
