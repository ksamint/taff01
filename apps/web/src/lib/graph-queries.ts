import { workspaceGraphSchema } from "@taff/schemas/graph";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./api";
import { currentSession } from "./session-cache";

export function useWorkspaceGraph(workspaceId: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ["graph", workspaceId],
    enabled: currentSession(client)?.confirmed !== false,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const graph = workspaceGraphSchema.parse(
        await request(`/api/graph?workspaceId=${workspaceId}`, { signal }),
      );
      if (graph.workspaceId !== workspaceId)
        throw new Error("workspace_mismatch");
      return graph;
    },
    // Projection completion emits no business mutation; keep checking after it catches up.
    refetchInterval: (query) =>
      query.state.data?.status === "stale" ? 2000 : 30_000,
  });
}
