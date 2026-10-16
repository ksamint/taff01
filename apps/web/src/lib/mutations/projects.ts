// Project mutations: create and rename/archive from the project dialog, and
// board status moves with undo.
import {
  type Project,
  type ProjectInput,
  type ProjectUpdate,
  projectSchema,
  type Task,
  type TaskStatus,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { request } from "../api";
import { invalidateM3 } from "../m3-queries";
import { projectsKey, useEditTask } from "../m5-queries";
import { m3MutationKey, snapshotM3 } from "../optimistic-m3";
import { isCurrentSnapshot, restoreQueries } from "../query-snapshot";
import { showToast } from "../toast";

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
          contractAmount: null,
          currency: null,
          clientCompanyId: null,
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
      const snapshot = (await snapshotM3(client)).start();
      const id =
        mode === "edit" ? baseline!.id : `optimistic:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      client.setQueryData<Project[]>(projectsKey(workspaceId), (current = []) =>
        withProjectSave(current, mode, workspaceId, id, body, now),
      );
      snapshot.capture();
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

/**
 * Board status change (drag, keyboard menu or select) through the optimistic
 * task edit. On success a toast offers 撤銷: undo sends the inverse status
 * change with the saved version, never a snapshot (plan §2.4 item 6).
 */
export function useMoveTaskStatus({
  describe,
  undoLabel,
}: {
  describe: (status: TaskStatus) => string;
  undoLabel: string;
}) {
  const edit = useEditTask();
  const mutate = edit.mutate;
  const move = useCallback(
    (task: Task, status: TaskStatus) => {
      if (task.status === status) return;
      const previous = task.status;
      mutate(
        { id: task.id, body: { version: task.version, status } },
        {
          onSuccess: (saved) =>
            showToast(describe(status), {
              label: undoLabel,
              run: () =>
                mutate(
                  {
                    id: saved.id,
                    body: { version: saved.version, status: previous },
                  },
                  { onSuccess: () => showToast(describe(previous)) },
                ),
            }),
        },
      );
    },
    [mutate, describe, undoLabel],
  );
  return { move, edit };
}
