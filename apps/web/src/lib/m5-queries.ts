import {
  projectSchema,
  taskAccessSchema,
  taskCommentSchema,
  taskSchema,
  type UpdateTask,
  updateTaskSchema,
} from "@taff/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./api";
import { invalidateM3 } from "./m3-queries";
import { m3MutationKey, patchTask, snapshotM3 } from "./optimistic-m3";
import { isCurrentSnapshot, restoreQueries } from "./query-snapshot";
export const projectsKey = (id: string) => ["projects", id] as const;
export const commentsKey = (id: string) => ["task-comments", id] as const;
export const accessKey = (id: string) => ["task-access", id] as const;
export function useProjects(id: string) {
  return useQuery({
    queryKey: projectsKey(id),
    queryFn: async () =>
      (await request<unknown[]>(`/api/projects?workspaceId=${id}`)).map(
        (value) => projectSchema.parse(value),
      ),
  });
}
export function useTaskComments(id: string) {
  return useQuery({
    queryKey: commentsKey(id),
    queryFn: async () =>
      (await request<unknown[]>(`/api/tasks/${id}/comments`)).map((value) =>
        taskCommentSchema.parse(value),
      ),
  });
}
export function useTaskAccess(id: string) {
  return useQuery({
    queryKey: accessKey(id),
    enabled: !id.startsWith("optimistic:"),
    staleTime: 0,
    queryFn: async () =>
      taskAccessSchema.parse(await request(`/api/tasks/${id}/access`)),
    retry: false,
  });
}
export function useEditTask() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: ({ id, body }: { id: string; body: UpdateTask }) =>
      request(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updateTaskSchema.parse(body)),
      }).then(taskSchema.parse),
    onMutate: async ({ id, body }) => {
      const snapshot = await snapshotM3(client);
      patchTask(client, id, { ...body, version: body.version + 1 });
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (task, _, snapshot) => {
      if (isCurrentSnapshot(client, snapshot)) patchTask(client, task.id, task);
    },
    onSettled: () => invalidateM3(client),
  });
}

export { useWorkspaceAccess } from "./queries";
