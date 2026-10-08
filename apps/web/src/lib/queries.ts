import {
  type Me,
  memberListSchema,
  meSchema,
  taskListSchema,
} from "@taff/schemas";
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
        return meSchema.parse(await request("/api/me"));
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
