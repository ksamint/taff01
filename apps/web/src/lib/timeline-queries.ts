// Timeline read (M16). The key starts with the realtime family "timeline",
// so any plan, milestone, dependency or task change refreshes it.
import { type Timeline, timelineSchema } from "@taff/schemas/plan";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "./api";
import { currentSession } from "./session-cache";

export const timelineKey = (projectId: string) =>
  ["timeline", projectId] as const;

/** GET /api/projects/:id/timeline: the server's plan model, never recomputed. */
export function useTimeline(projectId: string | null) {
  const client = useQueryClient();
  return useQuery<Timeline>({
    queryKey: timelineKey(projectId ?? ""),
    enabled: !!projectId && currentSession(client)?.confirmed !== false,
    retry: false,
    queryFn: async () =>
      timelineSchema.parse(
        await request(`/api/projects/${projectId}/timeline`),
      ),
  });
}
