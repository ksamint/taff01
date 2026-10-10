import {
  agentProfileSchema,
  reviewWorkspaceSchema,
  runDetailSchema,
  taskSchema,
} from "@taff/schemas";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { request } from "./api";
import { currentSession } from "./session-cache";

export const runKey = (id: string) => ["run", id] as const;
export const taskDetailKey = (id: string) => ["task", id] as const;
export const reviewKey = (id: string) => ["review", id] as const;
export const agentKey = (id: string) => ["agent", id] as const;
export function useRun(id: string | undefined) {
  const client = useQueryClient();
  return useQuery({
    staleTime: 0,
    queryKey: runKey(id ?? ""),
    queryFn: async () =>
      runDetailSchema.parse(await request(`/api/runs/${id}`)),
    enabled:
      !!id &&
      !id.startsWith("optimistic:") &&
      currentSession(client)?.confirmed !== false,
  });
}
export function useTask(id: string) {
  const client = useQueryClient();
  return useQuery({
    enabled: currentSession(client)?.confirmed !== false,
    staleTime: 0,
    queryKey: taskDetailKey(id),
    queryFn: async () => taskSchema.parse(await request(`/api/tasks/${id}`)),
  });
}
export function useReview(id: string) {
  const client = useQueryClient();
  return useQuery({
    enabled: currentSession(client)?.confirmed !== false,
    staleTime: 0,
    queryKey: reviewKey(id),
    queryFn: async () =>
      reviewWorkspaceSchema.parse(await request(`/api/tasks/${id}/review`)),
    retry: false,
  });
}
export function useAgent(id: string) {
  const client = useQueryClient();
  return useQuery({
    enabled: currentSession(client)?.confirmed !== false,
    staleTime: 0,
    queryKey: agentKey(id),
    queryFn: async () =>
      agentProfileSchema.parse(await request(`/api/agents/${id}`)),
    retry: false,
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
        "notificationPreferences",
        "dailyDigests",
        "dailyDigest",
      ].includes(String(queryKey[0])),
  });
}

export { inboxKey, runsKey, useInbox, useRuns } from "./queries";
