"use client";
import "../styles/calendar-parity.css";
import "temporal-polyfill/global";
import type { CalendarEvent } from "@schedule-x/calendar";
import {
  type CalendarScheduleInput,
  type CalendarViewData,
  type CreateTask,
  calendarWallToInstant,
  createTaskSchema,
  shiftCalendarSeries,
  type Task,
  type TaskCalendar,
  taskReference,
  taskSchema,
} from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { useCalendar, useSetCalendar } from "../lib/calendar-queries";
import { invalidateM3 } from "../lib/m3-queries";
import { useWorkspaceAccess } from "../lib/m5-queries";
import { m3MutationKey, snapshotM3 } from "../lib/optimistic-m3";
import { tasksKey, useMembers, useRuns } from "../lib/queries";
import { isCurrentSnapshot, restoreQueries } from "../lib/query-snapshot";
import { useWorkspace } from "./app-shell";
import {
  CalendarEngine,
  type CalendarEngineProps,
  type CalendarMode,
} from "./calendar-engine";
import { ScheduleEditor } from "./schedule-editor";
import { TaskRow } from "./task-row";
import { Button } from "./ui/button";

export function CalendarScene() {
  const { me, workspace } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const client = useQueryClient();
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const access = useWorkspaceAccess(workspace.id);
  const members = useMembers(workspace.id);
  const runs = useRuns(workspace.id);
  const today = Temporal.Now.zonedDateTimeISO(me.user.tz).toPlainDate();
  const [date, setDate] = useState(today.toString());
  const [view, setView] = useState<CalendarMode>("day");
  const [list, setList] = useState(false);
  const selected = Temporal.PlainDate.from(date);
  const first = view === "month-grid" ? selected.with({ day: 1 }) : selected;
  const start =
    view === "day" ? first : first.subtract({ days: first.dayOfWeek - 1 });
  const last =
    view === "month-grid"
      ? selected.with({ day: selected.daysInMonth })
      : start.add({ days: view === "week" ? 6 : 0 });
  const end =
    view === "month-grid"
      ? last.add({ days: 8 - last.dayOfWeek })
      : last.add({ days: 1 });
  // Same instant text as Today, so one day read serves both screens and the
  // persisted copy restores here as well.
  const dayStart = (day: Temporal.PlainDate) =>
    calendarWallToInstant(`${day.toString()}T00:00`, me.user.tz);
  const range = { from: dayStart(start), to: dayStart(end) };
  const data = useCalendar(workspace.id, range.from, range.to);
  const weekStart = selected.subtract({ days: selected.dayOfWeek - 1 });
  const weekData = useCalendar(
    workspace.id,
    dayStart(weekStart),
    dayStart(weekStart.add({ days: 7 })),
  );
  const update = useSetCalendar();
  const [editor, setEditor] = useState<{
    current?: TaskCalendar;
    startAt: string;
  }>();
  const [undo, setUndo] = useState<{
    current: TaskCalendar;
    schedule: CalendarScheduleInput | null;
  }>();
  const [localError, setLocalError] = useState(false);
  const create = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: async (body: CreateTask) =>
      taskSchema.parse(
        await request("/api/tasks", {
          method: "POST",
          body: JSON.stringify(createTaskSchema.parse(body)),
        }),
      ),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client, [tasksKey(workspace.id)]);
      const task: Task = {
        ...body,
        id: `optimistic:${crypto.randomUUID()}`,
        number: 0,
        dueAt: body.dueAt ?? null,
        description: body.description ?? "",
        priority: body.priority ?? 3,
        projectId: body.projectId ?? null,
        labels: body.labels ?? [],
        parentId: body.parentId ?? null,
        status: "todo",
        workerId: body.workerId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };
      client.setQueryData(tasksKey(workspace.id), (items: unknown[] = []) => [
        task,
        ...items,
      ]);
      client.setQueriesData<CalendarViewData>(
        { queryKey: ["calendar", workspace.id] },
        (current) =>
          current && body.calendar
            ? {
                ...current,
                occurrences: [
                  ...current.occurrences,
                  {
                    id: task.id,
                    task,
                    schedule: {
                      ...body.calendar,
                      taskId: task.id,
                      workspaceId: workspace.id,
                    },
                    startAt: body.calendar.startAt,
                    endAt: body.calendar.endAt,
                    canSchedule: false,
                    isAgent: false,
                  },
                ],
              }
            : current,
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (_, __, snapshot) => {
      if (isCurrentSnapshot(client, snapshot)) setEditor(undefined);
    },
    onSettled: () => invalidateM3(client),
  });
  const save = (
    current: TaskCalendar,
    schedule: CalendarScheduleInput | null,
  ) =>
    update.mutate({
      current,
      input: { version: current.task.version, schedule },
      onDone: (result) => {
        setUndo({
          current: result,
          schedule: current.schedule
            ? {
                startAt: current.schedule.startAt,
                endAt: current.schedule.endAt,
                timeZone: current.schedule.timeZone,
                rrule: current.schedule.rrule,
              }
            : null,
        });
        setEditor(undefined);
      },
    });
  const move = (event: CalendarEvent) => {
    const occurrence = data.data?.occurrences.find(
      (item) => item.id === event.occurrenceId,
    );
    if (
      !occurrence ||
      busy ||
      !occurrence.canSchedule ||
      !("toInstant" in event.start) ||
      !("toInstant" in event.end)
    )
      return;
    try {
      const schedule = shiftCalendarSeries(
        occurrence.schedule,
        occurrence.startAt,
        event.start.toInstant().toString(),
        event.end.toInstant().toString(),
      );
      setLocalError(false);
      save(occurrence, schedule);
    } catch {
      setLocalError(true);
      void invalidateM3(client);
    }
  };
  const agentState = (task: Task) => {
    const run = runs.data
      ?.filter((item) => item.taskId === task.id)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    return t(run ? `run.status.${run.status}` : `status.${task.status}`);
  };
  const events: CalendarEvent[] = (data.data?.occurrences ?? []).map(
    (item) => ({
      id: `occurrence-${item.task.id.replaceAll(":", "-")}-${Date.parse(item.startAt)}`,
      occurrenceId: item.id,
      title: item.task.title,
      isAgent: item.isAgent,
      location: item.isAgent ? agentState(item.task) : undefined,
      timeLabel: new Intl.DateTimeFormat(locale, {
        timeZone: me.user.tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(item.startAt)),
      start: Temporal.Instant.from(item.startAt).toZonedDateTimeISO(me.user.tz),
      end: Temporal.Instant.from(item.endAt).toZonedDateTimeISO(me.user.tz),
      _options: {
        disableDND: busy || !item.canSchedule,
        disableResize: busy || !item.canSchedule,
        additionalClasses: [
          `taff-event-${item.task.status}`,
          ...(item.isAgent ? ["taff-agent-event"] : []),
        ],
      },
    }),
  );
  const hasAgents = data.data?.occurrences.some((item) => item.isAgent);
  const showEditor = (
    current?: TaskCalendar,
    startAt = selected
      .toZonedDateTime({ timeZone: me.user.tz, plainTime: "09:00" })
      .toInstant()
      .toString(),
  ) => {
    update.reset();
    create.reset();
    setLocalError(false);
    setEditor({ current, startAt });
  };
  const step = (direction: number) =>
    setDate(
      selected
        .add(
          view === "month-grid"
            ? { months: direction }
            : { days: direction * (view === "week" ? 7 : 1) },
        )
        .toString(),
    );
  const engineProps: CalendarEngineProps = {
    locale,
    timeZone: me.user.tz,
    date,
    view,
    events,
    onDate: setDate,
    onSelect: (id) => {
      const item = data.data?.occurrences.find((value) => value.id === id);
      if (item && !id.startsWith("optimistic:")) showEditor(item);
    },
    onSlot: (startAt) => {
      if (access.data?.canCreateTasks && !busy) showEditor(undefined, startAt);
    },
    onMove: move,
    canMove: (id) =>
      !busy &&
      !!data.data?.occurrences.find((item) => item.id === id)?.canSchedule,
  };
  return (
    <div className="calendar-scene" data-testid="calendar-scene">
      <header className="calendar-source-header">
        <h1 className="sr-only">{t("calendar.title")}</h1>
        <div className="calendar-source-navigation">
          <p className="calendar-month-title">
            {selected.toLocaleString(locale, {
              month: "long",
              year: "numeric",
            })}
          </p>
          <Button
            className="button-quiet"
            aria-label={t("calendar.previous")}
            data-testid="calendar-previous"
            onClick={() => step(-1)}
          >
            <ChevronLeft size={18} strokeWidth={1.5} aria-hidden="true" />
          </Button>
          <Button
            className="button-quiet"
            aria-label={t("calendar.next")}
            data-testid="calendar-next"
            onClick={() => step(1)}
          >
            <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </div>
        <div
          className="calendar-source-mode"
          role="group"
          aria-label={t("calendar.selectView")}
        >
          {(["day", "week", "month-grid"] as const).map((mode) => (
            <Button
              key={mode}
              className="button-quiet"
              aria-pressed={view === mode && !list}
              data-testid={`calendar-${mode}`}
              onClick={() => {
                setView(mode);
                setList(false);
              }}
            >
              {t(`calendar.${mode === "month-grid" ? "month" : mode}`)}
            </Button>
          ))}
        </div>
      </header>
      <details className="calendar-source-tools">
        <summary aria-label={t("calendar.tools")} data-testid="calendar-tools">
          <GripVertical size={12} strokeWidth={1.5} aria-hidden="true" />
          <span>{t("calendar.dragHint")}</span>
          <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
        </summary>
        <div className="calendar-source-tool-actions">
          <Button
            className="button-quiet"
            onClick={() => setDate(today.toString())}
          >
            {t("calendar.today")}
          </Button>
          <Button
            className="button-quiet"
            aria-pressed={list}
            data-testid="calendar-list"
            onClick={() => setList(!list)}
          >
            {t("calendar.list")}
          </Button>
          <Button
            className="button-quiet"
            data-testid="calendar-create"
            disabled={busy || !access.data?.canCreateTasks}
            onClick={() => showEditor()}
          >
            {t("calendar.create")}
          </Button>
        </div>
      </details>
      {view !== "month-grid" && (
        <div
          className={`calendar-source-strip${view === "week" ? " calendar-source-week-strip" : ""}`}
        >
          {Array.from({ length: 7 }, (_, index) => {
            const day = weekStart.add({ days: index });
            const from = day.toZonedDateTime(me.user.tz).epochMilliseconds;
            const to = day
              .add({ days: 1 })
              .toZonedDateTime(me.user.tz).epochMilliseconds;
            const scheduled = weekData.data?.occurrences.some(
              (item) =>
                Date.parse(item.startAt) < to && Date.parse(item.endAt) > from,
            );
            return (
              <button
                key={day.toString()}
                type="button"
                aria-pressed={day.toString() === date}
                onClick={() => {
                  setDate(day.toString());
                  if (view === "week") setView("day");
                }}
              >
                <span>{day.toLocaleString(locale, { weekday: "short" })}</span>
                <strong>{day.day}</strong>
                <span
                  className={`calendar-source-day-dot${scheduled ? " has-events" : ""}`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      )}
      {!!data.data?.unscheduled.length && (
        <section
          className="calendar-source-tray"
          aria-label={t("calendar.unscheduled")}
        >
          <h2>
            {t("calendar.unscheduled")}{" "}
            <span>{data.data.unscheduled.length}</span>
          </h2>
          {data.data.unscheduled.map((item) => (
            <Button
              key={item.task.id}
              className="button-quiet"
              data-testid={`schedule-task-${item.task.id}`}
              disabled={busy || !item.canSchedule}
              onClick={() => showEditor(item)}
            >
              <span>{taskReference(workspace.key, item.task.number)}</span>
              {item.task.title}
            </Button>
          ))}
        </section>
      )}
      {data.isPending && (
        <p className="loading" aria-live="polite">
          {t("loading")}
        </p>
      )}
      {(data.error ||
        weekData.error ||
        runs.error ||
        update.error ||
        create.error ||
        members.error ||
        localError) && (
        <p className="alert" role="alert">
          {localError
            ? t("calendar.invalid")
            : t(
                errorKey(
                  data.error ??
                    weekData.error ??
                    runs.error ??
                    update.error ??
                    create.error ??
                    members.error,
                ),
              )}
          {(data.error || weekData.error || runs.error || members.error) && (
            <Button
              type="button"
              disabled={
                members.isFetching ||
                data.isFetching ||
                weekData.isFetching ||
                runs.isFetching
              }
              onClick={() => {
                void members.refetch();
                void data.refetch();
                void weekData.refetch();
                void runs.refetch();
              }}
            >
              {t("retry")}
            </Button>
          )}
        </p>
      )}
      {data.data?.truncated && (
        <p className="alert" role="status">
          {t("calendar.truncated")}
        </p>
      )}
      {undo && (
        <div className="calendar-undo" role="status">
          <span>{t("calendar.saved")}</span>
          <Button
            className="button-quiet"
            data-testid="calendar-undo"
            disabled={
              busy ||
              !(
                [
                  ...(data.data?.occurrences ?? []),
                  ...(data.data?.unscheduled ?? []),
                ].find((item) => item.task.id === undo.current.task.id)
                  ?.canSchedule ?? undo.current.canSchedule
              )
            }
            onClick={() => {
              update.mutate({
                current: undo.current,
                input: {
                  version: undo.current.task.version,
                  schedule: undo.schedule,
                },
                onDone: () => setUndo(undefined),
              });
            }}
          >
            {t("calendar.undo")}
          </Button>
        </div>
      )}
      {list ? (
        <section>
          {data.data?.occurrences.map((item) => (
            <div key={item.id} className="calendar-list-item">
              <Button className="button-quiet" onClick={() => showEditor(item)}>
                {new Intl.DateTimeFormat(locale, {
                  timeZone: me.user.tz,
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(item.startAt))}
              </Button>
              <ul className="task-list">
                <TaskRow task={item.task} />
              </ul>
            </div>
          ))}
        </section>
      ) : (
        <div
          className={
            hasAgents && view === "day" ? "calendar-with-agent-rail" : ""
          }
        >
          {hasAgents && view === "day" && (
            <div
              className="calendar-agent-label"
              title={t("calendar.agentHint")}
            >
              <Sparkles size={14} aria-hidden="true" />
              {t("calendar.agentLane")}
            </div>
          )}
          {hasAgents && view === "day" ? (
            <div className="calendar-day-lanes">
              <CalendarEngine
                key={`human:${workspace.id}:${locale}:${me.user.tz}`}
                {...engineProps}
                events={events.filter((event) => !event.isAgent)}
              />
              <CalendarEngine
                key={`agent:${workspace.id}:${locale}:${me.user.tz}`}
                {...engineProps}
                agentLane
                events={events.filter((event) => event.isAgent)}
                onSlot={() => {}}
              />
            </div>
          ) : (
            <CalendarEngine
              key={`${workspace.id}:${locale}:${me.user.tz}`}
              {...engineProps}
            />
          )}
        </div>
      )}
      {editor && (
        <ScheduleEditor
          key={editor.current?.task.id ?? editor.startAt}
          current={
            editor.current
              ? {
                  ...editor.current,
                  canSchedule:
                    [
                      ...(data.data?.occurrences ?? []),
                      ...(data.data?.unscheduled ?? []),
                    ].find((item) => item.task.id === editor.current?.task.id)
                      ?.canSchedule ?? false,
                }
              : undefined
          }
          startAt={editor.startAt}
          timeZone={me.user.tz}
          busy={busy || members.isPending}
          canSave={
            members.isSuccess &&
            !!members.data &&
            (editor.current ? true : (access.data?.canCreateTasks ?? false))
          }
          error={
            update.error || create.error || members.error
              ? t(errorKey(update.error ?? create.error ?? members.error))
              : undefined
          }
          onRetry={
            members.error
              ? () => {
                  void members.refetch();
                }
              : undefined
          }
          onClose={() => setEditor(undefined)}
          onSave={(schedule, title) => {
            if (editor.current) save(editor.current, schedule);
            else {
              create.mutate({
                workspaceId: workspace.id,
                ownerId: workspace.memberId,
                workerId: null,
                title,
                calendar: schedule,
              });
            }
          }}
          onClear={
            editor.current ? () => save(editor.current!, null) : undefined
          }
        />
      )}
    </div>
  );
}
