"use client";

import {
  type AssignTask,
  assignTaskSchema,
  type Task,
  taskSchema,
} from "@taff/schemas/base";
import {
  type CalendarOccurrence,
  calendarCivilTime,
  calendarWallToInstant,
} from "@taff/schemas/calendar-read";
import {
  type PrototypeLocale,
  presentPrototypeField,
  prototypeTaskReference,
} from "@taff/schemas/prototype-data";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { m3MutationKey, patchTask, snapshotM3 } from "../lib/optimistic-m3";
import {
  useCalendar,
  useMembers,
  useRuns,
  useTasks,
  useWorkspaceAccess,
} from "../lib/queries";
import { isCurrentSnapshot, restoreQueries } from "../lib/query-snapshot";
import { todayTasks } from "../lib/today";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { StatusGlyph } from "./ui/status-glyph";

const TODAY_PAGE = 20;

// Prototype Today, lines 47–114: schedules and deadlines are distinct reads.
export function TodayView({ initialNow }: { initialNow: number }) {
  const { me, workspace, openSearch } = useWorkspace();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const members = useMembers(workspace.id);
  const access = useWorkspaceAccess(workspace.id);
  const tasks = useTasks(workspace.id);
  const runs = useRuns(workspace.id);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const [now, setNow] = useState(() => new Date(initialNow));
  // Only the real wall clock advances here; agent state comes from the API.
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const localDate = calendarCivilTime(now, me.user.tz)
    .toISOString()
    .slice(0, 10);
  const range = useMemo(() => {
    const next = new Date(`${localDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    return {
      from: calendarWallToInstant(`${localDate}T00:00`, me.user.tz),
      to: calendarWallToInstant(
        `${next.toISOString().slice(0, 10)}T00:00`,
        me.user.tz,
      ),
    };
  }, [localDate, me.user.tz]);
  const calendar = useCalendar(workspace.id, range.from, range.to);
  const mutation = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (input: { id: string; body: AssignTask }) =>
      taskSchema.parse(
        await request(`/api/tasks/${input.id}/assignment`, {
          method: "PATCH",
          body: JSON.stringify(assignTaskSchema.parse(input.body)),
        }),
      ),
    onMutate: async (input) => {
      const snapshot = await snapshotM3(client);
      patchTask(client, input.id, { workerId: input.body.workerId });
      return { snapshot };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (task, _, context) => {
      if (isCurrentSnapshot(client, context.snapshot))
        patchTask(client, task.id, task);
    },
    onSettled: () => {
      if (client.isMutating({ mutationKey: m3MutationKey }) > 1) return;
      return client.invalidateQueries({
        predicate: ({ queryKey }) =>
          [
            "tasks",
            "task",
            "calendar",
            "task-calendar",
            "task-access",
            "review",
            "search",
          ].includes(String(queryKey[0])),
      });
    },
  });
  const visibleTasks = todayTasks(
    (tasks.data ?? []).filter(
      (task) => task.dueAt || !task.labels.includes("meeting"),
    ),
    me.user.tz,
    now,
  );
  const [showAll, setShowAll] = useState(false);
  const shownTasks = showAll ? visibleTasks : visibleTasks.slice(0, TODAY_PAGE);
  const hiddenCount = visibleTasks.length - shownTasks.length;
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as PrototypeLocale;
  const { date, time, numbers } = useMemo(
    () => ({
      date: new Intl.DateTimeFormat(locale, {
        timeZone: me.user.tz,
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
      time: new Intl.DateTimeFormat(locale, {
        timeZone: me.user.tz,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
      numbers: new Intl.NumberFormat(locale),
    }),
    [locale, me.user.tz],
  );
  const present = (task: Task) =>
    presentPrototypeField(task.id, "title", task.title, locale);
  const memberName = (id: string | null) => {
    const member = members.data?.find((item) => item.id === id);
    return member
      ? presentPrototypeField(member.id, "name", member.name, locale)
      : t("unknownMember");
  };
  const occurrences = [...(calendar.data?.occurrences ?? [])].sort((a, b) =>
    a.startAt.localeCompare(b.startAt),
  );
  const activeRuns = (runs.data ?? []).filter((run) =>
    ["running", "paused", "changes_requested"].includes(run.status),
  );
  const unscheduledRuns = activeRuns.filter(
    (run) => !occurrences.some((item) => item.task.id === run.taskId),
  );
  const beforeNow = occurrences.filter(
    (item) => Date.parse(item.startAt) <= now.getTime(),
  );
  const afterNow = occurrences.filter(
    (item) => Date.parse(item.startAt) > now.getTime(),
  );
  const readError = tasks.error ?? members.error ?? access.error;
  const scheduleError = calendar.error ?? runs.error;
  const reference = (task: Task) =>
    prototypeTaskReference(task.id) ?? task.id.slice(0, 8);
  function scheduleBlock(item: CalendarOccurrence) {
    const run = activeRuns.find((entry) => entry.taskId === item.task.id);
    const meeting = item.task.labels.includes("meeting");
    const past = Date.parse(item.endAt) <= now.getTime();
    const isAgent = members.data
      ? members.data.some(
          (member) =>
            member.id === item.task.workerId && member.kind === "agent",
        )
      : item.isAgent;
    const description = presentPrototypeField(
      item.task.id,
      "description",
      item.task.description,
      locale,
    );
    const meta = isAgent
      ? `${memberName(item.task.workerId)} · ${t(run ? `run.status.${run.status}` : `status.${item.task.status}`)}`
      : description.startsWith("Participants:") ||
          description.startsWith("參與者：") ||
          description.startsWith("参与者：")
        ? description.replace(/^(?:Participants:|參與者：|参与者：)\s*/, "")
        : memberName(item.task.workerId ?? item.task.ownerId);
    return (
      <li
        className={`today-timeline-row${past ? " today-past" : ""}`}
        key={item.id}
      >
        <time className="today-time" dateTime={item.startAt}>
          {time.format(new Date(item.startAt))}
        </time>
        <Link
          href={`/tasks/${item.task.id}`}
          prefetch={false}
          className={`today-schedule-block${isAgent ? " today-agent-block" : ""}${item.task.status === "done" ? " today-schedule-done" : ""}${meeting ? " today-meeting-block" : ""}`}
          data-testid="today-schedule"
        >
          <span className="today-block-heading">
            {!isAgent && !meeting && <StatusGlyph status={item.task.status} />}
            <span className="today-block-title">{present(item.task)}</span>
            {isAgent && (
              <Sparkles size={14} strokeWidth={1.5} aria-hidden="true" />
            )}
          </span>
          <span className="today-block-meta">
            {time.format(new Date(item.startAt))}–
            {time.format(new Date(item.endAt))} · {meta}
          </span>
        </Link>
      </li>
    );
  }
  return (
    <div className="today-view">
      <header className="today-header">
        <div className="today-header-title">
          <time className="today-date" dateTime={localDate}>
            {date.format(now)}
          </time>
          <h1 data-testid="today-heading">{t("today")}</h1>
        </div>
        <div className="today-header-actions">
          <Button
            className="today-search"
            data-testid="open-search"
            aria-label={t("search.title")}
            onClick={openSearch}
          >
            <Search size={20} strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Link
            className="today-avatar-link"
            href="/me"
            prefetch={false}
            aria-label={t("me.signedInAs", { name: me.user.name })}
          >
            <span className="today-avatar" aria-hidden="true">
              {me.user.name.slice(0, 1)}
            </span>
          </Link>
        </div>
      </header>
      <section
        className="today-schedule"
        aria-labelledby="today-schedule-heading"
      >
        <h2 className="today-section-label" id="today-schedule-heading">
          {t("calendar.schedule")}
        </h2>
        {scheduleError && (
          <div className="today-message alert" role="alert">
            <p>{t(errorKey(scheduleError))}</p>
            <Button
              className="button-quiet"
              onClick={() => {
                void calendar.refetch();
                void runs.refetch();
              }}
            >
              {t("retry")}
            </Button>
          </div>
        )}
        {calendar.isPending ? (
          <p className="today-message quiet">{t("loading")}</p>
        ) : (
          <>
            <ol className="today-timeline">
              {beforeNow.map(scheduleBlock)}
              <li
                className="today-now"
                aria-label={`${t("todayNow")} · ${time.format(now)}`}
              >
                <time dateTime={now.toISOString()}>{time.format(now)}</time>
                <span className="today-now-rule" aria-hidden="true">
                  <span />
                  <span />
                </span>
              </li>
              {afterNow.map(scheduleBlock)}
              {unscheduledRuns.map((run) => {
                const task = tasks.data?.find((item) => item.id === run.taskId);
                return (
                  <li className="today-timeline-row" key={run.id}>
                    <span className="today-time" aria-hidden="true" />
                    <Link
                      className="today-schedule-block today-agent-block"
                      href={`/tasks/${run.taskId}`}
                      prefetch={false}
                      data-testid="today-agent-work"
                    >
                      <span className="today-block-heading">
                        <span className="today-block-title">
                          {task ? present(task) : t("agentProfile.task")}
                        </span>
                        <Sparkles
                          size={14}
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="today-block-meta">
                        {t("calendar.unscheduled")} · {memberName(run.agentId)}{" "}
                        · {t(`run.status.${run.status}`)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
            {occurrences.length === 0 &&
              unscheduledRuns.length === 0 &&
              !calendar.isError &&
              !runs.isPending &&
              !runs.isError && (
                <p className="today-message quiet">{t("todayScheduleEmpty")}</p>
              )}
            {calendar.data?.truncated && (
              <p className="today-message quiet">{t("calendar.truncated")}</p>
            )}
          </>
        )}
      </section>
      <section className="today-due" aria-labelledby="today-due-heading">
        <h2 className="today-section-label" id="today-due-heading">
          {t("todayDue")}
        </h2>
        {readError && (
          <div className="today-message alert" role="alert">
            <p>{t(errorKey(readError))}</p>
            <Button
              className="button-quiet"
              onClick={() => {
                void tasks.refetch();
                void members.refetch();
                void access.refetch();
              }}
            >
              {t("retry")}
            </Button>
          </div>
        )}
        {mutation.isError && (
          <p className="today-message alert" role="alert">
            {t(errorKey(mutation.error))}
          </p>
        )}
        {tasks.isPending ? (
          <p className="today-message quiet">{t("loading")}</p>
        ) : shownTasks.length === 0 ? (
          <p className="today-message quiet">{t("emptyTitle")}</p>
        ) : (
          <ul className="today-due-list">
            {shownTasks.map((task) => {
              const pending = task.id.startsWith("optimistic:");
              const worker = members.data?.find(
                (member) => member.id === task.workerId,
              );
              return (
                <li
                  className="today-due-row"
                  key={task.id}
                  data-testid="task-card"
                  data-status={task.status}
                >
                  <StatusGlyph status={task.status} />
                  <div className="today-task-copy">
                    {pending ? (
                      <span className="today-task-title" aria-busy="true">
                        {present(task)}
                      </span>
                    ) : (
                      <Link
                        className="today-task-title"
                        href={`/tasks/${task.id}`}
                        prefetch={false}
                      >
                        {present(task)}
                      </Link>
                    )}
                    <span className="today-task-meta">
                      {pending ? t("adding") : reference(task)} ·{" "}
                      {t(`status.${task.status}`)}
                    </span>
                  </div>
                  <div
                    className={`today-worker${worker?.kind === "agent" ? " today-worker-agent" : ""}`}
                  >
                    {worker?.kind === "agent" && (
                      <Sparkles
                        size={12}
                        strokeWidth={1.5}
                        aria-hidden="true"
                      />
                    )}
                    <label className="sr-only" htmlFor={`worker-${task.id}`}>
                      {t("worker")} · {present(task)}
                    </label>
                    <select
                      id={`worker-${task.id}`}
                      data-testid="assignment-select"
                      value={task.workerId ?? ""}
                      disabled={
                        pending ||
                        !access.data?.canCreateTasks ||
                        busy ||
                        !members.data
                      }
                      onChange={(event) =>
                        mutation.mutate({
                          id: task.id,
                          body: {
                            workerId: event.target.value || null,
                            version: task.version,
                          },
                        })
                      }
                    >
                      <option value="">{t("unassigned")}</option>
                      {(members.data ?? []).map((member) => (
                        <option key={member.id} value={member.id}>
                          {presentPrototypeField(
                            member.id,
                            "name",
                            member.name,
                            locale,
                          )}{" "}
                          · {t(member.kind)}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {hiddenCount > 0 && (
          <Button
            className="today-show-more button-quiet"
            data-testid="today-show-more"
            onClick={() => setShowAll(true)}
          >
            {t("showMore", { count: numbers.format(hiddenCount) })}
          </Button>
        )}
      </section>
    </div>
  );
}
