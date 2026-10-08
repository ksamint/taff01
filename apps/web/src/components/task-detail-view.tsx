"use client";

import {
  type AssignTask,
  assignTaskSchema,
  type Run,
  type RunDetail,
  runSchema,
  startRunSchema,
  taskSchema,
} from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, Play, Sparkles } from "lucide-react";
import Link from "next/link";
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
import { RunPanel } from "./run-panel";
import { TaskEditor } from "./task-editor";
import { TaskScheduleButton } from "./task-schedule-button";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

export function TaskDetailView({ taskId }: { taskId: string }) {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const client = useQueryClient();
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const task = useTask(taskId);
  const access = useTaskAccess(taskId);
  const members = useMembers(workspace.id);
  const runs = useRuns(workspace.id);
  const latest = runs.data
    ?.filter((run) => run.taskId === taskId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
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
        workspaceId: workspace.id,
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
      client.setQueryData<Run[]>(runsKey(workspace.id), (current = []) => [
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
      client.setQueryData<Run[]>(runsKey(workspace.id), (current) =>
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
          <TaskEditor task={task.data} />
          <TaskScheduleButton taskId={taskId} />
          <div className="field">
            <Label htmlFor="detail-worker">{t("worker")}</Label>
            <select
              id="detail-worker"
              data-testid="detail-worker"
              value={task.data.workerId ?? ""}
              disabled={
                busy || !!active || !members.data || !access.data?.canAssign
              }
              onChange={(event) =>
                assign.mutate({
                  workerId: event.target.value || null,
                  version: task.data.version,
                })
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
                  disabled={
                    busy ||
                    runs.isPending ||
                    runs.isError ||
                    !access.data?.canAssign
                  }
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
