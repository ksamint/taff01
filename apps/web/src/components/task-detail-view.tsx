"use client";
import "../styles/task-detail.css";

import { taskReference } from "@taff/schemas";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronDown, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { invalidateM3, useRun, useRuns, useTask } from "../lib/m3-queries";
import { useTaskAccess } from "../lib/m5-queries";
import { useAssignTask, useStartRun } from "../lib/mutations/tasks";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useMembers } from "../lib/queries";
import { useDesktop } from "../lib/use-desktop";
import { useWorkspace } from "./app-shell";
import { MemberOptions } from "./member-options";
import { ReviewView } from "./review-view";
import { RunPanel } from "./run-panel";
import { TaskContacts } from "./task-contacts";
import { TaskEditor } from "./task-editor";
import { TaskScheduleButton } from "./task-schedule-button";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

/**
 * Task detail (prototype v2): a sheet on phone, the right-hand panel on
 * desktop. `embedded` renders it inside a sheet or panel that owns the frame.
 */
export function TaskDetailView({
  taskId,
  embedded = false,
  onClose,
}: {
  taskId: string;
  embedded?: boolean;
  onClose?: () => void;
}) {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const desktop = useDesktop();
  const workerId = useId();
  const [workerEditing, setWorkerEditing] = useState(false);
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
  const assign = useAssignTask(taskId);
  const start = useStartRun(taskId, workspaceId, task.data);
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
  const assignDisabled =
    busy || !!active || !members.data || !access.data?.canAssign;
  const canStart =
    worker?.kind === "agent" && !active && task.data.status !== "done";
  const startButton = canStart && (
    <Button
      type="button"
      className="task-start"
      data-testid="run-start"
      disabled={
        busy || runs.isPending || runs.isError || !access.data?.canAssign
      }
      onClick={() => start.mutate()}
    >
      <ArrowRight size={14} aria-hidden="true" />
      {t("run.start")}
    </Button>
  );
  const runState = latest && (
    <Badge className="task-worker-state">
      <span
        className={`agent-status-dot agent-status-${latest.status}`}
        aria-hidden="true"
      />
      {t(`run.status.${latest.status}`)}
    </Badge>
  );
  const workerControl = desktop ? (
    <div className="task-worker-controls">
      <div className="task-field-row">
        <label htmlFor={workerId}>{t("worker")}</label>
        <span className="task-field-control">
          {worker?.kind === "agent" && (
            <Sparkles
              className="task-agent-icon"
              size={14}
              aria-hidden="true"
            />
          )}
          <select
            id={workerId}
            data-testid="detail-worker"
            value={task.data.workerId ?? ""}
            disabled={assignDisabled}
            onChange={(event) =>
              assign.mutate({
                workerId: event.target.value || null,
                version: task.data.version,
              })
            }
          >
            <MemberOptions members={members.data ?? []} />
          </select>
          {runState}
        </span>
      </div>
      {startButton}
    </div>
  ) : (
    <div className="task-worker-controls">
      <Button
        type="button"
        className="task-field-row"
        data-testid="task-field-worker"
        disabled={assignDisabled}
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
            {runState}
          </span>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </Button>
      {startButton}
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
            disabled={assignDisabled}
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
      className={`task-detail-view${embedded ? " task-detail-embedded" : ""}${desktop ? " is-panel" : " is-sheet"}${hasReview ? " task-detail-has-review" : ""}`}
    >
      <header className="task-detail-toolbar">
        {onClose ? (
          desktop ? (
            <Button
              type="button"
              className="button-quiet task-detail-close"
              onClick={onClose}
              aria-label={t("taskDetail.close")}
            >
              <X size={16} aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="button"
              className="button-quiet task-detail-back"
              onClick={onClose}
              aria-label={t("taskDetail.back")}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span aria-hidden="true">{t("actions.back")}</span>
            </Button>
          )
        ) : !embedded ? (
          <Link className="button button-quiet task-detail-back" href="/">
            <ArrowLeft size={16} aria-hidden="true" />
            {t("taskDetail.back")}
          </Link>
        ) : null}
        <span className="task-detail-ref">
          {taskReference(workspace.key, task.data.number)}
        </span>
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
          desktop={desktop}
          workerControl={workerControl}
          scheduleControl={<TaskScheduleButton taskId={taskId} />}
          contacts={<TaskContacts task={task.data} />}
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
              {hasReview && <ReviewView taskId={taskId} embedded />}
            </>
          }
        />
      </div>
    </article>
  );
}
