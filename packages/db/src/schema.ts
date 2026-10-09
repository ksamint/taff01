import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const dates = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};
export const user = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    locale: text("locale").default("en").notNull(),
    tz: text("tz").default("UTC").notNull(),
    ...dates,
  },
  (t) => [check("users_locale", sql`${t.locale} in ('en', 'zh-CN', 'zh-HK')`)],
);
export const session = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...dates,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
export const account = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    password: text("password"),
    scope: text("scope"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    ...dates,
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
    uniqueIndex("accounts_provider_idx").on(t.providerId, t.accountId),
  ],
);
export const verification = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...dates,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);
export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  seedKey: text("seed_key").unique(),
  ...dates,
});
export const memberKind = pgEnum("member_kind", ["person", "agent"]);
export const memberRole = pgEnum("member_role", ["admin", "member", "guest"]);
export const members = pgTable(
  "members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: memberKind("kind").notNull(),
    role: memberRole("role").default("member").notNull(),
    ...dates,
  },
  (t) => [
    uniqueIndex("members_workspace_user_idx").on(t.workspaceId, t.userId),
    unique("members_workspace_id_unique").on(t.workspaceId, t.id),
    uniqueIndex("members_workspace_agent_name_idx")
      .on(t.workspaceId, t.name)
      .where(sql`${t.kind} = 'agent'`),
    check(
      "members_identity",
      sql`(${t.kind} = 'person' AND ${t.userId} IS NOT NULL) OR (${t.kind} = 'agent' AND ${t.userId} IS NULL)`,
    ),
  ],
);
export const taskStatus = pgEnum("task_status", [
  "todo",
  "in_progress",
  "needs_review",
  "done",
]);
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    name: text("name").notNull(),
    archived: boolean("archived").default(false).notNull(),
    version: integer("version").default(1).notNull(),
    ...dates,
  },
  (t) => [
    unique("projects_workspace_id_unique").on(t.workspaceId, t.id),
    check("projects_name", sql`length(btrim(${t.name})) BETWEEN 1 AND 100`),
    check("projects_version", sql`${t.version}>0`),
  ],
);
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").default("").notNull(),
    priority: integer("priority").default(3).notNull(),
    labels: text("labels").array().default(sql`ARRAY[]::text[]`).notNull(),
    projectId: uuid("project_id"),
    parentId: uuid("parent_id"),
    version: integer("version").default(1).notNull(),
    ownerId: uuid("owner_id").notNull(),
    workerId: uuid("worker_id"),
    status: taskStatus("status").default("todo").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    ...dates,
  },
  (t) => [
    unique("tasks_workspace_id_unique").on(t.workspaceId, t.id),
    index("tasks_workspace_created_idx").on(t.workspaceId, t.createdAt),
    foreignKey({
      columns: [t.workspaceId, t.ownerId],
      foreignColumns: [members.workspaceId, members.id],
      name: "tasks_owner_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.workerId],
      foreignColumns: [members.workspaceId, members.id],
      name: "tasks_worker_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
      name: "tasks_project_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.parentId],
      foreignColumns: [t.workspaceId, t.id],
      name: "tasks_parent_fk",
    }),
    check("tasks_priority", sql`${t.priority} BETWEEN 1 AND 4`),
    check("tasks_version", sql`${t.version} > 0`),
    check(
      "tasks_parent_self",
      sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`,
    ),
    index("tasks_workspace_project_idx").on(t.workspaceId, t.projectId),
    index("tasks_parent_idx").on(t.parentId),
    check("tasks_title", sql`length(btrim(${t.title})) BETWEEN 1 AND 200`),
  ],
);
export const activity = pgTable(
  "activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: text("actor_id").notNull(),
    workspaceId: uuid("workspace_id"),
    action: text("action").notNull(),
    resourceId: text("resource_id").notNull(),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("activity_workspace_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const agentTokens = pgTable(
  "agent_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull(),
    createdBy: uuid("created_by").notNull(),
    name: text("name").notNull(),
    // sha256(token + TOKEN_PEPPER); the raw token is shown once and never stored.
    hash: text("hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    scopes: text("scopes").array().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...dates,
  },
  (t) => [
    index("agent_tokens_workspace_idx").on(t.workspaceId, t.createdAt),
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [members.workspaceId, members.id],
      name: "agent_tokens_member_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.createdBy],
      foreignColumns: [members.workspaceId, members.id],
      name: "agent_tokens_creator_fk",
    }),
    check("agent_tokens_name", sql`length(btrim(${t.name})) BETWEEN 1 AND 100`),
  ],
);
export const mcpCallStatus = pgEnum("mcp_call_status", [
  "ok",
  "error",
  "denied",
  "rate_limited",
]);
// Append-only call log for the MCP page; the tool's own mutation is audited.
export const mcpCalls = pgTable(
  "mcp_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => agentTokens.id, { onDelete: "cascade" }),
    method: text("method").notNull(),
    tool: text("tool"),
    status: mcpCallStatus("status").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("mcp_calls_workspace_created_idx").on(t.workspaceId, t.createdAt),
  ],
);

export const reviewPolicy = pgEnum("review_policy", [
  "always_review",
  "ask_only",
]);
export const permissionDecision = pgEnum("permission_decision", [
  "allow",
  "ask",
  "deny",
]);
export const grantStatus = pgEnum("grant_status", [
  "pending",
  "allowed",
  "denied",
  "revoked",
]);
export const runStatus = pgEnum("run_status", [
  "running",
  "paused",
  "needs_review",
  "changes_requested",
  "completed",
  "canceled",
  "failed",
]);
export const agentProfiles = pgTable(
  "agent_profiles",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    supervisorId: uuid("supervisor_id"),
    reviewPolicy: reviewPolicy("review_policy")
      .default("always_review")
      .notNull(),
    maxDurationMs: bigint("max_duration_ms", { mode: "number" }),
    maxCostMicros: bigint("max_cost_micros", { mode: "number" }),
    ...dates,
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.id],
      foreignColumns: [members.workspaceId, members.id],
      name: "agent_profiles_member_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.supervisorId],
      foreignColumns: [members.workspaceId, members.id],
      name: "agent_profiles_supervisor_fk",
    }),
    check(
      "agent_profiles_limits",
      sql`(${t.maxDurationMs} IS NULL OR ${t.maxDurationMs} > 0) AND (${t.maxCostMicros} IS NULL OR ${t.maxCostMicros} > 0)`,
    ),
  ],
);
export const agentPermissions = pgTable(
  "agent_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    capability: text("capability").notNull(),
    decision: permissionDecision("decision").notNull(),
    ...dates,
  },
  (t) => [
    unique("agent_permissions_agent_capability").on(t.agentId, t.capability),
    foreignKey({
      columns: [t.workspaceId, t.agentId],
      foreignColumns: [members.workspaceId, members.id],
      name: "agent_permissions_member_fk",
    }),
  ],
);
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    status: runStatus("status").default("running").notNull(),
    version: integer("version").default(1).notNull(),
    summary: text("summary").default("").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: bigint("duration_ms", { mode: "number" }).default(0).notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }).default(0).notNull(),
    // Who paused the run: a person's pause holds until a person resumes.
    pausedBy: text("paused_by"),
    ...dates,
  },
  (t) => [
    check(
      "runs_paused_by",
      sql`${t.pausedBy} IS NULL OR ${t.pausedBy} IN ('person', 'agent', 'limit')`,
    ),
    unique("runs_workspace_id_unique").on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
      name: "runs_task_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.agentId],
      foreignColumns: [members.workspaceId, members.id],
      name: "runs_agent_fk",
    }),
    index("runs_workspace_started_idx").on(t.workspaceId, t.startedAt),
    uniqueIndex("runs_one_active_per_task")
      .on(t.taskId)
      .where(
        sql`${t.status} IN ('running','paused','needs_review','changes_requested')`,
      ),
    check(
      "runs_metrics",
      sql`${t.version} > 0 AND ${t.durationMs} >= 0 AND ${t.costMicros} >= 0`,
    ),
  ],
);
export const runEvents = pgTable(
  "run_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    kind: text("kind").notNull(),
    capability: text("capability"),
    title: text("title").notNull(),
    text: text("text").default("").notNull(),
    sourceUrl: text("source_url"),
    testStatus: text("test_status"),
    durationMs: bigint("duration_ms", { mode: "number" }).default(0).notNull(),
    costMicros: bigint("cost_micros", { mode: "number" }).default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("run_events_workspace_run_id_unique").on(
      t.workspaceId,
      t.runId,
      t.id,
    ),
    foreignKey({
      columns: [t.workspaceId, t.runId],
      foreignColumns: [runs.workspaceId, runs.id],
      name: "run_events_run_fk",
    }),
    index("run_events_run_created_idx").on(t.runId, t.createdAt),
    check(
      "run_events_kind",
      sql`${t.kind} IN ('step','tool_call','message','source','test')`,
    ),
    check(
      "run_events_metrics",
      sql`${t.durationMs} >= 0 AND ${t.costMicros} >= 0`,
    ),
  ],
);
export const runArtifacts = pgTable(
  "run_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    content: text("content").notNull(),
    diff: text("diff"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    unique("run_artifacts_workspace_run_id_unique").on(
      t.workspaceId,
      t.runId,
      t.id,
    ),
    foreignKey({
      columns: [t.workspaceId, t.runId],
      foreignColumns: [runs.workspaceId, runs.id],
      name: "run_artifacts_run_fk",
    }),
  ],
);
export const grants = pgTable(
  "grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    capability: text("capability").notNull(),
    taskId: uuid("task_id"),
    runId: uuid("run_id"),
    status: grantStatus("status").default("pending").notNull(),
    reason: text("reason").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    decidedBy: uuid("decided_by"),
    ...dates,
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.agentId],
      foreignColumns: [members.workspaceId, members.id],
      name: "grants_agent_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
      name: "grants_task_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.runId],
      foreignColumns: [runs.workspaceId, runs.id],
      name: "grants_run_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.decidedBy],
      foreignColumns: [members.workspaceId, members.id],
      name: "grants_decider_fk",
    }),
    unique("grants_workspace_id_unique").on(t.workspaceId, t.id),
    index("grants_agent_created_idx").on(t.agentId, t.createdAt),
  ],
);
export const reviewChecks = pgTable(
  "review_checks",
  {
    id: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    matchesDescription: boolean("matches_description").notNull(),
    verifiable: boolean("verifiable").notNull(),
    withinPermissions: boolean("within_permissions").notNull(),
    ...dates,
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.id],
      foreignColumns: [runs.workspaceId, runs.id],
      name: "review_checks_run_fk",
    }),
  ],
);
export const reviewComments = pgTable(
  "review_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    authorId: uuid("author_id").notNull(),
    body: text("body").notNull(),
    artifactId: uuid("artifact_id"),
    eventId: uuid("event_id"),
    line: integer("line"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.runId],
      foreignColumns: [runs.workspaceId, runs.id],
      name: "review_comments_run_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.authorId],
      foreignColumns: [members.workspaceId, members.id],
      name: "review_comments_author_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.runId, t.artifactId],
      foreignColumns: [
        runArtifacts.workspaceId,
        runArtifacts.runId,
        runArtifacts.id,
      ],
      name: "review_comments_artifact_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.runId, t.eventId],
      foreignColumns: [runEvents.workspaceId, runEvents.runId, runEvents.id],
      name: "review_comments_event_fk",
    }),
  ],
);
export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    runId: uuid("run_id").notNull(),
    artifactId: uuid("artifact_id").notNull(),
    decision: text("decision").notNull(),
    reviewedBy: uuid("reviewed_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.runId, t.artifactId],
      foreignColumns: [
        runArtifacts.workspaceId,
        runArtifacts.runId,
        runArtifacts.id,
      ],
      name: "review_items_artifact_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.reviewedBy],
      foreignColumns: [members.workspaceId, members.id],
      name: "review_items_reviewer_fk",
    }),
    check(
      "review_items_decision",
      sql`${t.decision} IN ('approve','request_changes')`,
    ),
  ],
);
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: text("id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    review: boolean("review").default(true).notNull(),
    block: boolean("block").default(true).notNull(),
    mention: boolean("mention").default(true).notNull(),
    done: boolean("done").default(true).notNull(),
    digest: boolean("digest").default(true).notNull(),
    digestAt: text("digest_at").default("09:00").notNull(),
    quiet: boolean("quiet").default(false).notNull(),
    nextDigestAt: timestamp("next_digest_at", {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    ...dates,
  },
  (t) => [
    index("notification_preferences_due_idx").on(t.nextDigestAt, t.id),
    check("notification_preferences_version", sql`${t.version}>0`),
    check(
      "notification_preferences_time",
      sql`${t.digestAt} IN ('08:00','09:00','18:00')`,
    ),
  ],
);
export const dailyDigests = pgTable(
  "daily_digests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull(),
    memberId: uuid("member_id").notNull(),
    localDate: text("local_date").notNull(),
    timeZone: text("time_zone").notNull(),
    locale: text("locale").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    ...dates,
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [members.workspaceId, members.id],
      name: "daily_digests_member_fk",
    }).onDelete("cascade"),
    unique("daily_digests_user_workspace_day").on(
      t.userId,
      t.workspaceId,
      t.localDate,
    ),
    index("daily_digests_recipient_date_idx").on(
      t.userId,
      t.workspaceId,
      t.localDate,
    ),
    check("daily_digests_date", sql`${t.localDate} ~ '^\\d{4}-\\d{2}-\\d{2}$'`),
    check("daily_digests_locale", sql`${t.locale} IN ('en','zh-CN','zh-HK')`),
  ],
);

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    memberId: uuid("member_id").notNull(),
    agentId: uuid("agent_id"),
    taskId: uuid("task_id"),
    runId: uuid("run_id"),
    grantId: uuid("grant_id"),
    digestId: uuid("digest_id").references(() => dailyDigests.id, {
      onDelete: "cascade",
    }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...dates,
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.memberId],
      foreignColumns: [members.workspaceId, members.id],
      name: "inbox_items_member_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.agentId],
      foreignColumns: [members.workspaceId, members.id],
      name: "inbox_items_agent_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
      name: "inbox_items_task_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.runId],
      foreignColumns: [runs.workspaceId, runs.id],
      name: "inbox_items_run_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.grantId],
      foreignColumns: [grants.workspaceId, grants.id],
      name: "inbox_items_grant_fk",
    }),
    index("inbox_items_member_created_idx").on(t.memberId, t.createdAt),
    check(
      "inbox_items_kind",
      sql`${t.kind} IN ('review','blocker','mention','done','digest')`,
    ),
  ],
);

export const taskComments = pgTable(
  "task_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    taskId: uuid("task_id").notNull(),
    authorId: uuid("author_id").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
      name: "task_comments_task_fk",
    }),
    foreignKey({
      columns: [t.workspaceId, t.authorId],
      foreignColumns: [members.workspaceId, members.id],
      name: "task_comments_author_fk",
    }),
    index("task_comments_task_idx").on(t.taskId, t.createdAt),
    check(
      "task_comments_body",
      sql`length(btrim(${t.body})) BETWEEN 1 AND 5000`,
    ),
  ],
);
export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    email: text("email").notNull(),
    role: memberRole("role").notNull(),
    hash: text("hash").notNull().unique(),
    status: text("status").default("pending").notNull(),
    createdBy: uuid("created_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedBy: text("accepted_by").references(() => user.id),
    ...dates,
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.createdBy],
      foreignColumns: [members.workspaceId, members.id],
      name: "workspace_invites_creator_fk",
    }),
    index("workspace_invites_workspace_idx").on(t.workspaceId, t.createdAt),
    check(
      "workspace_invites_status",
      sql`${t.status} IN ('pending','accepted','revoked')`,
    ),
  ],
);

export const taskCalendar = pgTable(
  "task_calendar",
  {
    taskId: uuid("id").primaryKey(),
    workspaceId: uuid("workspace_id").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    timeZone: text("time_zone").notNull(),
    rrule: text("rrule"),
    ...dates,
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
      name: "task_calendar_task_fk",
    }).onDelete("cascade"),
    index("task_calendar_workspace_start_idx").on(t.workspaceId, t.startAt),
    check(
      "task_calendar_duration",
      sql`${t.endAt}>${t.startAt} AND ${t.endAt}<=${t.startAt}+interval '168 hours'`,
    ),
    check(
      "task_calendar_range",
      sql`${t.startAt}>=timestamptz '1970-01-01T00:00:00Z' AND ${t.endAt}<timestamptz '2201-01-01T00:00:00Z'`,
    ),
    check(
      "task_calendar_timezone",
      sql`length(${t.timeZone}) BETWEEN 1 AND 100`,
    ),
    check(
      "task_calendar_rrule",
      sql`${t.rrule} IS NULL OR length(${t.rrule}) BETWEEN 1 AND 500`,
    ),
  ],
);
