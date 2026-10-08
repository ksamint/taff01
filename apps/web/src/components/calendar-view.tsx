"use client";

import type { Task } from "@taff/schemas";
import { useTranslation } from "react-i18next";
import { useTasks } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { TaskRow } from "./task-row";

const DAY_MS = 86_400_000;

export function weekSchedule(
  tasks: Task[],
  timeZone: string,
  locale: string,
  now = new Date(),
): { key: string; label: string; tasks: Task[] }[] {
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayLabel = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(now.getTime() + offset * DAY_MS);
    return {
      key: dayKey.format(date),
      label: dayLabel.format(date),
      tasks: [] as Task[],
    };
  });
  for (const task of tasks) {
    if (!task.dueAt || task.status === "done") continue;
    const key = dayKey.format(new Date(task.dueAt));
    days.find((day) => day.key === key)?.tasks.push(task);
  }
  for (const day of days)
    day.tasks.sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""));
  return days;
}

export function CalendarView() {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const tasks = useTasks(workspace.id);
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const days = weekSchedule(tasks.data ?? [], me.user.tz, locale);
  const unscheduled = (tasks.data ?? []).filter(
    (task) => !task.dueAt && task.status !== "done",
  );
  const scheduled = days.reduce((sum, day) => sum + day.tasks.length, 0);
  return (
    <>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("calendar.title")}</h1>
        <p className="task-count">{t("calendar.hint")}</p>
      </section>
      {tasks.isPending ? (
        <p className="loading" aria-live="polite">
          {t("loading")}
        </p>
      ) : scheduled === 0 ? (
        <div className="empty-state">
          <h3>{t("calendar.empty")}</h3>
        </div>
      ) : (
        <div className="schedule">
          {days
            .filter((day) => day.tasks.length)
            .map((day) => (
              <section key={day.key} className="schedule-day">
                <h2>
                  {day.label}
                  <span>{day.tasks.length}</span>
                </h2>
                <ul className="task-list">
                  {day.tasks.map((task) => (
                    <TaskRow key={task.id} task={task} showTime />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
      {unscheduled.length > 0 && (
        <section className="schedule-day" style={{ marginTop: 24 }}>
          <h2>
            {t("calendar.unscheduled")}
            <span>{unscheduled.length}</span>
          </h2>
          <ul className="task-list">
            {unscheduled.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
