import {
  type Me,
  memberListSchema,
  meSchema,
  taskListSchema,
} from "@taff/schemas/base";
import { inboxSchema } from "@taff/schemas/inbox-read";
import { runListSchema } from "@taff/schemas/run-read";
import { workspaceAccessSchema } from "@taff/schemas/workspace-read";
import { useQuery } from "@tanstack/react-query";
import { ApiError, request } from "./api";

export const meKey = ["me"] as const;
export const tasksKey = (workspaceId: string) =>
  ["tasks", workspaceId] as const;
export const membersKey = (workspaceId: string) =>
  ["members", workspaceId] as const;

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
  return useQuery({
    queryKey: membersKey(workspaceId),
    queryFn: async () =>
      memberListSchema.parse(
        await request(`/api/members?workspaceId=${workspaceId}`),
      ),
  });
}

export function useTasks(workspaceId: string) {
  return useQuery({
    queryKey: tasksKey(workspaceId),
    queryFn: async () =>
      taskListSchema.parse(
        await request(`/api/tasks?workspaceId=${workspaceId}`),
      ),
  });
}

export const runsKey = (workspaceId: string) => ["runs", workspaceId] as const;

export const inboxKey = (workspaceId: string) =>
  ["inbox", workspaceId] as const;

export function useInbox(workspaceId: string) {
  return useQuery({
    staleTime: 0,
    queryKey: inboxKey(workspaceId),
    queryFn: async () =>
      inboxSchema.parse(await request(`/api/inbox?workspaceId=${workspaceId}`)),
  });
}

export function useWorkspaceAccess(id: string) {
  return useQuery({
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
  return useQuery({
    staleTime: 0,
    queryKey: runsKey(workspaceId),
    queryFn: async () =>
      runListSchema.parse(
        await request(`/api/runs?workspaceId=${workspaceId}`),
      ),
  });
}
