import { memberRateListSchema, timeEntriesListSchema } from "@taff/schemas";
import { useQuery } from "@tanstack/react-query";
import { request } from "./api";

export const timeEntriesFamily = ["time-entries"] as const;
export const memberRatesFamily = ["member-rates"] as const;

export function useTimeEntries(workspaceId: string, taskId?: string) {
  const query = new URLSearchParams({ workspaceId });
  if (taskId) query.set("taskId", taskId);
  return useQuery({
    queryKey: [...timeEntriesFamily, workspaceId, taskId],
    queryFn: async ({ signal }) =>
      timeEntriesListSchema.parse(
        await request(`/api/time-entries?${query}`, {
          cache: "no-store",
          signal,
        }),
      ),
    retry: false,
  });
}

export function useMemberRates(workspaceId: string, all = false) {
  const query = new URLSearchParams({ workspaceId });
  if (all) query.set("all", "true");
  return useQuery({
    queryKey: [...memberRatesFamily, workspaceId, all],
    queryFn: async ({ signal }) =>
      memberRateListSchema.parse(
        await request(`/api/member-rates?${query}`, {
          cache: "no-store",
          signal,
        }),
      ),
    retry: false,
  });
}
