// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.
import {
  _default,
  array,
  boolean,
  email,
  extend,
  type infer as Infer,
  iso,
  maxLength,
  minLength,
  nullable,
  number,
  object,
  optional,
  record,
  refine,
  regex,
  strictObject,
  string,
  trim,
  unknown,
  uuid,
  enum as zodEnum,
} from "zod/mini";
import { $ZodError } from "zod/v4/core";

const timeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

export const localeSchema = zodEnum(["en", "zh-CN", "zh-HK"]);
export const taskStatusSchema = zodEnum([
  "todo",
  "in_progress",
  "needs_review",
  "done",
]);
export const idSchema = uuid();
export const workspaceQuerySchema = strictObject({ workspaceId: idSchema });
export const createTaskSchema = strictObject({
  workspaceId: idSchema,
  title: string().check(trim(), minLength(1), maxLength(200)),
  ownerId: idSchema,
  workerId: _default(nullable(idSchema), null),
  dueAt: _default(nullable(iso.datetime({ offset: true })), null),
});
export const assignTaskSchema = strictObject({ workerId: nullable(idSchema) });
export const signInSchema = strictObject({
  email: email(),
  password: string().check(minLength(8), maxLength(128)),
});
export const signUpSchema = extend(signInSchema, {
  name: string().check(trim(), minLength(1), maxLength(100)),
});
export const signOutSchema = strictObject({});
export const profileSchema = strictObject({
  locale: localeSchema,
  tz: string().check(
    minLength(1),
    maxLength(100),
    refine(timeZone, "Invalid time zone"),
  ),
});
export const memberSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  userId: nullable(string()),
  name: string(),
  kind: zodEnum(["person", "agent"]),
  role: zodEnum(["admin", "member"]),
});
export const memberListSchema = array(memberSchema);
export const taskSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  title: string(),
  ownerId: idSchema,
  workerId: nullable(idSchema),
  status: taskStatusSchema,
  dueAt: nullable(iso.datetime()),
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const taskListSchema = array(taskSchema);
export const meSchema = object({
  user: object({
    id: string(),
    name: string(),
    email: email(),
    locale: localeSchema,
    tz: string(),
  }),
  workspaces: array(
    object({ id: idSchema, name: string(), memberId: idSchema }),
  ),
});
export const errorSchema = object({
  error: zodEnum([
    "unauthorized",
    "forbidden",
    "not_found",
    "invalid_input",
    "conflict",
    "internal_error",
  ]),
});
export const updateTaskStatusSchema = strictObject({
  status: taskStatusSchema,
});
export const scheduleTaskSchema = strictObject({
  dueAt: nullable(iso.datetime({ offset: true })),
});
/** MCP token scopes, as shown on the MCP page. */
export const scopeSchema = zodEnum([
  "tasks:read",
  "tasks:write",
  "calendar:write",
  "inbox:review",
  "files:write",
]);
export const createAgentTokenSchema = strictObject({
  workspaceId: idSchema,
  memberId: idSchema,
  name: string().check(trim(), minLength(1), maxLength(100)),
  scopes: array(scopeSchema).check(minLength(1)),
});
export const agentTokenSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  memberId: idSchema,
  createdBy: idSchema,
  name: string(),
  prefix: string(),
  scopes: array(scopeSchema),
  createdAt: iso.datetime(),
  revokedAt: nullable(iso.datetime()),
  lastUsedAt: nullable(iso.datetime()),
});
export const agentTokenListSchema = array(agentTokenSchema);
/** Returned once, right after creation. */
export const issuedAgentTokenSchema = extend(agentTokenSchema, {
  token: string(),
});
export const mcpCallSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  tokenId: idSchema,
  method: string(),
  tool: nullable(string()),
  status: zodEnum(["ok", "error", "denied", "rate_limited"]),
  durationMs: number(),
  createdAt: iso.datetime(),
});
export const mcpCallListSchema = array(mcpCallSchema);
/* MCP tool arguments. The token fixes the workspace, so no tool takes one. */
export const mcpTasksListArgs = strictObject({
  status: optional(taskStatusSchema),
});
export const mcpTasksCreateArgs = strictObject({
  title: string().check(trim(), minLength(1), maxLength(200)),
  ownerId: idSchema,
  dueAt: optional(nullable(iso.datetime({ offset: true }))),
});
export const mcpTasksUpdateArgs = strictObject({
  taskId: idSchema,
  status: optional(zodEnum(["in_progress", "needs_review"])),
  workerId: optional(nullable(idSchema)),
});
export const mcpCalendarScheduleArgs = strictObject({
  taskId: idSchema,
  dueAt: nullable(iso.datetime({ offset: true })),
});
export const mcpInboxRequestReviewArgs = strictObject({
  taskId: idSchema,
  note: optional(string().check(maxLength(2000))),
});
/** Thrown by every schema above on invalid input. */
export const SchemaError = $ZodError;
export type CreateTask = Infer<typeof createTaskSchema>;
export type AssignTask = Infer<typeof assignTaskSchema>;
export type Profile = Infer<typeof profileSchema>;
export type Member = Infer<typeof memberSchema>;
export type Task = Infer<typeof taskSchema>;
export type Me = Infer<typeof meSchema>;
export type Locale = Infer<typeof localeSchema>;
export type Scope = Infer<typeof scopeSchema>;
export type TaskStatus = Infer<typeof taskStatusSchema>;
export type CreateAgentToken = Infer<typeof createAgentTokenSchema>;
export type AgentToken = Infer<typeof agentTokenSchema>;
export type IssuedAgentToken = Infer<typeof issuedAgentTokenSchema>;
export type McpCall = Infer<typeof mcpCallSchema>;

