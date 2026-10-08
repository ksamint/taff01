import {
  agentProfileSchema,
  inboxSchema,
  reviewWorkspaceSchema,
  runDetailSchema,
  runListSchema,
  taskSchema,
} from "@taff/schemas";
import { type QueryClient, useQuery } from "@tanstack/react-query";
import { request } from "./api";

export const runsKey = (workspaceId: string) => ["runs", workspaceId] as const;
export const runKey = (id: string) => ["run", id] as const;
export const taskDetailKey = (id: string) => ["task", id] as const;
export const reviewKey = (id: string) => ["review", id] as const;
export const agentKey = (id: string) => ["agent", id] as const;
export const inboxKey = (workspaceId: string) =>
  ["inbox", workspaceId] as const;

export function useRuns(workspaceId: string) {
  return useQuery({
    staleTime: 0,
    queryKey: runsKey(workspaceId),
    queryFn: async () =>
      runListSchema.parse(
        await request(`/api/runs?workspaceId=${workspaceId}`),
      ),
  });
}
export function useRun(id: string | undefined) {
  return useQuery({
    staleTime: 0,
    queryKey: runKey(id ?? ""),
    queryFn: async () =>
      runDetailSchema.parse(await request(`/api/runs/${id}`)),
    enabled: !!id && !id.startsWith("optimistic:"),
  });
}
export function useTask(id: string) {
  return useQuery({
    staleTime: 0,
    queryKey: taskDetailKey(id),
    queryFn: async () => taskSchema.parse(await request(`/api/tasks/${id}`)),
  });
}
export function useReview(id: string) {
  return useQuery({
    staleTime: 0,
    queryKey: reviewKey(id),
    queryFn: async () =>
      reviewWorkspaceSchema.parse(await request(`/api/tasks/${id}/review`)),
    retry: false,
  });
}
export function useAgent(id: string) {
  return useQuery({
    staleTime: 0,
    queryKey: agentKey(id),
    queryFn: async () =>
      agentProfileSchema.parse(await request(`/api/agents/${id}`)),
    retry: false,
  });
}
export function useInbox(workspaceId: string) {
  return useQuery({
    staleTime: 0,
    queryKey: inboxKey(workspaceId),
    queryFn: async () =>
      inboxSchema.parse(await request(`/api/inbox?workspaceId=${workspaceId}`)),
  });
}
export function invalidateM3(client: QueryClient) {
  if (client.isMutating() > 1) return Promise.resolve();
  return client.invalidateQueries({
    predicate: ({ queryKey }) =>
      [
        "tasks",
        "task",
        "runs",
        "run",
        "review",
        "agent",
        "inbox",
        "calendar",
        "task-calendar",
        "task-access",
        "task-comments",
        "projects",
        "search",
        "invites",
        "workspace-access",
        "members",
        "org-drafts",
      ].includes(String(queryKey[0])),
  });
}
