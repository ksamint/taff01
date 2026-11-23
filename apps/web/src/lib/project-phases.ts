import { projectPhaseListSchema } from "@taff/schemas";
import { useQuery } from "@tanstack/react-query";
import { request } from "./api";

export const projectPhasesKey = (projectId: string) =>
  ["project-phases", projectId] as const;

export function useProjectPhases(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: projectPhasesKey(projectId),
    enabled,
    queryFn: async ({ signal }) =>
      projectPhaseListSchema.parse(
        await request(
          `/api/project-phases?${new URLSearchParams({ projectId })}`,
          { cache: "no-store", signal },
        ),
      ),
    retry: false,
  });
}
