"use client";

import {
  type AssignTask,
  assignTaskSchema,
  startRunSchema,
  taskSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { invalidateM3, useRun, useRuns, useTask } from "../lib/m3-queries";
import { useMembers } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { MemberOptions } from "./member-options";
import { RunPanel } from "./run-panel";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

export function TaskDetailView({ taskId }: { taskId: string }) {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const task = useTask(taskId);
  const members = useMembers(workspace.id);
  const runs = useRuns(workspace.id);
  const latest = runs.data
    ?.filter((run) => run.taskId === taskId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const detail = useRun(latest?.id);
  const assign = useMutation({
    mutationFn: async (body: AssignTask) =>
      taskSchema.parse(
        await request(`/api/tasks/${taskId}/assignment`, {
          method: "PATCH",
          body: JSON.stringify(assignTaskSchema.parse(body)),
        }),
      ),
    onSettled: () => invalidateM3(client),
  });
  const start = useMutation({
    mutationFn: () =>
      request(`/api/tasks/${taskId}/runs`, {
        method: "POST",
        body: JSON.stringify(startRunSchema.parse({})),
      }),
    onSettled: () => invalidateM3(client),
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
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  return (
    <>
      <Link className="back-link" href="/">
        <ArrowLeft size={16} aria-hidden="true" />
        {t("taskDetail.back")}
      </Link>
      <section className="page-heading">
        <span
          className={`status status-${task.data.status}`}
          data-testid="task-status"
        >
          {t(`status.${task.data.status}`)}
        </span>
        <h1 data-testid="task-detail-heading">{task.data.title}</h1>
      </section>
      <div className="detail-layout">
        <div>
          <dl className="detail-fields">
            <div>
              <dt>{t("owner")}</dt>
              <dd>
                {members.data?.find((member) => member.id === task.data.ownerId)
                  ?.name ?? t("unknownMember")}
              </dd>
            </div>
            <div>
              <dt>{t("taskDetail.due")}</dt>
              <dd>
                {task.data.dueAt
                  ? new Intl.DateTimeFormat(locale, {
                      timeZone: me.user.tz,
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(task.data.dueAt))
                  : t("taskDetail.unscheduled")}
              </dd>
            </div>
          </dl>
          <div className="field">
            <Label htmlFor="detail-worker">{t("worker")}</Label>
            <select
              id="detail-worker"
              data-testid="detail-worker"
              value={task.data.workerId ?? ""}
              disabled={assign.isPending || !!active || !members.data}
              onChange={(event) =>
                assign.mutate({ workerId: event.target.value || null })
              }
            >
              <MemberOptions members={members.data ?? []} />
            </select>
          </div>
          {worker?.kind === "agent" && (
            <div className="action-row">
              <Link
                className="button button-quiet"
                href={`/agents/${worker.id}`}
              >
                <Sparkles size={16} aria-hidden="true" />
                {worker.name}
              </Link>
              {!active && task.data.status !== "done" && (
                <Button
                  className="button-primary"
                  data-testid="run-start"
                  disabled={start.isPending || runs.isPending || runs.isError}
                  onClick={() => start.mutate()}
                >
                  <Play size={16} aria-hidden="true" />
                  {t("run.start")}
                </Button>
              )}
            </div>
          )}
          {(assign.isError ||
            start.isError ||
            members.isError ||
            runs.isError) && (
            <p className="alert" role="alert">
              {t(
                errorKey(
                  assign.error ?? start.error ?? members.error ?? runs.error,
                ),
              )}
            </p>
          )}
          {task.data.status === "needs_review" && (
            <Link
              data-testid="open-review"
              className="button button-primary"
              href={`/tasks/${taskId}/review`}
            >
              {t("review.open")}
            </Link>
          )}
        </div>
        <div>
          {detail.isError ? (
            <p className="alert" role="alert">
              {t(errorKey(detail.error))}
            </p>
          ) : detail.data ? (
            <RunPanel
              detail={detail.data}
              refresh={() => void invalidateM3(client)}
            />
          ) : (
            <section className="empty-state">
              <Sparkles size={20} aria-hidden="true" />
              <p>{t(latest ? "loading" : "run.notStarted")}</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
