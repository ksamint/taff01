import { agentCostSchema } from "@taff/schemas";
import { useQuery } from "@tanstack/react-query";
import { request } from "./api";

export function useAgentCost(
  scope: "tasks" | "projects",
  id: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["agent-cost", scope, id],
    enabled,
    queryFn: async ({ signal }) =>
      agentCostSchema.parse(
        await request(`/api/costs/${scope}/${id}`, {
          cache: "no-store",
          signal,
        }),
      ),
    retry: false,
  });
}

export function formatAgentCost(costMicros: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(costMicros / 1_000_000);
}
