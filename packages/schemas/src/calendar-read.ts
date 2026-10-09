// zod/mini with named imports keeps one schema definition for server and
// client while letting the bundler drop unused validators and locales, so the
// Today route stays within its JavaScript budget.
import {
  array,
  boolean,
  type infer as Infer,
  iso,
  maxLength,
  minLength,
  nullable,
  object,
  string,
} from "zod/mini";
import { taskSchema } from "./base";
import { idSchema } from "./primitives";
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
export type CalendarSchedule = Infer<typeof calendarScheduleSchema>;
export type TaskCalendar = Infer<typeof taskCalendarSchema>;
export type CalendarOccurrence = Infer<typeof calendarOccurrenceSchema>;
export type CalendarViewData = Infer<typeof calendarViewDataSchema>;