// M3: shared run, review, permissions and Inbox boundaries.
export const capabilitySchema = zodEnum([
  "tasks.read",
  "tasks.write",
  "calendar.schedule",
  "files.attach",
  "web.search",
  "repo.read",
  "repo.pr",
  "repo.merge",
  "deploy.prod",
  "staging.read",
  "staging.write",
  "alerts",
]);
export const permissionDecisionSchema = zodEnum(["allow", "ask", "deny"]);
export const reviewPolicySchema = zodEnum(["always_review", "ask_only"]);
export const runStatusSchema = zodEnum([
  "running",
  "paused",
  "needs_review",
  "changes_requested",
  "completed",
  "canceled",
  "failed",
]);
const nonnegativeInteger = number().check(
  refine((value) => Number.isSafeInteger(value) && value >= 0),
);
const positiveInteger = number().check(
  refine((value) => Number.isSafeInteger(value) && value > 0),
);
const versionSchema = positiveInteger;
const boundedText = (max: number) =>
  string().check(trim(), minLength(1), maxLength(max));
const httpUrlSchema = string().check(
  maxLength(2000),
  refine((value) => {
    try {
      return ["https:", "http:"].includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }),
);
export const startRunSchema = strictObject({});
export const controlRunSchema = strictObject({
  version: versionSchema,
  action: zodEnum(["pause", "resume", "cancel"]),
});
export const appendRunEventSchema = strictObject({
  version: versionSchema,
  kind: zodEnum(["step", "tool_call", "message", "source", "test"]),
  title: boundedText(200),
  text: _default(string().check(maxLength(20000)), ""),
  sourceUrl: _default(nullable(httpUrlSchema), null),
  testStatus: _default(
    nullable(zodEnum(["passed", "failed", "skipped"])),
    null,
  ),
  durationMs: _default(nonnegativeInteger, 0),
  costMicros: _default(nonnegativeInteger, 0),
  capability: optional(capabilitySchema),
});
export const attachRunArtifactSchema = strictObject({
  version: versionSchema,
  name: boundedText(200),
  mimeType: boundedText(100),
  content: string().check(minLength(1), maxLength(200000)),
  diff: _default(nullable(string().check(maxLength(200000))), null),
  sourceUrl: _default(nullable(httpUrlSchema), null),
});
export const submitRunSchema = strictObject({
  version: versionSchema,
  summary: boundedText(5000),
  requestReview: _default(boolean(), true),
});
export const reviewChecksSchema = strictObject({
  matchesDescription: boolean(),
  verifiable: boolean(),
  withinPermissions: boolean(),
});
export const reviewRunSchema = strictObject({
  version: versionSchema,
  decision: zodEnum(["approve", "request_changes"]),
  checks: reviewChecksSchema,
  comment: _default(string().check(trim(), maxLength(5000)), ""),
  items: _default(
    array(
      strictObject({
        artifactId: idSchema,
        decision: zodEnum(["approve", "request_changes"]),
        comment: _default(string().check(trim(), maxLength(5000)), ""),
      }),
    ).check(maxLength(100)),
    [],
  ),
});
export const reviewCommentSchema = strictObject({
  version: versionSchema,
  body: boundedText(5000),
  artifactId: optional(idSchema),
  eventId: optional(idSchema),
  line: optional(positiveInteger),
});
export const agentProfileInputSchema = strictObject({
  supervisorId: nullable(idSchema),
  reviewPolicy: reviewPolicySchema,
  maxDurationMs: _default(nullable(positiveInteger), null),
  maxCostMicros: _default(nullable(positiveInteger), null),
});
export const agentPermissionInputSchema = strictObject({
  capability: capabilitySchema,
  decision: permissionDecisionSchema,
});
export const requestGrantSchema = strictObject({
  capability: capabilitySchema,
  taskId: optional(idSchema),
  runId: optional(idSchema),
  reason: boundedText(2000),
});
export const decideGrantSchema = strictObject({
  decision: zodEnum(["allow", "deny", "revoke"]),
  expiresAt: optional(iso.datetime({ offset: true })),
});
export const inboxFilterSchema = strictObject({
  tab: _default(zodEnum(["all", "reviews", "blockers"]), "all"),
});
export const inboxItemInputSchema = strictObject({
  read: optional(boolean()),
  snoozedUntil: optional(nullable(iso.datetime({ offset: true }))),
}).check(
  refine(
    (value) => value.read !== undefined || value.snoozedUntil !== undefined,
  ),
);
export const runSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  taskId: idSchema,
  agentId: idSchema,
  status: runStatusSchema,
  version: versionSchema,
  summary: string(),
  startedAt: iso.datetime(),
  finishedAt: nullable(iso.datetime()),
  updatedAt: iso.datetime(),
  durationMs: nonnegativeInteger,
  costMicros: nonnegativeInteger,
});
export const runListSchema = array(runSchema);
export const runEventSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  runId: idSchema,
  kind: appendRunEventSchema.shape.kind,
  title: string(),
  text: string(),
  capability: nullable(capabilitySchema),
  sourceUrl: nullable(httpUrlSchema),
  testStatus: appendRunEventSchema.shape.testStatus,
  durationMs: nonnegativeInteger,
  costMicros: nonnegativeInteger,
  createdAt: iso.datetime(),
});
export const runArtifactSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  runId: idSchema,
  name: string(),
  mimeType: string(),
  content: string(),
  diff: nullable(string()),
  sourceUrl: nullable(httpUrlSchema),
  createdAt: iso.datetime(),
});
export const reviewCommentDtoSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  runId: idSchema,
  authorId: idSchema,
  body: string(),
  artifactId: nullable(idSchema),
  eventId: nullable(idSchema),
  line: nullable(positiveInteger),
  createdAt: iso.datetime(),
});
export const runDetailSchema = object({
  run: runSchema,
  events: array(runEventSchema),
  artifacts: array(runArtifactSchema),
  canControl: boolean(),
  canSubmit: boolean(),
});
export const reviewWorkspaceSchema = extend(runDetailSchema, {
  task: taskSchema,
  checks: reviewChecksSchema,
  comments: array(reviewCommentDtoSchema),
  canReview: boolean(),
});
export const grantSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  agentId: idSchema,
  capability: capabilitySchema,
  taskId: nullable(idSchema),
  runId: nullable(idSchema),
  status: zodEnum(["pending", "allowed", "denied", "revoked"]),
  reason: string(),
  expiresAt: nullable(iso.datetime()),
  decidedBy: nullable(idSchema),
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const agentHistorySchema = object({
  id: idSchema,
  actorId: string(),
  action: string(),
  resourceId: string(),
  details: record(string(), unknown()),
  createdAt: iso.datetime(),
});
export const agentProfileSchema = object({
  member: memberSchema,
  supervisorId: nullable(idSchema),
  reviewPolicy: reviewPolicySchema,
  maxDurationMs: nullable(positiveInteger),
  maxCostMicros: nullable(positiveInteger),
  permissions: array(agentPermissionInputSchema),
  grants: array(grantSchema),
  history: array(agentHistorySchema),
  runs: array(runSchema),
  canManage: boolean(),
  canDecideGrants: boolean(),
});
export const inboxItemSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  memberId: idSchema,
  agentId: nullable(idSchema),
  taskId: nullable(idSchema),
  runId: nullable(idSchema),
  grantId: nullable(idSchema),
  kind: zodEnum(["review", "blocker", "mention"]),
  title: string(),
  readAt: nullable(iso.datetime()),
  snoozedUntil: nullable(iso.datetime()),
  resolvedAt: nullable(iso.datetime()),
  createdAt: iso.datetime(),
});
export const inboxSchema = object({
  items: array(inboxItemSchema),
  groups: array(
    object({ taskId: nullable(idSchema), items: array(inboxItemSchema) }),
  ),
  unreadCount: nonnegativeInteger,
  reviewCount: nonnegativeInteger,
  blockerCount: nonnegativeInteger,
});
export const mcpFilesAttachArgs = extend(attachRunArtifactSchema, {
  runId: idSchema,
});
export const mcpRunsGetArgs = strictObject({ runId: idSchema });
export const mcpRunsStartArgs = strictObject({ taskId: idSchema });
export const mcpRunsControlArgs = extend(controlRunSchema, { runId: idSchema });
export const mcpRunsEventArgs = extend(appendRunEventSchema, {
  runId: idSchema,
});
export const mcpRunsSubmitArgs = extend(submitRunSchema, { runId: idSchema });
export const mcpGrantsRequestArgs = extend(requestGrantSchema, {
  agentId: idSchema,
});
export type Capability = Infer<typeof capabilitySchema>;
export type PermissionDecision = Infer<typeof permissionDecisionSchema>;
export type ReviewPolicy = Infer<typeof reviewPolicySchema>;
export type Run = Infer<typeof runSchema>;
export type RunDetail = Infer<typeof runDetailSchema>;
export type RunEvent = Infer<typeof runEventSchema>;
export type RunArtifact = Infer<typeof runArtifactSchema>;
export type ReviewChecks = Infer<typeof reviewChecksSchema>;
export type ReviewWorkspace = Infer<typeof reviewWorkspaceSchema>;
export type ReviewComment = Infer<typeof reviewCommentDtoSchema>;
export type Grant = Infer<typeof grantSchema>;
export type AgentProfile = Infer<typeof agentProfileSchema>;
export type InboxItem = Infer<typeof inboxItemSchema>;
export type Inbox = Infer<typeof inboxSchema>;
export type StartRun = Infer<typeof startRunSchema>;
export type ControlRun = Infer<typeof controlRunSchema>;
export type AppendRunEvent = Infer<typeof appendRunEventSchema>;
export type AttachRunArtifact = Infer<typeof attachRunArtifactSchema>;
export type SubmitRun = Infer<typeof submitRunSchema>;
export type ReviewRun = Infer<typeof reviewRunSchema>;
export type ReviewCommentInput = Infer<typeof reviewCommentSchema>;
export type AgentProfileInput = Infer<typeof agentProfileInputSchema>;
export type AgentPermissionInput = Infer<typeof agentPermissionInputSchema>;
export type RequestGrant = Infer<typeof requestGrantSchema>;
export type DecideGrant = Infer<typeof decideGrantSchema>;
export type InboxItemInput = Infer<typeof inboxItemInputSchema>;

/** Safe routing metadata emitted transactionally by PostgreSQL taff_changes. */
export const changeEventSchema = strictObject({
  activityId: idSchema,
  workspaceId: nullable(idSchema),
  resourceId: string().check(minLength(1), maxLength(200)),
  action: string().check(
    regex(
      /^(users|sessions|accounts|verifications|workspaces|members|tasks|agent_tokens|mcp_calls|agent_profiles|agent_permissions|grants|runs|run_events|run_artifacts|review_checks|review_comments|review_items|inbox_items)\.(insert|update|delete)$/,
    ),
  ),
  actorId: string().check(minLength(1), maxLength(200)),
  userId: nullable(string().check(minLength(1), maxLength(200))),
});
export type ChangeEvent = Infer<typeof changeEventSchema>;
