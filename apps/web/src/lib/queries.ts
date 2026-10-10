import {
  type Me,
  memberListSchema,
  meSchema,
  taskListSchema,
} from "@taff/schemas/base";
import { calendarViewDataSchema } from "@taff/schemas/calendar-read";
import { inboxSchema } from "@taff/schemas/inbox-read";
import { runListSchema } from "@taff/schemas/run-read";
import { workspaceAccessSchema } from "@taff/schemas/workspace-read";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, request } from "./api";
import { m3MutationKey } from "./optimistic-m3";
import { calendarKey, membersKey, runsKey, tasksKey } from "./query-keys";
import { currentSession } from "./session-cache";

export const meKey = ["me"] as const;
export { membersKey, runsKey, tasksKey } from "./query-keys";

export function useCalendar(id: string, from: string, to: string) {
  const client = useQueryClient();
  return useQuery({
    enabled: currentSession(client)?.confirmed !== false,
    refetchOnMount: () =>
      client.isMutating({ mutationKey: m3MutationKey }) === 0,
    queryKey: calendarKey(id, from, to),
    queryFn: async () =>
      calendarViewDataSchema.parse(
        await request(
          `/api/calendar?${new URLSearchParams({ workspaceId: id, from, to })}`,
        ),
      ),
  });
}

export function useMeQuery() {
  return useQuery({
    queryKey: meKey,
    queryFn: async (): Promise<Me | null> => {
      try {
        return meSchema.parse(await request("/api/me", { cache: "no-store" }));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
}

export function useMembers(workspaceId: string) {
  const client = useQueryClient();
  return useQuery({
    enabled: currentSession(client)?.confirmed !== false,
    queryKey: membersKey(workspaceId),
    queryFn: async () =>
      memberListSchema.parse(
        await request(`/api/members?workspaceId=${workspaceId}`),
      ),
  });
}

export function useTasks(workspaceId: string) {
  const client = useQueryClient();
  return useQuery({
    enabled: currentSession(client)?.confirmed !== false,
    queryKey: tasksKey(workspaceId),
    queryFn: async () =>
      taskListSchema.parse(
        await request(`/api/tasks?workspaceId=${workspaceId}`),
      ),
  });
}

export const inboxKey = (workspaceId: string) =>
  ["inbox", workspaceId] as const;

export function useInbox(workspaceId: string) {
  const client = useQueryClient();
  return useQuery({
    refetchOnMount: () =>
      client.isMutating({ mutationKey: m3MutationKey }) === 0,
    enabled: currentSession(client)?.confirmed !== false,
    staleTime: 0,
    queryKey: inboxKey(workspaceId),
    queryFn: async () =>
      inboxSchema.parse(await request(`/api/inbox?workspaceId=${workspaceId}`)),
  });
}

export function useWorkspaceAccess(id: string) {
  const client = useQueryClient();
  return useQuery({
    enabled: currentSession(client)?.confirmed !== false,
    queryKey: ["workspace-access", id],
    staleTime: 0,
    queryFn: async () =>
      workspaceAccessSchema.parse(
        await request(`/api/workspaces/${id}/access`),
      ),
    retry: false,
  });
}

export function useRuns(workspaceId: string) {
  const client = useQueryClient();
  return useQuery({
    enabled: currentSession(client)?.confirmed !== false,
    staleTime: 0,
    queryKey: runsKey(workspaceId),
    queryFn: async () =>
      runListSchema.parse(
        await request(`/api/runs?workspaceId=${workspaceId}`),
      ),
  });
}
