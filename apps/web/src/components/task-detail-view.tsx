"use client";

import {
  type AssignTask,
  assignTaskSchema,
  type Locale,
  type Run,
  type RunDetail,
  runSchema,
  startRunSchema,
  taskReference,
  taskSchema,
} from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import {
  invalidateM3,
  runKey,
  runsKey,
  useRun,
  useRuns,
  useTask,
} from "../lib/m3-queries";
import { useTaskAccess } from "../lib/m5-queries";
import { m3MutationKey, patchTask, snapshotM3 } from "../lib/optimistic-m3";
import { useMembers } from "../lib/queries";
import { isCurrentSnapshot, restoreQueries } from "../lib/query-snapshot";
import { useWorkspace } from "./app-shell";
import { MemberOptions } from "./member-options";
import { ReviewView } from "./review-view";
import { RunPanel } from "./run-panel";
import { TaskEditor } from "./task-editor";
import { TaskScheduleButton } from "./task-schedule-button";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

export function TaskDetailView({
  taskId,
  embedded = false,
  onClose,
}: {
  taskId: string;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const [workerEditing, setWorkerEditing] = useState(false);
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  const client = useQueryClient();
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const task = useTask(taskId);
  const access = useTaskAccess(taskId);
  const workspaceId = task.data?.workspaceId ?? workspace.id;
  const members = useMembers(workspaceId);
  const runs = useRuns(workspaceId);
  const latest = runs.data
    ?.filter((run) => run.taskId === taskId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const reviewStatus =
    !!latest &&
    ["needs_review", "changes_requested", "completed"].includes(latest.status);
  const runId = latest?.id;
  const [settledPlacement, setSettledPlacement] = useState<{
    runId: string;
    hasReview: boolean;
  } | null>(null);
  useEffect(() => {
    if (!busy)
      setSettledPlacement(runId ? { runId, hasReview: reviewStatus } : null);
  }, [busy, runId, reviewStatus]);
  // Keep the control mutation, confirmation and rollback error mounted until
  // it settles. A new run must never inherit the previous run's placement.
  const hasReview =
    busy && runId && settledPlacement?.runId === runId
      ? settledPlacement.hasReview
      : reviewStatus;
  const detail = useRun(latest?.id);
  const assign = useMutation({
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
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
  const start = useMutation({
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
      const run: Run = {
        id,
        workspaceId: task.data!.workspaceId,
        taskId,
        agentId: task.data!.workerId!,
        status: "running",
        version: 1,
        summary: "",
        startedAt: now,
        finishedAt: null,
        updatedAt: now,
        durationMs: 0,
        costMicros: 0,
      };
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
      return { snapshot, id };
    },
    onSuccess: (run, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Run[]>(runsKey(workspaceId), (current) =>
        current?.map((item) => (item.id === context.id ? run : item)),
      );
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSettled: (_, __, ___, context) => {
      if (context)
        client.removeQueries({ queryKey: runKey(context.id), exact: true });
      return invalidateM3(client);
    },
  });
  if (task.isPending) return <p className="loading">{t("loading")}</p>;
  if (task.isError)
    return (
      <p className="alert" role="alert">
        {t(errorKey(task.error))}
      </p>
    );
  const worker = members.data?.find(
    (member) => member.id === task.data.workerId,
  );
  const active =
    latest &&
    ["running", "paused", "needs_review", "changes_requested"].includes(
      latest.status,
    );
  const workerName = worker ? worker.name : t("unassigned");
  const workerControl = (
    <div className="task-worker-controls">
      <Button
        type="button"
        className="task-field-row"
        data-testid="task-field-worker"
        disabled={busy || !!active || !members.data || !access.data?.canAssign}
        onClick={() => setWorkerEditing(true)}
      >
        <span>{t("worker")}</span>
        <span className="task-worker-value">
          {worker?.kind === "agent" && (
            <span className="task-agent-avatar">
              <Sparkles size={13} aria-hidden="true" />
            </span>
          )}
          <span className="task-worker-copy">
            <span className="task-worker-name">{workerName}</span>
            {latest && (
              <Badge className="task-worker-state">
                <span
                  className={`agent-status-dot agent-status-${latest.status}`}
                  aria-hidden="true"
                />
                {t(`run.status.${latest.status}`)}
              </Badge>
            )}
          </span>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </Button>
      {worker?.kind === "agent" && !active && task.data.status !== "done" && (
        <Button
          type="button"
          className="button-primary task-start"
          data-testid="run-start"
          disabled={
            busy || runs.isPending || runs.isError || !access.data?.canAssign
          }
          onClick={() => start.mutate()}
        >
          <Play size={14} aria-hidden="true" />
          {t("run.start")}
        </Button>
      )}
      {workerEditing && (
        <SheetDialog
          title={t("worker")}
          onClose={() => setWorkerEditing(false)}
        >
          <Label htmlFor="detail-worker">{t("worker")}</Label>
          <select
            id="detail-worker"
            data-testid="detail-worker"
            value={task.data.workerId ?? ""}
            disabled={
              busy || !!active || !members.data || !access.data?.canAssign
            }
            onChange={(event) =>
              assign.mutate(
                {
                  workerId: event.target.value || null,
                  version: task.data.version,
                },
                { onSuccess: () => setWorkerEditing(false) },
              )
            }
          >
            <MemberOptions members={members.data ?? []} />
          </select>
          {assign.isError && (
            <p className="alert" role="alert">
              {t(errorKey(assign.error))}
            </p>
          )}
        </SheetDialog>
      )}
    </div>
  );
  return (
    <article
      className={`task-detail-view${embedded ? " task-detail-embedded" : ""}${hasReview ? " task-detail-has-review" : ""}`}
    >
      <header className="task-detail-toolbar">
        {onClose ? (
          <Button
            className="button-quiet"
            onClick={onClose}
            aria-label={t("taskDetail.back")}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </Button>
        ) : !embedded ? (
          <Link className="button button-quiet" href="/">
            {t("taskDetail.back")}
          </Link>
        ) : null}
        <span>{taskReference(workspace.key, task.data.number)}</span>
        <Badge
          className={`status status-${task.data.status}`}
          data-testid="task-status"
        >
          {t(`status.${task.data.status}`)}
        </Badge>
      </header>
      <div className="task-detail-body">
        <TaskEditor
          task={task.data}
          workerControl={workerControl}
          scheduleControl={<TaskScheduleButton taskId={taskId} />}
          runControl={
            detail.isError ? (
              <p className="alert" role="alert">
                {t(errorKey(detail.error))}
              </p>
            ) : detail.data && !hasReview ? (
              <RunPanel
                detail={detail.data}
                refresh={() => void invalidateM3(client)}
              />
            ) : null
          }
          afterDescription={
            <>
              {(assign.isError ||
                start.isError ||
                members.isError ||
                runs.isError) && (
                <p className="alert" role="alert">
                  {t(
                    errorKey(
                      assign.error ??
                        start.error ??
                        members.error ??
                        runs.error,
                    ),
                  )}
                </p>
              )}
              {hasReview && (
                <>
                  <Link
                    data-testid="open-review"
                    className="task-review-link"
                    href={`/tasks/${taskId}/review`}
                  >
                    {t("review.open")}
                  </Link>
                  <ReviewView taskId={taskId} embedded />
                </>
              )}
            </>
          }
        />
      </div>
    </article>
  );
}
