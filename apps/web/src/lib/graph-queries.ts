// Relations graph read (M16). The key starts with the realtime family
// "graph": ["graph", workspaceId, scope]. Every layer is fetched once and
// the layer chips filter on the client.
import { type RelationGraph, relationGraphSchema } from "@taff/schemas/graph";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./api";
import { currentSession } from "./session-cache";

export const graphKey = (workspaceId: string, projectId: string | null) =>
  ["graph", workspaceId, projectId ?? "workspace"] as const;

export function useRelationGraph(
  workspaceId: string,
  projectId: string | null,
) {
  const client = useQueryClient();
  return useQuery<RelationGraph>({
    queryKey: graphKey(workspaceId, projectId),
    enabled: currentSession(client)?.confirmed !== false,
    retry: false,
    queryFn: async () =>
      relationGraphSchema.parse(
        await request(
          `/api/workspaces/${workspaceId}/graph${projectId ? `?projectId=${projectId}` : ""}`,
        ),
      ),
  });
}
