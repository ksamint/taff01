// Today-route mutation. This file is in the Today initial bundle, so it only
// imports what today-view imported before the M13 extraction.
import {
  type AssignTask,
  assignTaskSchema,
  taskSchema,
} from "@taff/schemas/base";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../api";
import { m3MutationKey, patchTask, snapshotM3 } from "../optimistic-m3";
import { isCurrentSnapshot, restoreQueries } from "../query-snapshot";

/** Families Today's assignment refreshes once the last m3 write settles. */
const TODAY_ASSIGN_FAMILIES = [
  "tasks",
  "task",
  "calendar",
  "task-calendar",
  "task-access",
  "review",
  "search",
];

/** Assigns a task's worker from Today (optimistic, rolled back on error). */
export function useAssignTodayTask() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (input: { id: string; body: AssignTask }) =>
      taskSchema.parse(
        await request(`/api/tasks/${input.id}/assignment`, {
          method: "PATCH",
          body: JSON.stringify(assignTaskSchema.parse(input.body)),
        }),
      ),
    onMutate: async (input) => {
      const snapshot = await snapshotM3(client);
      patchTask(client, input.id, { workerId: input.body.workerId });
      snapshot.capture();
      return { snapshot };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (task, _, context) => {
      if (isCurrentSnapshot(client, context.snapshot))
        patchTask(client, task.id, task);
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: m3MutationKey }) > 1) return;
      return client.invalidateQueries({
        predicate: ({ queryKey }) =>
          TODAY_ASSIGN_FAMILIES.includes(String(queryKey[0])),
      });
    },
  });
}
