import {
  array,
  type infer as Infer,
  iso,
  maxLength,
  nullable,
  object,
  optional,
  refine,
  strictObject,
  string,
} from "zod/mini";
import { memberSchema, meSchema, taskSchema } from "./base";
import { calendarViewDataSchema } from "./calendar-read";
import { idSchema, nonnegativeInteger } from "./primitives";
import { runSchema } from "./run-read";

export const todayBootstrapQuerySchema = strictObject({
  preferredUserId: optional(string().check(maxLength(200))),
  workspaceId: optional(idSchema),
});
export const todayBootstrapSchema = object({
  me: meSchema,
  today: nullable(
    object({
      workspaceId: idSchema,
      now: nonnegativeInteger,
      from: iso.datetime(),
      to: iso.datetime(),
      // This is the full task collection, shared with the ordinary tasks cache.
      tasks: array(taskSchema),
      members: array(memberSchema),
      runs: array(runSchema),
      calendar: calendarViewDataSchema,
    }),
  ),
}).check(
  refine(({ me, today }) => {
    if (!today) return true;
    const workspaceId = today.workspaceId;
    return (
      me.workspaces.some((workspace) => workspace.id === workspaceId) &&
      Date.parse(today.from) <= today.now &&
      today.now < Date.parse(today.to) &&
      [...today.tasks, ...today.members, ...today.runs].every(
        (row) => row.workspaceId === workspaceId,
      ) &&
      today.calendar.occurrences.every(
        (row) =>
          row.task.workspaceId === workspaceId &&
          row.schedule.workspaceId === workspaceId &&
          row.schedule.taskId === row.task.id,
      ) &&
      today.calendar.unscheduled.every(
        (row) =>
          row.task.workspaceId === workspaceId &&
          (!row.schedule ||
            (row.schedule.workspaceId === workspaceId &&
              row.schedule.taskId === row.task.id)),
      )
    );
  }, "Invalid Today bootstrap workspace or range"),
);
export type TodayBootstrapQuery = Infer<typeof todayBootstrapQuerySchema>;
export type TodayBootstrap = Infer<typeof todayBootstrapSchema>;
