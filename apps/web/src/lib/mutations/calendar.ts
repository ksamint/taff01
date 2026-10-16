// Calendar-scene mutations (create a scheduled task from an empty slot).
import {
  type CalendarViewData,
  type CreateTask,
  createTaskSchema,
  type Task,
  taskSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../api";
import { invalidateM3 } from "../m3-queries";
import { m3MutationKey, snapshotM3 } from "../optimistic-m3";
import { tasksKey } from "../queries";
import { isCurrentSnapshot, restoreQueries } from "../query-snapshot";

/** The task shown in lists and the calendar until the create returns. */
export function optimisticCalendarTask(
  body: CreateTask,
  id: string,
  now: string,
): Task {
  return {
    ...body,
    id,
    number: 0,
    dueAt: body.dueAt ?? null,
    description: body.description ?? "",
    priority: body.priority ?? 3,
    projectId: body.projectId ?? null,
    labels: body.labels ?? [],
    parentId: body.parentId ?? null,
    status: "todo",
    workerId: body.workerId ?? null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/** Adds the new task's single occurrence when the create carries a slot. */
export function withCreatedOccurrence(
  current: CalendarViewData | undefined,
  task: Task,
  calendar: CreateTask["calendar"],
  workspaceId: string,
) {
  return current && calendar
    ? {
        ...current,
        occurrences: [
          ...current.occurrences,
          {
            id: task.id,
            task,
            schedule: { ...calendar, taskId: task.id, workspaceId },
            startAt: calendar.startAt,
            endAt: calendar.endAt,
            canSchedule: false,
            isAgent: false,
          },
        ],
      }
    : current;
}

/** Creates a task on the calendar; `onCreated` closes the slot editor. */
export function useCreateCalendarTask(
  workspaceId: string,
  { onCreated }: { onCreated?: () => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (body: CreateTask) =>
      taskSchema.parse(
        await request("/api/tasks", {
          method: "POST",
          body: JSON.stringify(createTaskSchema.parse(body)),
        }),
      ),
    onMutate: async (body) => {
      const snapshot = (
        await snapshotM3(client, [tasksKey(workspaceId)])
      ).start();
      const task = optimisticCalendarTask(
        body,
        `optimistic:${crypto.randomUUID()}`,
        new Date().toISOString(),
      );
      client.setQueryData(tasksKey(workspaceId), (items: unknown[] = []) => [
        task,
        ...items,
      ]);
      client.setQueriesData<CalendarViewData>(
        { queryKey: ["calendar", workspaceId] },
        (current) =>
          withCreatedOccurrence(current, task, body.calendar, workspaceId),
      );
      return snapshot.capture();
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (_, __, snapshot) => {
      if (isCurrentSnapshot(client, snapshot)) onCreated?.();
    },
    onSettled: () => invalidateM3(client),
  });
}
