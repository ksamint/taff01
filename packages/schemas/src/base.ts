// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.

import {
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
  enum as zodEnum,
} from "zod/mini";
import { $ZodError } from "zod/v4/core";

import {
  idSchema,
  labelsSchema,
  localeSchema,
  memberRoleSchema,
  prioritySchema,
  taskStatusSchema,
  timeZone,
  workspaceQuerySchema,
} from "./primitives";
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
    object({
      id: idSchema,
      name: string(),
      memberId: idSchema,
      role: memberRoleSchema,
    }),
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
export const SchemaError = $ZodError;
export type AssignTask = Infer<typeof assignTaskSchema>;
export type Profile = Infer<typeof profileSchema>;
export type Member = Infer<typeof memberSchema>;
export type Task = Infer<typeof taskSchema>;
export type Me = Infer<typeof meSchema>;
export type Locale = Infer<typeof localeSchema>;
export type TaskStatus = Infer<typeof taskStatusSchema>;
export {
  idSchema,
  labelsSchema,
  localeSchema,
  memberRoleSchema,
  prioritySchema,
  taskStatusSchema,
  workspaceQuerySchema,
} from "./primitives";
