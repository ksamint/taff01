// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.
import {
  _default,
  array,
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
  refine,
  strictObject,
  string,
  trim,
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
