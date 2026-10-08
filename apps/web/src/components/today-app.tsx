"use client";

import {
  type AssignTask,
  assignTaskSchema,
  type CreateTask,
  createTaskSchema,
  type Locale,
  type Me,
  type Member,
  memberSchema,
  meSchema,
  profileSchema,
  signInSchema,
  signUpSchema,
  type Task,
  taskSchema,
} from "@taff/schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, errorKey, request } from "../lib/api";
import { todayTasks } from "../lib/today";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

function savePreference(locale: Locale) {
  try {
    localStorage.setItem("taff-locale", locale);
  } catch {
    /* Storage may be disabled. */
  }
}

export function TodayApp() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [workspaceId, setWorkspaceId] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return meSchema.parse(await request("/api/me"));
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    retry: false,
  });
  useEffect(() => {
    if (me.data) {
      void i18n.changeLanguage(me.data.user.locale);
      savePreference(me.data.user.locale);
    }
  }, [me.data?.user.locale, i18n]);
  const profile = useMutation({
    mutationFn: (locale: Locale) =>
      request("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(
          profileSchema.parse({ locale, tz: me.data?.user.tz }),
        ),
      }),
    onMutate: (locale) => {
      const previous = i18n.language;
      setSessionError(null);
      void i18n.changeLanguage(locale);
      return previous;
    },
    onSuccess: (_, locale) => {
      savePreference(locale);
      client.setQueryData<Me | null>(["me"], (current) =>
        current ? { ...current, user: { ...current.user, locale } } : current,
      );
    },
    onError: (_, __, previous) => {
      void i18n.changeLanguage(previous ?? "en");
      setSessionError("errors.profile");
    },
  });
  const signOut = useMutation({
    mutationFn: () =>
      request("/api/auth/sign-out", { method: "POST", body: "{}" }),
    onSuccess: () => {
      client.clear();
      client.setQueryData(["me"], null);
      setWorkspaceId("");
      setSessionError(null);
    },
    onError: (error) => setSessionError(errorKey(error)),
  });
  const workspace =
    me.data?.workspaces.find(({ id }) => id === workspaceId) ??
    me.data?.workspaces[0];
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label={t("app")}>
          <span className="brand-mark" aria-hidden="true">
            t
          </span>
          {t("app")}
          <span className="brand-dot" aria-hidden="true">
            .
          </span>
        </a>
        <div className="header-actions">
          <Label htmlFor="locale-select">
            <span className="sr-only">{t("language")}</span>
          </Label>
          <select
            id="locale-select"
            data-testid="locale-select"
            className="language-select"
            value={i18n.resolvedLanguage ?? "en"}
            disabled={profile.isPending || me.isPending}
            onChange={(event) => {
              const locale = event.target.value as Locale;
              if (me.data) profile.mutate(locale);
              else {
                void i18n.changeLanguage(locale);
                savePreference(locale);
              }
            }}
          >
            <option value="en">{t("en")}</option>
            <option value="zh-CN">{t("zh-CN")}</option>
          </select>
          {me.data && (
            <Button
              className="button-quiet"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              {t("signOut")}
            </Button>
          )}
        </div>
      </header>
      {sessionError && (
        <p className="alert" role="alert">
          {t(sessionError)}
        </p>
      )}
      {me.isPending ? (
        <main className="loading" aria-live="polite">
          {t("loading")}
        </main>
      ) : me.isError ? (
        <main className="loading">
          <p role="alert">{t(errorKey(me.error))}</p>
          <Button onClick={() => void me.refetch()}>{t("retry")}</Button>
        </main>
      ) : !me.data ? (
        <Auth />
      ) : (
        <main>
          {me.data.workspaces.length > 1 && (
            <div className="workspace-picker">
              <Label htmlFor="workspace">{t("workspace")}</Label>
              <select
                id="workspace"
                value={workspace?.id}
                onChange={(event) => setWorkspaceId(event.target.value)}
              >
                {me.data.workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {workspace ? (
            <Today key={workspace.id} me={me.data} workspace={workspace} />
          ) : (
            <p className="loading">{t("noWorkspace")}</p>
          )}
        </main>
      )}
      <footer>{t("tagline")}</footer>
    </div>
  );
}

function Auth() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [signup, setSignup] = useState(false);
  const [validationError, setValidationError] = useState(false);
  const auth = useMutation({
    mutationFn: (
      body:
        | ReturnType<typeof signUpSchema.parse>
        | ReturnType<typeof signInSchema.parse>,
    ) =>
      request(`/api/auth/${signup ? "sign-up" : "sign-in"}/email`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["me"] });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      email: form.get("email"),
      password: form.get("password"),
      ...(signup ? { name: form.get("name") } : {}),
    };
    const parsed = (signup ? signUpSchema : signInSchema).safeParse(body);
    setValidationError(!parsed.success);
    if (parsed.success) auth.mutate(parsed.data);
  }
  return (
    <main className="auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">{t("app")}</p>
        <h1>{t("welcome")}</h1>
        <p>{t("authDescription")}</p>
        <div className="orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
      <section className="panel auth-panel" aria-labelledby="auth-heading">
        <h2 id="auth-heading">{t(signup ? "signUp" : "signIn")}</h2>
        <form onSubmit={submit} noValidate>
          {signup && (
            <div className="field">
              <Label htmlFor="auth-name">{t("name")}</Label>
              <Input
                id="auth-name"
                name="name"
                autoComplete="name"
                required
                maxLength={100}
              />
            </div>
          )}
          <div className="field">
            <Label htmlFor="auth-email">{t("email")}</Label>
            <Input
              id="auth-email"
              data-testid="auth-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <Label htmlFor="auth-password">{t("password")}</Label>
            <Input
              id="auth-password"
              data-testid="auth-password"
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              minLength={8}
              maxLength={128}
              required
              aria-describedby="password-hint"
            />
            <p id="password-hint" className="field-hint">
              {t("passwordHint")}
            </p>
          </div>
          {(validationError || auth.isError) && (
            <p className="alert" role="alert">
              {t(
                validationError
                  ? "errors.invalid_input"
                  : auth.error instanceof ApiError &&
                      auth.error.code === "network"
                    ? "errors.network"
                    : signup
                      ? "errors.signup"
                      : "errors.auth",
              )}
            </p>
          )}
          <Button
            data-testid="auth-submit"
            className="button-primary button-full"
            type="submit"
            disabled={auth.isPending}
          >
            {t(auth.isPending ? "working" : signup ? "signUp" : "signIn")}
          </Button>
        </form>
        <Button
          data-testid="auth-toggle"
          className="button-link"
          disabled={auth.isPending}
          onClick={() => {
            setSignup(!signup);
            setValidationError(false);
            auth.reset();
          }}
        >
          {t(signup ? "haveAccount" : "needAccount")}
        </Button>
      </section>
    </main>
  );
}

