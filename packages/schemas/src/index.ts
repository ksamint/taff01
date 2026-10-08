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
  omit,
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
export const prioritySchema = number().check(
  refine((v) => Number.isInteger(v) && v >= 1 && v <= 4),
);
export const labelsSchema = array(
  string().check(trim(), minLength(1), maxLength(40)),
).check(
  maxLength(20),
  refine((v) => new Set(v).size === v.length),
);
export const memberRoleSchema = zodEnum(["admin", "member", "guest"]);
const taskFields = {
  description: optional(string().check(maxLength(20000))),
  priority: optional(prioritySchema),
  projectId: optional(nullable(idSchema)),
  labels: optional(labelsSchema),
};
const calendarInstantSchema = iso.datetime({ offset: true }).check(
  refine((value) => {
    const ms = Date.parse(value);
    return ms >= Date.UTC(1970, 0, 1) && ms < Date.UTC(2201, 0, 1);
  }),
);
export const calendarScheduleInputSchema = strictObject({
  startAt: calendarInstantSchema,
  endAt: calendarInstantSchema,
  timeZone: string().check(
    minLength(1),
    maxLength(100),
    refine(timeZone, "Invalid time zone"),
  ),
  rrule: _default(
    nullable(string().check(trim(), minLength(1), maxLength(500))),
    null,
  ),
}).check(
  refine((value) => {
    const duration = Date.parse(value.endAt) - Date.parse(value.startAt);
    return duration > 0 && duration <= 7 * 86400000;
  }),
);
export type CalendarScheduleInput = Infer<typeof calendarScheduleInputSchema>;
export const createTaskSchema = strictObject({
  calendar: optional(calendarScheduleInputSchema),
  ...taskFields,
  parentId: optional(nullable(idSchema)),
  workspaceId: idSchema,
  title: string().check(trim(), minLength(1), maxLength(200)),
  ownerId: idSchema,
  workerId: _default(nullable(idSchema), null),
  dueAt: optional(nullable(iso.datetime({ offset: true }))),
});
export const assignTaskSchema = strictObject({
  workerId: nullable(idSchema),
  version: optional(
    number().check(refine((v) => Number.isSafeInteger(v) && v > 0)),
  ),
});
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
  role: memberRoleSchema,
});
export const memberListSchema = array(memberSchema);
export const taskSchema = object({
  description: string(),
  priority: prioritySchema,
  projectId: nullable(idSchema),
  labels: labelsSchema,
  parentId: nullable(idSchema),
  version: number().check(refine((v) => Number.isSafeInteger(v) && v > 0)),
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
  version: optional(
    number().check(refine((v) => Number.isSafeInteger(v) && v > 0)),
  ),
  status: taskStatusSchema,
});
export const scheduleTaskSchema = strictObject({
  version: optional(
    number().check(refine((v) => Number.isSafeInteger(v) && v > 0)),
  ),
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

export const mcpTasksCreateArgs = omit(createTaskSchema, {
  workspaceId: true,
  workerId: true,
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
      /^(users|sessions|accounts|verifications|workspaces|members|tasks|agent_tokens|mcp_calls|agent_profiles|agent_permissions|grants|runs|run_events|run_artifacts|review_checks|review_comments|review_items|inbox_items|projects|task_comments|workspace_invites|task_calendar)\.(insert|update|delete)$/,
    ),
  ),
  actorId: string().check(minLength(1), maxLength(200)),
  userId: nullable(string().check(minLength(1), maxLength(200))),
});
export type ChangeEvent = Infer<typeof changeEventSchema>;

