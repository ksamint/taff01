// Task mutations outside Today: quick add, task detail (assign, start a run)
// and the task editor (subtasks, comments).
import {
  type AssignTask,
  assignTaskSchema,
  type CreateTask,
  createTaskSchema,
  type QuickAddResult,
  quickAddInputSchema,
  quickAddResultSchema,
  type Run,
  type RunDetail,
  runSchema,
  startRunSchema,
  type Task,
  type TaskComment,
  taskCommentInputSchema,
  taskCommentSchema,
  taskSchema,
  type UpdateTask,
  updateTaskSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { request } from "../api";
import { invalidateM3, runKey, runsKey } from "../m3-queries";
import { commentsKey } from "../m5-queries";
import { m3MutationKey, patchTask, snapshotM3 } from "../optimistic-m3";
import { tasksKey } from "../queries";
import { isCurrentSnapshot, restoreQueries } from "../query-snapshot";
import { sessionVersion } from "../session-cache";
import { showToast } from "../toast";
import { replaceById } from "./replace";

/** The quick-add task shown at the top of the list until the create returns. */
export function optimisticQuickAddTask(
  body: CreateTask,
  id: string,
  now: string,
): Task {
  return {
    ...body,
    id,
    number: 0,
    description: body.description ?? "",
    priority: body.priority ?? 3,
    projectId: body.projectId ?? null,
    parentId: body.parentId ?? null,
    labels: body.labels ?? [],
    dueAt: body.dueAt ?? null,
    status: "todo",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** A new subtask, inheriting the parent's owner, project and dates. */
export function optimisticSubtask(
  parent: Task,
  title: string,
  id: string,
  now: string,
): Task {
  return {
    ...parent,
    id,
    title,
    parentId: parent.id,
    workerId: null,
    status: "todo",
    description: "",
    labels: [],
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/** The run shown as running until the server returns the started run. */
export function optimisticRun(
  task: Pick<Task, "id" | "workspaceId" | "workerId">,
  id: string,
  now: string,
): Run {
  return {
    id,
    workspaceId: task.workspaceId,
    taskId: task.id,
    agentId: task.workerId!,
    status: "running",
    version: 1,
    summary: "",
    startedAt: now,
    finishedAt: null,
    updatedAt: now,
    durationMs: 0,
    costMicros: 0,
  };
}

/**
 * Parses quick-add text into draft fields. `onParsed` fills the form when the
 * session is unchanged.
 */
export function useParseQuickAdd(
  workspaceId: string,
  { onParsed }: { onParsed?: (result: QuickAddResult) => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      request(`/api/quick-add/parse?workspaceId=${workspaceId}`, {
        method: "POST",
        body: JSON.stringify(quickAddInputSchema.parse({ text })),
      }).then(quickAddResultSchema.parse),
    onMutate: () => sessionVersion(client),
    onSuccess: (result, _, version) => {
      if (version !== sessionVersion(client)) return;
      onParsed?.(result);
    },
  });
}

/** Creates a task from quick add; `onCreated` closes the dialog. */
export function useCreateTask(
  workspaceId: string,
  { onCreated }: { onCreated?: (task: Task) => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: CreateTask) =>
      request("/api/tasks", {
        method: "POST",
        body: JSON.stringify(createTaskSchema.parse(body)),
      }).then(taskSchema.parse),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const id = `optimistic:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      client.setQueryData<Task[]>(tasksKey(workspaceId), (current = []) => [
        optimisticQuickAddTask(body, id, now),
        ...current,
      ]);
      snapshot.capture();
      return { snapshot, id };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (task, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Task[]>(tasksKey(workspaceId), (current) =>
        replaceById(current, context.id, task),
      );
      onCreated?.(task);
    },
    onSettled: () => invalidateM3(client),
  });
}

/** Assigns the task's worker from the task detail. */
export function useAssignTask(taskId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (body: AssignTask) =>
      taskSchema.parse(
        await request(`/api/tasks/${taskId}/assignment`, {
          method: "PATCH",
          body: JSON.stringify(assignTaskSchema.parse(body)),
        }),
      ),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      patchTask(client, taskId, { workerId: body.workerId });
      return snapshot.capture();
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
}

/**
 * Starts an agent run on the task. `task` is the loaded task (its worker is
 * the agent); `workspaceId` is the runs list the new run joins.
 */
export function useStartRun(
  taskId: string,
  workspaceId: string,
  task: Pick<Task, "workspaceId" | "workerId"> | undefined,
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: () =>
      request(`/api/tasks/${taskId}/runs`, {
        method: "POST",
        body: JSON.stringify(startRunSchema.parse({})),
      }).then(runSchema.parse),
    onMutate: async () => {
      const snapshot = await snapshotM3(client);
      const id = `optimistic:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const run = optimisticRun(
        {
          id: taskId,
          workspaceId: task!.workspaceId,
          workerId: task!.workerId,
        },
        id,
        now,
      );
      client.setQueryData<Run[]>(runsKey(workspaceId), (current = []) => [
        run,
        ...current,
      ]);
      client.setQueryData<RunDetail>(runKey(id), {
        run,
        events: [],
        artifacts: [],
        canControl: false,
        canSubmit: false,
      });
      patchTask(client, taskId, { status: "in_progress" });
      snapshot.capture();
      return { snapshot, id };
    },
    onSuccess: (run, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Run[]>(runsKey(workspaceId), (current) =>
        replaceById(current, context.id, run),
      );
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSettled: (_, __, ___, context) => {
      if (context)
        client.removeQueries({ queryKey: runKey(context.id), exact: true });
      return invalidateM3(client);
    },
  });
}

/** Adds a subtask under `task`; `onAdded` clears the subtask field. */
export function useAddSubtask(
  task: Task,
  { onAdded }: { onAdded?: (task: Task) => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (title: string) =>
      request("/api/tasks", {
        method: "POST",
        body: JSON.stringify(
          createTaskSchema.parse({
            workspaceId: task.workspaceId,
            title,
            ownerId: task.ownerId,
            parentId: task.id,
          }),
        ),
      }).then(taskSchema.parse),
    onMutate: async (title) => {
      const snapshot = await snapshotM3(client);
      const id = `optimistic:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      client.setQueryData<Task[]>(
        tasksKey(task.workspaceId),
        (current = []) => [optimisticSubtask(task, title, id, now), ...current],
      );
      snapshot.capture();
      return { snapshot, id };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (created, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Task[]>(tasksKey(task.workspaceId), (current) =>
        replaceById(current, context.id, created),
      );
      onAdded?.(created);
    },
    onSettled: () => invalidateM3(client),
  });
}

/**
 * Adds a task comment, shown at once when the author's member id is known.
 * `onAdded` clears the comment field.
 */
export function useAddTaskComment(
  task: Pick<Task, "id" | "workspaceId">,
  authorId: string | undefined,
  { onAdded }: { onAdded?: (comment: TaskComment) => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: string) =>
      request(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify(taskCommentInputSchema.parse({ body })),
      }).then(taskCommentSchema.parse),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const id = `optimistic:${crypto.randomUUID()}`;
      if (authorId)
        client.setQueryData<TaskComment[]>(
          commentsKey(task.id),
          (current = []) => [
            ...current,
            {
              id,
              workspaceId: task.workspaceId,
              taskId: task.id,
              authorId,
              body,
              createdAt: new Date().toISOString(),
            },
          ],
        );
      snapshot.capture();
      return { snapshot, id };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (created, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<TaskComment[]>(commentsKey(task.id), (current) =>
        replaceById(current, context.id, created),
      );
      onAdded?.(created);
    },
    onSettled: () => invalidateM3(client),
  });
}

type TaskPatch = Omit<UpdateTask, "version">;

/** The task's current values of the fields a patch changes, for undo. */
export function inversePatch(task: Task, patch: TaskPatch): TaskPatch {
  const inverse: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof TaskPatch)[])
    inverse[key] = task[key as keyof Task];
  return inverse as TaskPatch;
}

/**
 * One-field edits from the desktop panel (status, owner, priority, project,
 * description). Each shows a toast whose 撤銷 PATCHes the previous values
 * back with the version the edit returned (plan §2.4 item 6).
 */
export function useUndoableTaskEdit() {
  const client = useQueryClient();
  const { t } = useTranslation();
  const mutation = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: ({ id, body }: { id: string; body: UpdateTask }) =>
      request(`/api/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updateTaskSchema.parse(body)),
      }).then(taskSchema.parse),
    onMutate: async ({ id, body }) => {
      const snapshot = await snapshotM3(client);
      patchTask(client, id, { ...body, version: body.version + 1 });
      return snapshot.capture();
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (task, _, snapshot) => {
      if (isCurrentSnapshot(client, snapshot)) patchTask(client, task.id, task);
    },
    onSettled: () => invalidateM3(client),
  });
  return {
    isError: mutation.isError,
    error: mutation.error,
    isPending: mutation.isPending,
    change(
      task: Task,
      patch: TaskPatch,
      message: () => string,
      onDone?: () => void,
    ) {
      const undo = inversePatch(task, patch);
      mutation.mutate(
        { id: task.id, body: { ...patch, version: task.version } },
        {
          onSuccess: (saved) => {
            onDone?.();
            showToast(message(), {
              label: t("actions.undo"),
              run: () =>
                mutation.mutate({
                  id: saved.id,
                  body: { ...undo, version: saved.version },
                }),
            });
          },
        },
      );
    },
  };
}
