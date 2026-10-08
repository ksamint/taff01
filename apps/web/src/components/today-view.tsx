"use client";

import {
  type AssignTask,
  assignTaskSchema,
  type CreateTask,
  createTaskSchema,
  type Task,
  taskSchema,
} from "@taff/schemas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { tasksKey, useMembers, useTasks } from "../lib/queries";
import { todayTasks } from "../lib/today";
import { useWorkspace } from "./app-shell";
import { MemberOptions } from "./member-options";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

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
  const tasks = useTasks(workspace.id);
  const mutation = useMutation({
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
      await client.cancelQueries({ queryKey: taskKey });
      const previous = client.getQueryData<Task[]>(taskKey);
      const temporaryId = crypto.randomUUID();
      const now = new Date().toISOString();
      client.setQueryData<Task[]>(taskKey, (current = []) =>
        input.kind === "create"
          ? [
              {
                ...input.body,
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
      return { previous, temporaryId };
    },
    onError: (_, __, context) => {
      if (context) client.setQueryData(taskKey, context.previous ?? []);
    },
    onSuccess: (task, input, context) => {
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
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: me.user.tz,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const count = new Intl.NumberFormat(locale).format(visibleTasks.length);
  const people =
    members.data?.filter((member) => member.kind === "person") ?? [];
  const agents = new Map(
    (members.data ?? [])
      .filter((member) => member.kind === "agent")
      .map((member) => [member.id, member.name]),
  );
  const agentWork = (tasks.data ?? []).filter(
    (task) =>
      task.status === "in_progress" &&
      task.workerId &&
      agents.has(task.workerId),
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
        {agentWork.length === 0 ? (
          <p className="quiet">{t("agentsIdle")}</p>
        ) : (
          <ul>
            {agentWork.map((task) => (
              <li key={task.id}>
                <span>{task.title}</span>
                <span>{agents.get(task.workerId ?? "")}</span>
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
                  disabled={!people.length || mutation.isPending}
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
                  disabled={!members.data || mutation.isPending}
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
                mutation.isPending ||
                !people.length ||
                tasks.isPending ||
                tasks.isError
              }
            >
              {t(
                mutation.isPending && mutation.variables?.kind === "create"
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
              {visibleTasks.map((task) => (
                <li key={task.id} data-testid="task-card" className="task-card">
                  <div className="task-card-top">
                    <span className={`status status-${task.status}`}>
                      {t(`status.${task.status}`)}
                    </span>
                    {task.dueAt && (
                      <span className="task-due">
                        {t("due", {
                          date: new Intl.DateTimeFormat(locale, {
                            timeZone: me.user.tz,
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(task.dueAt)),
                        })}
                      </span>
                    )}
                  </div>
                  <h3>{task.title}</h3>
                  <p className="task-owner">
                    {t("ownedBy", { name: memberName(task.ownerId) })}
                  </p>
                  <div className="task-assignment">
                    <Label htmlFor={`worker-${task.id}`}>{t("worker")}</Label>
                    <select
                      id={`worker-${task.id}`}
                      data-testid="assignment-select"
                      value={task.workerId ?? ""}
                      disabled={mutation.isPending || !members.data}
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
        </section>
      </div>
    </>
  );
}
