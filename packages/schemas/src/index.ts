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
  object,
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
  status: zodEnum(["todo", "in_progress", "needs_review", "done"]),
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
/** Thrown by every schema above on invalid input. */
export const SchemaError = $ZodError;
export type CreateTask = Infer<typeof createTaskSchema>;
export type AssignTask = Infer<typeof assignTaskSchema>;
export type Profile = Infer<typeof profileSchema>;
export type Member = Infer<typeof memberSchema>;
export type Task = Infer<typeof taskSchema>;
export type Me = Infer<typeof meSchema>;
export type Locale = Infer<typeof localeSchema>;
