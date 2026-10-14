// Mind map read (M18). The key starts with the realtime family "mind-map":
// ["mind-map", workspaceId, "exclude" | "include"] (archived rows).
import { type MindMap, mindMapSchema } from "@taff/schemas/mind";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./api";
import { currentSession } from "./session-cache";

export const mindKey = (workspaceId: string, archived: boolean) =>
  ["mind-map", workspaceId, archived ? "include" : "exclude"] as const;

export function useMindMap(workspaceId: string, archived: boolean) {
  const client = useQueryClient();
  return useQuery<MindMap>({
    queryKey: mindKey(workspaceId, archived),
    enabled: currentSession(client)?.confirmed !== false,
    retry: false,
    queryFn: async () =>
      mindMapSchema.parse(
        await request(
          `/api/workspaces/${workspaceId}/mind${archived ? "?archived=include" : ""}`,
        ),
      ),
  });
}
