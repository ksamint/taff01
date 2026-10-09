"use client";

import {
  type AssignTask,
  assignTaskSchema,
  type CreateTask,
  createTaskSchema,
  type Task,
  taskSchema,
} from "@taff/schemas/base";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { m3MutationKey } from "../lib/optimistic-m3";
import {
  tasksKey,
  useMembers,
  useRuns,
  useTasks,
  useWorkspaceAccess,
} from "../lib/queries";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "../lib/query-snapshot";
import { todayTasks } from "../lib/today";
import { useWorkspace } from "./app-shell";
import { MemberOptions } from "./member-options";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const TODAY_PAGE = 20;

type TaskMutation =
  | { kind: "create"; body: CreateTask }
  | { kind: "assign"; id: string; body: AssignTask };

export function TodayView() {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const taskKey = tasksKey(workspace.id);
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(workspace.memberId);
  const [workerId, setWorkerId] = useState("");
  const [validationError, setValidationError] = useState(false);
  const members = useMembers(workspace.id);
  const access = useWorkspaceAccess(workspace.id);
  const tasks = useTasks(workspace.id);
  const runs = useRuns(workspace.id);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const mutation = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (input: TaskMutation) =>
      taskSchema.parse(
        await request(
          input.kind === "create"
            ? "/api/tasks"
            : `/api/tasks/${input.id}/assignment`,
          {
            method: input.kind === "create" ? "POST" : "PATCH",
            body: JSON.stringify(
              input.kind === "create"
                ? createTaskSchema.parse(input.body)
                : assignTaskSchema.parse(input.body),
            ),
          },
        ),
      ),
    onMutate: async (input) => {
      const snapshot = await snapshotQueries(client, [taskKey]);
      const temporaryId = `optimistic:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      client.setQueryData<Task[]>(taskKey, (current = []) =>
        input.kind === "create"
          ? [
              {
                ...input.body,
                dueAt: input.body.dueAt ?? null,
                description: input.body.description ?? "",
                priority: input.body.priority ?? 3,
                projectId: input.body.projectId ?? null,
                labels: input.body.labels ?? [],
                parentId: input.body.parentId ?? null,
                version: 1,
                id: temporaryId,
                status: "todo",
                createdAt: now,
                updatedAt: now,
              },
              ...current,
            ]
          : current.map((task) =>
              task.id === input.id
                ? { ...task, workerId: input.body.workerId }
                : task,
            ),
      );
      return { snapshot, temporaryId };
    },
    onError: (_, __, context) => {
      restoreQueries(client, context?.snapshot);
    },
    onSuccess: (task, input, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Task[]>(taskKey, (current = []) =>
        current.map((item) =>
          item.id === (input.kind === "create" ? context.temporaryId : input.id)
            ? task
            : item,
        ),
      );
      if (input.kind === "create") setTitle("");
    },
    onSettled: () => client.invalidateQueries({ queryKey: taskKey }),
  });
  const visibleTasks = todayTasks(tasks.data ?? [], me.user.tz);
  // A long backlog renders in pages: the first screen paints fast on a phone
  // and the rest arrives on request.
  const [showAll, setShowAll] = useState(false);
  const shownTasks = showAll ? visibleTasks : visibleTasks.slice(0, TODAY_PAGE);
  const hiddenCount = visibleTasks.length - shownTasks.length;
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const { dateFormatter, time, numbers } = useMemo(
    () => ({
      dateFormatter: new Intl.DateTimeFormat(locale, {
        timeZone: me.user.tz,
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
      time: new Intl.DateTimeFormat(locale, {
        timeZone: me.user.tz,
        hour: "numeric",
        minute: "2-digit",
      }),
      numbers: new Intl.NumberFormat(locale),
    }),
    [locale, me.user.tz],
  );
  const date = dateFormatter.format(new Date());
  const count = numbers.format(visibleTasks.length);
  const people =
    members.data?.filter((member) => member.kind === "person") ?? [];
  const agents = new Map(
    (members.data ?? [])
      .filter((member) => member.kind === "agent")
      .map((member) => [member.id, member.name]),
  );
  const agentWork = (runs.data ?? []).filter((run) =>
    ["running", "paused", "changes_requested"].includes(run.status),
  );
  const memberName = (id: string | null) =>
    members.data?.find((member) => member.id === id)?.name ??
    t("unknownMember");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createTaskSchema.safeParse({
      workspaceId: workspace.id,
      title,
      ownerId,
      workerId: workerId || null,
    });
    setValidationError(!parsed.success);
    if (parsed.success) mutation.mutate({ kind: "create", body: parsed.data });
  }
  return (
    <>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <div className="day-title">
          <h1 data-testid="today-heading">{t("today")}</h1>
          <span className="date">{date}</span>
        </div>
        <p className="greeting">{t("hello", { name: me.user.name })}</p>
        <p className="task-count">
          {t(visibleTasks.length === 1 ? "taskCount" : "tasksCount", { count })}
        </p>
      </section>
      <section className="agents-card" aria-labelledby="agents-heading">
        <h2 id="agents-heading">
          <Sparkles aria-hidden="true" strokeWidth={1.5} />
          {t("agentsAtWork")}
        </h2>
        {runs.isPending ? (
          <p className="quiet">{t("loading")}</p>
        ) : runs.isError ? (
          <p className="alert" role="alert">
            {t(errorKey(runs.error))}
          </p>
        ) : agentWork.length === 0 ? (
          <p className="quiet">{t("agentsIdle")}</p>
        ) : (
          <ul>
            {agentWork.map((run) => (
              <li key={run.id}>
                <Link className="task-title-link" href={`/tasks/${run.taskId}`}>
                  {tasks.data?.find((task) => task.id === run.taskId)?.title ??
                    t("agentProfile.task")}
                </Link>
                <Link href={`/agents/${run.agentId}`}>
                  <Sparkles size={12} aria-hidden="true" />
                  {agents.get(run.agentId) ?? t("agent")} ·{" "}
                  {t(`run.status.${run.status}`)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="today-grid">
        <section className="panel composer" aria-labelledby="new-task-heading">
          <h2 id="new-task-heading">{t("newTask")}</h2>
          <form onSubmit={submit} noValidate>
            <div className="field">
              <Label htmlFor="task-title">{t("taskTitle")}</Label>
              <Input
                id="task-title"
                data-testid="task-title"
                value={title}
                disabled={!access.data?.canCreateTasks || busy}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t("taskPlaceholder")}
                maxLength={200}
                required
              />
            </div>
            <div className="assignment-fields">
              <div className="field">
                <Label htmlFor="task-owner">{t("owner")}</Label>
                <select
                  id="task-owner"
                  data-testid="task-owner"
                  value={ownerId}
                  onChange={(event) => setOwnerId(event.target.value)}
                  disabled={
                    !access.data?.canCreateTasks || !people.length || busy
                  }
                >
                  {people.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <Label htmlFor="task-worker">{t("worker")}</Label>
                <select
                  id="task-worker"
                  data-testid="task-worker"
                  value={workerId}
                  onChange={(event) => setWorkerId(event.target.value)}
                  disabled={
                    !access.data?.canCreateTasks || !members.data || busy
                  }
                >
                  <MemberOptions members={members.data ?? []} />
                </select>
              </div>
            </div>
            <p className="field-hint assignment-hint">{t("ownerHint")}</p>
            {(validationError || mutation.isError) && (
              <p className="alert" role="alert">
                {t(
                  validationError
                    ? "errors.invalid_input"
                    : errorKey(mutation.error),
                )}
              </p>
            )}
            <Button
              data-testid="task-submit"
              className="button-primary button-full"
              type="submit"
              disabled={
                !access.data?.canCreateTasks ||
                busy ||
                !people.length ||
                tasks.isPending ||
                tasks.isError
              }
            >
              {t(
                busy && mutation.variables?.kind === "create"
                  ? "adding"
                  : "addTask",
              )}
            </Button>
          </form>
        </section>
        <section className="focus" aria-labelledby="focus-heading">
          <div className="section-heading">
            <h2 id="focus-heading">{t("yourFocus")}</h2>
            <span className="count-badge">{count}</span>
          </div>
          <p className="section-hint">{t("focusHint")}</p>
          {(members.isError || tasks.isError) && (
            <div className="alert" role="alert">
              <p>{t(errorKey(members.error ?? tasks.error))}</p>
              <Button
                className="button-quiet"
                onClick={() => {
                  void members.refetch();
                  void tasks.refetch();
                }}
              >
                {t("retry")}
              </Button>
            </div>
          )}
          {tasks.isPending ? (
            <p aria-live="polite">{t("loading")}</p>
          ) : visibleTasks.length === 0 ? (
            <div className="empty-state">
              <span className="empty-mark" aria-hidden="true">
                ✓
              </span>
              <h3>{t("emptyTitle")}</h3>
              <p>{t("emptyDescription")}</p>
            </div>
          ) : (
            <ul className="task-list" aria-live="polite">
              {shownTasks.map((task) => (
                <li key={task.id} data-testid="task-card" className="task-card">
                  <div className="task-card-top">
                    <span className={`status status-${task.status}`}>
                      {t(`status.${task.status}`)}
                    </span>
                    {task.dueAt && (
                      <span className="task-due">
                        {t("due", {
                          date: time.format(new Date(task.dueAt)),
                        })}
                      </span>
                    )}
                  </div>
                  <h3>
                    {task.id.startsWith("optimistic:") ? (
                      <span className="task-title-link" aria-busy="true">
                        {task.title}
                      </span>
                    ) : (
                      <Link
                        className="task-title-link"
                        href={`/tasks/${task.id}`}
                      >
                        {task.title}
                      </Link>
                    )}
                  </h3>
                  <p className="task-owner">
                    {t("ownedBy", { name: memberName(task.ownerId) })}
                  </p>
                  <div className="task-assignment">
                    <Label htmlFor={`worker-${task.id}`}>{t("worker")}</Label>
                    <select
                      id={`worker-${task.id}`}
                      data-testid="assignment-select"
                      value={task.workerId ?? ""}
                      disabled={
                        !access.data?.canCreateTasks || busy || !members.data
                      }
                      onChange={(event) =>
                        mutation.mutate({
                          kind: "assign",
                          id: task.id,
                          body: { workerId: event.target.value || null },
                        })
                      }
                    >
                      <MemberOptions members={members.data ?? []} />
                    </select>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="button button-full show-more"
              data-testid="today-show-more"
              onClick={() => setShowAll(true)}
            >
              {t("showMore", {
                count: numbers.format(hiddenCount),
              })}
            </button>
          )}
        </section>
      </div>
    </>
  );
}
