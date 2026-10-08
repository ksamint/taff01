import {
  type CalendarOccurrence,
  type CalendarViewData,
  calendarViewDataSchema,
  type Member,
  type SetTaskCalendar,
  setTaskCalendarSchema,
  shiftCalendarSeries,
  type TaskCalendar,
  taskCalendarSchema,
} from "@taff/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./api";
import { invalidateM3 } from "./m3-queries";
import { m3MutationKey, patchTask, snapshotM3 } from "./optimistic-m3";
import { membersKey } from "./queries";
import { isCurrentSnapshot, restoreQueries } from "./query-snapshot";

export const taskCalendarKey = (id: string) => ["task-calendar", id] as const;
export function useTaskCalendar(id: string) {
  return useQuery({
    queryKey: taskCalendarKey(id),
    enabled: !id.startsWith("optimistic:"),
    staleTime: 0,
    queryFn: async () =>
      taskCalendarSchema.parse(await request(`/api/tasks/${id}/calendar`)),
  });
}
export function useCalendar(id: string, from: string, to: string) {
  const client = useQueryClient();
  return useQuery({
    refetchOnMount: () =>
      client.isMutating({ mutationKey: m3MutationKey }) === 0,
    queryKey: ["calendar", id, from, to],
    queryFn: async () =>
      calendarViewDataSchema.parse(
        await request(
          `/api/calendar?${new URLSearchParams({ workspaceId: id, from, to })}`,
        ),
      ),
  });
}

export function useSetCalendar() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async ({
      current,
      input,
    }: {
      current: TaskCalendar;
      input: SetTaskCalendar;
      onDone?: (data: TaskCalendar) => void;
    }) =>
      taskCalendarSchema.parse(
        await request(`/api/tasks/${current.task.id}/calendar`, {
          method: "PATCH",
          body: JSON.stringify(setTaskCalendarSchema.parse(input)),
        }),
      ),
    onMutate: async ({ current, input }) => {
      const snapshot = await snapshotM3(client, [
        taskCalendarKey(current.task.id),
      ]);
      const task = { ...current.task, version: input.version + 1 };
      const schedule = input.schedule
        ? { ...input.schedule, taskId: task.id, workspaceId: task.workspaceId }
        : null;
      const next = { ...current, task, schedule };
      patchTask(client, task.id, task);
      client.setQueryData(taskCalendarKey(task.id), next);
      client.setQueriesData<CalendarViewData>(
        { queryKey: ["calendar", task.workspaceId] },
        (data) => {
          if (!data) return data;
          const previous = data.occurrences.filter(
            (item) => item.task.id === task.id,
          );
          let replacements: CalendarOccurrence[] = [];
          if (schedule) {
            replacements = previous.map((item) => {
              const shifted = shiftCalendarSeries(
                {
                  ...item.schedule,
                  startAt: item.startAt,
                  endAt: item.endAt,
                  rrule: null,
                },
                item.schedule.startAt,
                schedule.startAt,
              );
              return {
                ...item,
                id: `${task.id}:${shifted.startAt}`,
                task,
                schedule,
                startAt: shifted.startAt,
                endAt: new Date(
                  Date.parse(shifted.startAt) +
                    Date.parse(schedule.endAt) -
                    Date.parse(schedule.startAt),
                ).toISOString(),
              };
            });
            if (!previous.length)
              replacements = [
                {
                  id: `${task.id}:${schedule.startAt}`,
                  task,
                  schedule,
                  startAt: schedule.startAt,
                  endAt: schedule.endAt,
                  canSchedule: current.canSchedule,
                  isAgent:
                    client
                      .getQueryData<Member[]>(membersKey(task.workspaceId))
                      ?.find((member) => member.id === task.workerId)?.kind ===
                    "agent",
                },
              ];
          }
          return {
            ...data,
            occurrences: [
              ...data.occurrences.filter((item) => item.task.id !== task.id),
              ...replacements,
            ],
            unscheduled: schedule
              ? data.unscheduled.filter((item) => item.task.id !== task.id)
              : [
                  ...data.unscheduled.filter(
                    (item) => item.task.id !== task.id,
                  ),
                  next,
                ],
          };
        },
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (data, variables, snapshot) => {
      if (!isCurrentSnapshot(client, snapshot)) return;
      patchTask(client, data.task.id, data.task);
      client.setQueryData(taskCalendarKey(data.task.id), data);
      variables.onDone?.(data);
    },
    onSettled: () => invalidateM3(client),
  });
}