// M5 planning, collaboration and organizations.
export const updateTaskSchema = strictObject({
  ...taskFields,
  version: versionSchema,
  title: optional(boundedText(200)),
  ownerId: optional(idSchema),
  dueAt: optional(nullable(iso.datetime({ offset: true }))),
  status: optional(taskStatusSchema),
}).check(
  refine((v) =>
    [
      v.title,
      v.description,
      v.ownerId,
      v.dueAt,
      v.priority,
      v.projectId,
      v.labels,
      v.status,
    ].some((field) => field !== undefined),
  ),
);
export const taskFilterSchema = strictObject({
  status: optional(taskStatusSchema),
  projectId: optional(nullable(idSchema)),
  parentId: optional(nullable(idSchema)),
  ownerId: optional(idSchema),
  workerId: optional(nullable(idSchema)),
  priority: optional(prioritySchema),
  label: optional(boundedText(40)),
  sort: optional(zodEnum(["created", "updated", "due", "priority", "title"])),
});
export const taskCommentInputSchema = strictObject({ body: boundedText(5000) });
export const taskCommentSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  taskId: idSchema,
  authorId: idSchema,
  body: string(),
  createdAt: iso.datetime(),
});
export const projectInputSchema = strictObject({ name: boundedText(100) });
export const projectUpdateSchema = strictObject({
  version: versionSchema,
  name: optional(boundedText(100)),
  archived: optional(boolean()),
}).check(refine((v) => v.name !== undefined || v.archived !== undefined));
export const projectSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  name: string(),
  archived: boolean(),
  version: versionSchema,
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const workspaceCreateSchema = strictObject({
  name: boundedText(100),
  agentIds: optional(
    array(idSchema).check(
      maxLength(20),
      refine((v) => new Set(v).size === v.length),
    ),
  ),
});
export const workspaceSchema = object({
  id: idSchema,
  name: string(),
  memberId: idSchema,
});
export const workspaceInviteInputSchema = strictObject({
  email: email(),
  role: _default(memberRoleSchema, "member"),
});
export const workspaceInviteAcceptSchema = strictObject({
  token: string().check(minLength(32), maxLength(200)),
});
export const workspaceInviteSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  email: email(),
  role: memberRoleSchema,
  status: zodEnum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: iso.datetime(),
  createdAt: iso.datetime(),
});
export const issuedWorkspaceInviteSchema = extend(workspaceInviteSchema, {
  token: string(),
});
export const memberRoleInputSchema = strictObject({ role: memberRoleSchema });
export const searchInputSchema = strictObject({
  query: boundedText(200),
  scope: _default(zodEnum(["workspace", "all"]), "workspace"),
  types: optional(
    array(zodEnum(["task", "comment"])).check(minLength(1), maxLength(2)),
  ),
  filters: optional(taskFilterSchema),
  limit: _default(
    number().check(refine((v) => Number.isInteger(v) && v >= 1 && v <= 100)),
    50,
  ),
});
export const searchResultSchema = object({
  id: idSchema,
  type: zodEnum(["task", "comment"]),
  workspaceId: idSchema,
  workspaceName: string(),
  taskId: idSchema,
  title: string(),
  snippet: string(),
  match: zodEnum(["title", "description", "comment"]),
  task: taskSchema,
});
export const quickAddInputSchema = strictObject({ text: boundedText(1000) });
export const quickAddResultSchema = object({
  title: string(),
  ownerId: nullable(idSchema),
  workerId: nullable(idSchema),
  priority: prioritySchema,
  projectId: nullable(idSchema),
  labels: labelsSchema,
  dueDate: nullable(iso.date()),
  dueTime: nullable(string().check(regex(/^\d{2}:\d{2}$/))),
  dueAt: nullable(iso.datetime()),
  warnings: array(
    zodEnum([
      "unknown_member",
      "ambiguous_member",
      "unknown_project",
      "ambiguous_project",
      "invalid_time",
      "invalid_date",
      "empty_title",
    ]),
  ),
  unresolved: array(string()),
});
export const mcpTasksEditArgs = extend(updateTaskSchema, { taskId: idSchema });
export const mcpTaskCommentsListArgs = strictObject({ taskId: idSchema });
export const mcpTaskCommentsAddArgs = extend(taskCommentInputSchema, {
  taskId: idSchema,
});
export const mcpProjectsListArgs = strictObject({});
export const mcpSearchArgs = searchInputSchema;
export const mcpQuickAddArgs = quickAddInputSchema;
export type UpdateTask = Infer<typeof updateTaskSchema>;
export type TaskFilter = Infer<typeof taskFilterSchema>;
export type TaskCommentInput = Infer<typeof taskCommentInputSchema>;
export type TaskComment = Infer<typeof taskCommentSchema>;
export type ProjectInput = Infer<typeof projectInputSchema>;
export type ProjectUpdate = Infer<typeof projectUpdateSchema>;
export type Project = Infer<typeof projectSchema>;
export type WorkspaceCreate = Infer<typeof workspaceCreateSchema>;
export type Workspace = Infer<typeof workspaceSchema>;
export type WorkspaceInviteInput = Infer<typeof workspaceInviteInputSchema>;
export type WorkspaceInvite = Infer<typeof workspaceInviteSchema>;
export type IssuedWorkspaceInvite = Infer<typeof issuedWorkspaceInviteSchema>;
export type WorkspaceInviteAccept = Infer<typeof workspaceInviteAcceptSchema>;
export type MemberRoleInput = Infer<typeof memberRoleInputSchema>;
export type SearchInput = Infer<typeof searchInputSchema>;
export type SearchResult = Infer<typeof searchResultSchema>;
export type QuickAddInput = Infer<typeof quickAddInputSchema>;
export type QuickAddResult = Infer<typeof quickAddResultSchema>;

