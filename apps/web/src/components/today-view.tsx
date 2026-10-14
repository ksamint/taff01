"use client";
import { type Locale, taskReference } from "@taff/schemas";

import type { Task } from "@taff/schemas/base";
import {
  type CalendarOccurrence,
  calendarCivilTime,
  calendarWallToInstant,
} from "@taff/schemas/calendar-read";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useAssignTodayTask } from "../lib/mutations/today";
import { needsYouItems } from "../lib/needs-you";
import { m3MutationKey } from "../lib/optimistic-m3";
import {
  useInbox,
  useMembers,
  useRuns,
  useTasks,
  useWorkspaceAccess,
} from "../lib/queries";
import { currentSession } from "../lib/session-cache";
import { todayTasks } from "../lib/today";
import { useWorkspace } from "./app-shell";
import { useInitialTodayTime } from "./providers";
import { Button } from "./ui/button";
import { StatusGlyph } from "./ui/status-glyph";

const TODAY_PAGE = 20;
/** Agent runs shown on Today before it points to Projects. */
const TODAY_RUNS = 6;

// Prototype v2 Today (lines 83–139, desktop 1359–1404): agents at work,
// 待你處理 with the one needs-you count, and what is due today.
export function TodayView({ initialNow }: { initialNow: number }) {
  const { me, workspace, openSearch } = useWorkspace();
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const members = useMembers(workspace.id);
  const access = useWorkspaceAccess(workspace.id);
  const tasks = useTasks(workspace.id);
  const runs = useRuns(workspace.id);
  const inbox = useInbox(workspace.id);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const serverNow = useInitialTodayTime();
  const [now, setNow] = useState(
    () =>
      new Date(
        currentSession(client)?.confirmed === false
          ? (serverNow ?? initialNow)
          : initialNow,
      ),
  );
  // Only the real wall clock advances here; agent state comes from the API.
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const localDate = calendarCivilTime(now, me.user.tz)
    .toISOString()
    .slice(0, 10);
  const mutation = useAssignTodayTask();
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
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
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
  const present = (task: Task) => task.title;
  const memberName = (id: string | null) => {
    const member = members.data?.find((item) => item.id === id);
    return member ? member.name : t("unknownMember");
  };
  const activeRuns = (runs.data ?? []).filter((run) =>
    ["running", "paused", "changes_requested"].includes(run.status),
  );
  const needs = needsYouItems(inbox.data);
  const readError = tasks.error ?? members.error ?? access.error;
  const reference = (task: Task) => taskReference(workspace.key, task.number);
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
        className="today-agents"
        aria-labelledby="today-agents-heading"
        hidden={activeRuns.length === 0}
      >
        <h2 className="today-card-label" id="today-agents-heading">
          {t("agentsAtWork")}
        </h2>
        {runs.error && (
          <div className="today-message alert" role="alert">
            <p>{t(errorKey(runs.error))}</p>
            <Button
              className="button-quiet"
              onClick={() => void runs.refetch()}
            >
              {t("retry")}
            </Button>
          </div>
        )}
        <ul className="today-agent-list">
          {activeRuns.slice(0, TODAY_RUNS).map((run) => {
            const task = tasks.data?.find((item) => item.id === run.taskId);
            return (
              <li key={run.id}>
                <Link
                  className="today-agent-row"
                  href={`/tasks/${run.taskId}`}
                  prefetch={false}
                  data-testid="today-agent-work"
                >
                  <span className="today-agent-mark" aria-hidden="true">
                    <Sparkles size={16} strokeWidth={1.5} />
                  </span>
                  <span className="today-agent-copy">
                    <span className="today-agent-name">
                      {memberName(run.agentId)}
                      <span
                        className={`today-agent-state today-agent-${run.status}`}
                      >
                        {t(`run.status.${run.status}`)}
                      </span>
                    </span>
                    <span className="today-agent-task">
                      {task
                        ? `${reference(task)} ${present(task)}`
                        : t("agentProfile.task")}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {activeRuns.length > TODAY_RUNS && (
          <p className="today-message quiet">
            <Link href="/projects">
              {t("moreAgentWork", {
                count: numbers.format(activeRuns.length - TODAY_RUNS),
              })}
            </Link>
          </p>
        )}
      </section>
      <section
        className="today-needs"
        aria-labelledby="today-needs-heading"
        hidden={needs.length === 0}
      >
        <div className="today-needs-header">
          <h2 className="today-section-label" id="today-needs-heading">
            {t("todayNeeds.title")}
            <span className="today-needs-count" data-testid="today-needs-count">
              {numbers.format(needs.length)}
            </span>
          </h2>
          <Link className="today-view-all" href="/inbox" prefetch={false}>
            {t("todayNeeds.viewAll")}
            <ChevronRight size={14} strokeWidth={1.5} aria-hidden="true" />
          </Link>
        </div>
        <ul className="today-needs-list">
          {needs.slice(0, 3).map((item) => {
            const task = tasks.data?.find((entry) => entry.id === item.taskId);
            return (
              <li key={item.id}>
                <Link
                  className="today-needs-row"
                  href={item.taskId ? `/tasks/${item.taskId}` : "/inbox"}
                  prefetch={false}
                  data-testid="today-needs-item"
                >
                  <span className="today-needs-copy">
                    <span className="today-needs-title">
                      {task && (
                        <span className="today-needs-ref">
                          {reference(task)}
                        </span>
                      )}
                      {task ? present(task) : item.title}
                    </span>
                    <span className="today-needs-meta">
                      {t(
                        item.kind === "review"
                          ? "todayNeeds.requestsConfirmation"
                          : "todayNeeds.blockedBy",
                        { name: memberName(item.agentId) },
                      )}{" "}
                      · {time.format(new Date(item.createdAt))}
                    </span>
                  </span>
                  <span
                    className={`today-needs-badge today-needs-${item.kind}`}
                  >
                    {t(
                      item.kind === "review"
                        ? "todayNeeds.badgeReview"
                        : "todayNeeds.badgeBlocker",
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
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
                    <span className="today-worker-label" aria-hidden="true">
                      {worker?.kind === "agent" && (
                        <Sparkles size={12} strokeWidth={1.5} />
                      )}
                      <span>{worker ? worker.name : t("unassigned")}</span>
                    </span>
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
                          {member.name} · {t(member.kind)}
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
