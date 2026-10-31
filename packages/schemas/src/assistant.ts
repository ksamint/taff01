// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales.
import {
  array,
  boolean,
  extend,
  type infer as Infer,
  iso,
  literal,
  maxLength,
  minLength,
  nullable,
  object,
  optional,
  refine,
  strictObject,
  string,
  union,
  enum as zodEnum,
} from "zod/mini";
import { taskSchema } from "./base";
import {
  civilDateSchema,
  durationDaysSchema,
  projectRiskSchema,
  riskLevelSchema,
  riskReasonSchema,
  taskPlanResultSchema,
} from "./plan";
import {
  boundedText,
  calendarInstantSchema,
  idSchema,
  nonnegativeInteger,
  taskStatusSchema,
  versionSchema,
} from "./primitives";
import { projectStageSchema } from "./project-read";
import { runStatusSchema } from "./run-read";

/*
 * M17: the deterministic brief, agent suggestions a person applies, and Ask
 * taff. Every answer is codes, ids and numbers; the web localizes (plan §4.4).
 */

// Suggestions ---------------------------------------------------------------

export const suggestionKindSchema = zodEnum(["split", "reschedule"]);
export const suggestionStatusSchema = zodEnum([
  "pending",
  "applied",
  "dismissed",
]);
const reason = optional(string().check(maxLength(500)));
/** Split a task into 1–10 subtasks; each defaults to the task's owner. */
export const splitPayloadSchema = strictObject({
  subtasks: array(
    strictObject({
      title: boundedText(200),
      ownerId: optional(idSchema),
      dueAt: optional(calendarInstantSchema),
    }),
  ).check(minLength(1), maxLength(10)),
  reason,
});
/** Move a task's plan: the same core path as PATCH /api/tasks/:id/plan. */
export const reschedulePayloadSchema = strictObject({
  startDate: civilDateSchema,
  durationDays: durationDaysSchema,
  reason,
});
/** POST /api/suggestions (task owner/admin) and the suggestions.create tool. */
export const suggestionInputSchema = strictObject({
  taskId: idSchema,
  kind: suggestionKindSchema,
  payload: union([splitPayloadSchema, reschedulePayloadSchema]),
}).check(
  refine((v) =>
    v.kind === "split" ? "subtasks" in v.payload : "startDate" in v.payload,
  ),
);
const suggestionBase = object({
  id: idSchema,
  workspaceId: idSchema,
  taskId: nullable(idSchema),
  createdBy: idSchema,
  status: suggestionStatusSchema,
  decidedBy: nullable(idSchema),
  decidedAt: nullable(iso.datetime()),
  /** Absent only on older servers; applied history remains retained after undo. */
  undoneAt: optional(nullable(iso.datetime())),
  version: versionSchema,
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const suggestionSchema = union([
  extend(suggestionBase, {
    kind: literal("split"),
    payload: splitPayloadSchema,
  }),
  extend(suggestionBase, {
    kind: literal("reschedule"),
    payload: reschedulePayloadSchema,
  }),
]);
export const suggestionListSchema = array(suggestionSchema);
export const suggestionFilterSchema = strictObject({
  status: optional(suggestionStatusSchema),
  taskId: optional(idSchema),
});
export const suggestionDecisionSchema = strictObject({
  version: versionSchema,
});
/** What applying changed: subtasks created, or the plan result. */
export const suggestionApplyResultSchema = object({
  suggestion: suggestionSchema,
  tasks: array(taskSchema),
  plan: nullable(taskPlanResultSchema),
});
/** Server-persisted inverse: exact inputs and optimistic concurrency guards. */
const inverseTask = object({
  id: idSchema,
  version: versionSchema,
  updatedAt: iso.datetime(),
});
export const suggestionInverseSchema = union([
  object({
    kind: literal("split"),
    tasks: array(inverseTask).check(minLength(1), maxLength(10)),
  }),
  object({
    kind: literal("reschedule"),
    task: inverseTask,
    dueAt: nullable(iso.datetime()),
    planVersion: versionSchema,
    plan: nullable(
      object({
        startDate: civilDateSchema,
        durationDays: durationDaysSchema,
        archivedAt: nullable(iso.datetime()),
      }),
    ),
  }),
]);
export type SuggestionInverse = Infer<typeof suggestionInverseSchema>;
export const mcpSuggestionsCreateArgs = extend(suggestionInputSchema, {
  workspaceId: optional(idSchema),
});

// Brief ---------------------------------------------------------------------

export const briefScopeSchema = zodEnum(["workspace", "all"]);
/** GET /api/brief: `all` spans every membership; `workspace` needs an id. */
export const briefQuerySchema = strictObject({
  scope: optional(briefScopeSchema),
  workspaceId: optional(idSchema),
}).check(refine((v) => v.scope !== "workspace" || !!v.workspaceId));
export const briefProjectSchema = object({
  stage: nullable(projectStageSchema),
  leadId: nullable(idSchema),
  workspaceId: idSchema,
  projectId: idSchema,
  name: string(),
  /** Finance inside is null unless the reader may read it (finance:read, ADR 0021). */
  risk: projectRiskSchema,
});
export const briefActionSchema = union([
  /** Open the existing review workspace; never a one-tap approve. */
  object({
    kind: literal("review"),
    workspaceId: idSchema,
    taskId: idSchema,
    runId: idSchema,
    agentId: idSchema,
  }),
  /** Decide through the existing grant-decision endpoint. */
  object({
    kind: literal("grant"),
    workspaceId: idSchema,
    grantId: idSchema,
    agentId: idSchema,
    taskId: nullable(idSchema),
    capability: string(),
  }),
  /** A person or agent proposal a person applies or dismisses. */
  object({
    kind: literal("suggestion"),
    workspaceId: idSchema,
    suggestionId: idSchema,
    suggestionKind: suggestionKindSchema,
    taskId: nullable(idSchema),
    proposerId: optional(idSchema),
    /** Legacy servers identify agent proposals with this field. */
    agentId: optional(idSchema),
  }),
]);
export const briefCountsSchema = object({
  projects: nonnegativeInteger,
  onTrack: nonnegativeInteger,
  atRisk: nonnegativeInteger,
  reviewsWaiting: nonnegativeInteger,
  pendingGrants: nonnegativeInteger,
  pendingSuggestions: nonnegativeInteger,
  blockedAgents: nonnegativeInteger,
  dueToday: nonnegativeInteger,
  agentsWorking: nonnegativeInteger,
});
/**
 * Display labels for the ids a brief or answer mentions (the web only):
 * names and titles the reader can already read in those workspaces. Never
 * sent to a model and not part of the MCP `brief.get` result.
 */
export const briefLabelsSchema = object({
  workspaces: array(object({ id: idSchema, name: string(), key: string() })),
  projects: array(
    object({ id: idSchema, workspaceId: idSchema, name: string() }),
  ),
  tasks: array(
    object({
      id: idSchema,
      workspaceId: idSchema,
      number: nonnegativeInteger,
      title: string(),
      projectId: nullable(idSchema),
    }),
  ),
  milestones: array(
    object({ id: idSchema, projectId: idSchema, name: string() }),
  ),
  members: optional(
    array(object({ id: idSchema, workspaceId: idSchema, name: string() })),
  ),
  agents: array(
    object({ id: idSchema, workspaceId: idSchema, name: string() }),
  ),
});
export const briefSchema = object({
  today: civilDateSchema,
  timeZone: string(),
  scope: briefScopeSchema,
  workspaceIds: array(idSchema),
  projects: array(briefProjectSchema),
  counts: briefCountsSchema,
  actions: array(briefActionSchema),
  labels: optional(briefLabelsSchema),
});
export const mcpBriefGetArgs = extend(strictObject({}), {
  workspaceId: optional(idSchema),
});

// Ask taff ------------------------------------------------------------------

export const askIntentSchema = zodEnum([
  "at_risk",
  "blocked",
  "needs_me",
  "due_this_week",
  "agent_status",
  "unknown",
]);
export const askInputSchema = strictObject({
  question: boundedText(500),
  /** Ask about one workspace; absent for every membership. */
  workspaceId: optional(idSchema),
});
export const askItemSchema = object({
  kind: zodEnum(["project", "task", "review", "grant", "suggestion", "agent"]),
  workspaceId: idSchema,
  id: idSchema,
  projectId: optional(nullable(idSchema)),
  taskId: optional(nullable(idSchema)),
  runId: optional(idSchema),
  agentId: optional(idSchema),
  proposerId: optional(idSchema),
  level: optional(riskLevelSchema),
  reasons: optional(array(riskReasonSchema)),
  slipDays: optional(nonnegativeInteger),
  forecastEnd: optional(nullable(civilDateSchema)),
  dueDate: optional(civilDateSchema),
  status: optional(union([taskStatusSchema, runStatusSchema])),
});
export const askAnswerSchema = object({
  intent: askIntentSchema,
  items: array(askItemSchema),
  /** Model prose, only when the model path is configured and opted in. */
  text: nullable(string()),
  source: zodEnum(["rules", "model"]),
  labels: optional(briefLabelsSchema),
});

// Model path settings (D6, ADR 0016) ----------------------------------------

export const aiSettingsSchema = object({
  /** The workspace opted in (admins only). */
  enabled: boolean(),
  /** The server has a model configured (AI_BASE_URL, AI_API_KEY, AI_MODEL). */
  available: boolean(),
});
export const aiSettingsInputSchema = strictObject({ enabled: boolean() });

export type SuggestionKind = Infer<typeof suggestionKindSchema>;
export type SuggestionStatus = Infer<typeof suggestionStatusSchema>;
export type SuggestionInput = Infer<typeof suggestionInputSchema>;
export type SplitPayload = Infer<typeof splitPayloadSchema>;
export type ReschedulePayload = Infer<typeof reschedulePayloadSchema>;
export type Suggestion = Infer<typeof suggestionSchema>;
export type SuggestionFilter = Infer<typeof suggestionFilterSchema>;
export type SuggestionDecision = Infer<typeof suggestionDecisionSchema>;
export type SuggestionApplyResult = Infer<typeof suggestionApplyResultSchema>;
export type BriefScope = Infer<typeof briefScopeSchema>;
export type BriefQuery = Infer<typeof briefQuerySchema>;
export type BriefProject = Infer<typeof briefProjectSchema>;
export type BriefAction = Infer<typeof briefActionSchema>;
export type BriefCounts = Infer<typeof briefCountsSchema>;
export type Brief = Infer<typeof briefSchema>;
export type BriefLabels = Infer<typeof briefLabelsSchema>;
export type AskIntent = Infer<typeof askIntentSchema>;
export type AskInput = Infer<typeof askInputSchema>;
export type AskItem = Infer<typeof askItemSchema>;
export type AskAnswer = Infer<typeof askAnswerSchema>;
export type AiSettings = Infer<typeof aiSettingsSchema>;
export type RunStatus = Infer<typeof runStatusSchema>;