export const mcpTasksListArgs = taskFilterSchema;

export const taskAccessSchema = object({
  canEditMetadata: boolean(),
  canEdit: boolean(),
  canComment: boolean(),
  canAssign: boolean(),
  allowedStatuses: array(taskStatusSchema),
});
export type TaskAccess = Infer<typeof taskAccessSchema>;

export const workspaceAccessSchema = object({
  canCreateTasks: boolean(),
  canManageProjects: boolean(),
  canInvite: boolean(),
  canManageRoles: boolean(),
});
export type WorkspaceAccess = Infer<typeof workspaceAccessSchema>;

export const calendarRangeSchema = strictObject({
  from: calendarInstantSchema,
  to: calendarInstantSchema,
}).check(
  refine(
    (v) =>
      Date.parse(v.to) > Date.parse(v.from) &&
      Date.parse(v.to) - Date.parse(v.from) <= 62 * 86400000,
  ),
);
export const setTaskCalendarSchema = strictObject({
  version: versionSchema,
  schedule: nullable(calendarScheduleInputSchema),
});
export const calendarScheduleSchema = object({
  taskId: idSchema,
  workspaceId: idSchema,
  startAt: iso.datetime(),
  endAt: iso.datetime(),
  timeZone: string(),
  rrule: nullable(string()),
});
export const taskCalendarSchema = object({
  task: taskSchema,
  schedule: nullable(calendarScheduleSchema),
  canSchedule: boolean(),
});
export const calendarOccurrenceSchema = object({
  id: string().check(minLength(1), maxLength(100)),
  task: taskSchema,
  schedule: calendarScheduleSchema,
  startAt: iso.datetime(),
  endAt: iso.datetime(),
  canSchedule: boolean(),
  isAgent: boolean(),
});
export const calendarViewDataSchema = object({
  occurrences: array(calendarOccurrenceSchema),
  unscheduled: array(taskCalendarSchema),
  truncated: boolean(),
});
export const mcpCalendarListArgs = calendarRangeSchema;
export const mcpCalendarSetArgs = extend(setTaskCalendarSchema, {
  taskId: idSchema,
});
export type CalendarRange = Infer<typeof calendarRangeSchema>;
export type SetTaskCalendar = Infer<typeof setTaskCalendarSchema>;
export type CalendarSchedule = Infer<typeof calendarScheduleSchema>;
export type TaskCalendar = Infer<typeof taskCalendarSchema>;
export type CalendarOccurrence = Infer<typeof calendarOccurrenceSchema>;
export type CalendarViewData = Infer<typeof calendarViewDataSchema>;
export {
  calendarCivilTime,
  calendarWallToInstant,
  canonicalCalendarTimeZone,
  shiftCalendarSeries,
} from "./calendar";
