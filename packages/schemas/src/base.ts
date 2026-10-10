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
  refine,
  regex,
  strictObject,
  string,
  trim,
  enum as zodEnum,
} from "zod/mini";
import { $ZodError } from "zod/v4/core";

import {
  calendarInstantSchema,
  idSchema,
  labelsSchema,
  localeSchema,
  memberRoleSchema,
  prioritySchema,
  taskFields,
  taskStatusSchema,
  timeZone,
  workspaceQuerySchema,
} from "./primitives";
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
  password: string().check(minLength(6), maxLength(128)),
});
export const usernameSchema = string().check(
  trim(),
  minLength(2),
  maxLength(30),
  regex(/^[a-zA-Z0-9_.]+$/),
);
export const usernameSignInSchema = strictObject({
  username: usernameSchema,
  password: string().check(minLength(6), maxLength(128)),
});
export const signUpSchema = extend(signInSchema, {
  name: string().check(trim(), minLength(1), maxLength(100)),
  password: string().check(minLength(8), maxLength(128)),
  username: optional(usernameSchema),
});
export const signOutSchema = strictObject({});
/** Initial SMS rollout accepts canonical mainland mobile numbers only. */
export const mainlandPhoneSchema = string().check(regex(/^\+861[3-9]\d{9}$/));
export const sendPhoneOtpSchema = strictObject({
  phoneNumber: mainlandPhoneSchema,
});
export const verifyPhoneOtpSchema = strictObject({
  phoneNumber: mainlandPhoneSchema,
  code: string().check(regex(/^\d{6}$/)),
});
export const authMethodsSchema = strictObject({ smsEnabled: boolean() });
export type AuthMethods = Infer<typeof authMethodsSchema>;
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
    "rate_limited",
    "sms_unavailable",
    "sms_invalid_code",
  ]),
});
export const SchemaError = $ZodError;
export type CreateTask = Infer<typeof createTaskSchema>;
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