type TaskMutation =
  | { kind: "create"; body: CreateTask }
  | { kind: "assign"; id: string; body: AssignTask };

function Today({
  me,
  workspace,
}: {
  me: Me;
  workspace: Me["workspaces"][number];
}) {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const taskKey = ["tasks", workspace.id];
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(workspace.memberId);
  const [workerId, setWorkerId] = useState("");
  const [validationError, setValidationError] = useState(false);
  const members = useQuery({
    queryKey: ["members", workspace.id],
    queryFn: async () =>
      memberSchema
        .array()
        .parse(await request(`/api/members?workspaceId=${workspace.id}`)),
  });
  const tasks = useQuery({
    queryKey: taskKey,
    queryFn: async () =>
      taskSchema
        .array()
        .parse(await request(`/api/tasks?workspaceId=${workspace.id}`)),
  });
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
      <section className="day-heading">
        <p className="eyebrow">{workspace.name}</p>
        <div className="day-title">
          <h1 data-testid="today-heading">{t("today")}</h1>
          <span className="sun" aria-hidden="true">
            ☀
          </span>
        </div>
        <p className="date">{date}</p>
        <p className="greeting">{t("hello", { name: me.user.name })}</p>
        <p className="task-count">
          {t(visibleTasks.length === 1 ? "taskCount" : "tasksCount", { count })}
        </p>
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
              <span aria-hidden="true">＋</span>
            </Button>
          </form>
        </section>
        <section className="focus" aria-labelledby="focus-heading">
          <div className="focus-heading">
            <h2 id="focus-heading">{t("yourFocus")}</h2>
            <span className="count-badge">{count}</span>
          </div>
          <p className="focus-hint">{t("focusHint")}</p>
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
                    {t("ownedBy", {
                      name:
                        members.data?.find(({ id }) => id === task.ownerId)
                          ?.name ?? t("unknownMember"),
                    })}
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

function MemberOptions({ members }: { members: Member[] }) {
  const { t } = useTranslation();
  return (
    <>
      <option value="">{t("unassigned")}</option>
      {members.map((member) => (
        <option key={member.id} value={member.id}>
          {member.name} · {t(member.kind)}
        </option>
      ))}
    </>
  );
}
