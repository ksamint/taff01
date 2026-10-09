import {
  _default,
  type infer as Infer,
  iso,
  maxLength,
  minLength,
  nullable,
  optional,
  refine,
  strictObject,
  string,
  trim,
} from "zod/mini";
import { idSchema, taskFields, timeZone } from "./primitives";

export const calendarInstantSchema = iso.datetime({ offset: true }).check(
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
export type CalendarScheduleInput = Infer<typeof calendarScheduleInputSchema>;
export type CreateTask = Infer<typeof createTaskSchema>;
