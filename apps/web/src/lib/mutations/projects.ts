// Project mutations (create and rename/archive from the project dialog).
import {
  type Project,
  type ProjectInput,
  type ProjectUpdate,
  projectSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../api";
import { invalidateM3 } from "../m3-queries";
import { projectsKey } from "../m5-queries";
import { m3MutationKey, snapshotM3 } from "../optimistic-m3";
import { isCurrentSnapshot, restoreQueries } from "../query-snapshot";

export type ProjectDialogMode = "new" | "edit" | null;

/** The project list with a new optimistic project or an edited one. */
export function withProjectSave(
  current: Project[] = [],
  mode: ProjectDialogMode,
  workspaceId: string,
  id: string,
  body: ProjectInput | ProjectUpdate,
  now: string,
): Project[] {
  return mode === "new"
    ? [
        ...current,
        {
          id,
          workspaceId,
          name: body.name!,
          archived: false,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      ]
    : current.map((item) => (item.id === id ? { ...item, ...body } : item));
}

/**
 * Creates (`mode` "new") or updates (`mode` "edit", the `baseline` project)
 * a project. `onSaved` closes the dialog and opens the saved project.
 */
export function useManageProject(
  workspaceId: string,
  {
    mode,
    baseline,
    onSaved,
  }: {
    mode: ProjectDialogMode;
    baseline: { id: string } | null;
    onSaved?: (project: Project) => void;
  },
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: ProjectInput | ProjectUpdate) =>
      request(
        mode === "new"
          ? `/api/projects?workspaceId=${workspaceId}`
          : `/api/projects/${baseline?.id}`,
        {
          method: mode === "new" ? "POST" : "PATCH",
          body: JSON.stringify(body),
        },
      ).then(projectSchema.parse),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const id =
        mode === "edit" ? baseline!.id : `optimistic:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      client.setQueryData<Project[]>(projectsKey(workspaceId), (current = []) =>
        withProjectSave(current, mode, workspaceId, id, body, now),
      );
      return { snapshot, id };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (project, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Project[]>(projectsKey(workspaceId), (current) =>
        current?.map((item) => (item.id === context.id ? project : item)),
      );
      onSaved?.(project);
    },
    onSettled: () => invalidateM3(client),
  });
}
