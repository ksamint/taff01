import { sql } from "drizzle-orm";
import {
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
export const memberRole = pgEnum("member_role", ["admin", "member"]);
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
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    ownerId: uuid("owner_id").notNull(),
    workerId: uuid("worker_id"),
    status: taskStatus("status").default("todo").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    ...dates,
  },
  (t) => [
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
