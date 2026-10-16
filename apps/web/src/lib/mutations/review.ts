// Agent-run review and run-control mutations (review workspace, run panel).
import {
  type ControlRun,
  controlRunSchema,
  type ReviewCommentInput,
  type ReviewRun,
  type ReviewWorkspace,
  type Run,
  reviewCommentSchema,
  reviewRunSchema,
  runSchema,
  type Task,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { request } from "../api";
import { invalidateM3, reviewKey } from "../m3-queries";
import {
  m3MutationKey,
  patchRun,
  patchTask,
  resolveInbox,
  snapshotM3,
} from "../optimistic-m3";
import { restoreQueries } from "../query-snapshot";

/** Run and task status a review decision leads to. */
export function reviewOutcome(decision: ReviewRun["decision"]): {
  run: Run["status"];
  task: Task["status"];
} {
  return decision === "approve"
    ? { run: "completed", task: "done" }
    : { run: "changes_requested", task: "in_progress" };
}

/** Run and task status a pause, resume or cancel leads to. */
export function controlOutcome(action: ControlRun["action"]): {
  run: Run["status"];
  task: Task["status"];
} {
  return {
    run:
      action === "pause"
        ? "paused"
        : action === "resume"
          ? "running"
          : "canceled",
    task: action === "cancel" ? "todo" : "in_progress",
  };
}

type ReviewTarget = {
  run: Pick<Run, "id">;
  task: Pick<Task, "id" | "workspaceId">;
};

/** Key of the comment draft a review comment clears once posted. */
export function reviewDraftKey(body: ReviewCommentInput) {
  return body.artifactId ?? body.eventId ?? "overall";
}

/** Approves or requests changes on a run that needs review. */
export function useReviewRun({ run, task }: ReviewTarget) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: ReviewRun) =>
      request(`/api/runs/${run.id}/review`, {
        method: "POST",
        body: JSON.stringify(reviewRunSchema.parse(body)),
      }),
    onMutate: async (body) => {
      const snapshot = (await snapshotM3(client)).start();
      const outcome = reviewOutcome(body.decision);
      patchRun(client, run.id, { status: outcome.run });
      patchTask(client, task.id, { status: outcome.task });
      client.setQueryData<ReviewWorkspace>(reviewKey(task.id), (current) =>
        current ? { ...current, checks: body.checks } : current,
      );
      resolveInbox(
        client,
        (item) => item.runId === run.id && item.kind === "review",
      );
      return snapshot.capture();
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
}

/**
 * Adds a review comment, shown at once when the author's member id is known.
 * `onAdded` clears the draft named by `reviewDraftKey`.
 */
export function useAddReviewComment(
  { run, task }: ReviewTarget,
  authorId: string | undefined,
  { onAdded }: { onAdded?: (body: ReviewCommentInput) => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: ReviewCommentInput) =>
      request(`/api/runs/${run.id}/comments`, {
        method: "POST",
        body: JSON.stringify(reviewCommentSchema.parse(body)),
      }),
    onMutate: async (body) => {
      const snapshot = (await snapshotM3(client)).start();
      if (authorId)
        client.setQueryData<ReviewWorkspace>(reviewKey(task.id), (current) =>
          current
            ? {
                ...current,
                comments: [
                  ...current.comments,
                  {
                    id: `optimistic:${crypto.randomUUID()}`,
                    workspaceId: task.workspaceId,
                    runId: run.id,
                    authorId,
                    body: body.body,
                    artifactId: body.artifactId ?? null,
                    eventId: body.eventId ?? null,
                    line: body.line ?? null,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : current,
        );
      return snapshot.capture();
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (_, body) => onAdded?.(body),
    onSettled: () => invalidateM3(client),
  });
}

/** Pauses, resumes or cancels a run; `onControlled` closes the dialog. */
export function useControlRun(
  run: Pick<Run, "id" | "taskId">,
  { onControlled }: { onControlled?: () => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: ControlRun) =>
      request(`/api/runs/${run.id}/control`, {
        method: "POST",
        body: JSON.stringify(controlRunSchema.parse(body)),
      }).then(runSchema.parse),
    onMutate: async (body) => {
      const snapshot = (await snapshotM3(client)).start();
      const outcome = controlOutcome(body.action);
      patchRun(client, run.id, { status: outcome.run });
      patchTask(client, run.taskId, { status: outcome.task });
      if (body.action === "cancel")
        resolveInbox(client, (item) => item.runId === run.id);
      return snapshot.capture();
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: () => onControlled?.(),
    onSettled: () => invalidateM3(client),
  });
}
