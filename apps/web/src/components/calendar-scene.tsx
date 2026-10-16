"use client";
import "temporal-polyfill/global";
import "@schedule-x/theme-default/dist/index.css";
import "../styles/calendar.css";
import type { CalendarEvent } from "@schedule-x/calendar";
import {
  type CalendarScheduleInput,
  calendarWallToInstant,
  shiftCalendarSeries,
  type Task,
  type TaskCalendar,
  taskReference,
} from "@taff/schemas";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Sparkles,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useCalendar, useSetCalendar } from "../lib/calendar-queries";
import { invalidateM3 } from "../lib/m3-queries";
import { useWorkspaceAccess } from "../lib/m5-queries";
import { useCreateCalendarTask } from "../lib/mutations/calendar";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useMembers, useRuns } from "../lib/queries";
import { showToast } from "../lib/toast";
import { useWorkspace } from "./app-shell";
import {
  CalendarEngine,
  type CalendarEngineProps,
  type CalendarMode,
} from "./calendar-engine";
import { useInitialTodayTime } from "./providers";
import { RouteLoading } from "./route-loading";

const ScheduleEditor = dynamic(
  () => import("./schedule-editor").then((module) => module.ScheduleEditor),
  { ssr: false, loading: RouteLoading },
);

import { TaskRow } from "./task-row";
import { Button } from "./ui/button";

const DESKTOP = "(min-width: 1024px)";
const subscribeDesktop = (listener: () => void) => {
  const media = window.matchMedia(DESKTOP);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const readDesktop = () => window.matchMedia(DESKTOP).matches;
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

type Gesture = { previousStart: string; startAt: string; endAt: string };
type Undo = {
  current: TaskCalendar;
  schedule: CalendarScheduleInput | null;
};

// Prototype v2 Calendar: phone 141–247 (Schedule-X keeps the gestures),
// desktop header 1221–1238 and grid 1405–1442 with the tray on the side.
export function CalendarScene() {
  const { me, workspace, openQuick, confirmed } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    readDesktop,
    () => false,
  );
  const client = useQueryClient();
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const access = useWorkspaceAccess(workspace.id);
  const members = useMembers(workspace.id);
  const runs = useRuns(workspace.id);
  const serverNow = useInitialTodayTime();
  const now = confirmed
    ? Temporal.Now.instant()
    : Temporal.Instant.fromEpochMilliseconds(serverNow ?? Date.now());
  const today = now.toZonedDateTimeISO(me.user.tz).toPlainDate();
  const [date, setDate] = useState(today.toString());
  const [view, setView] = useState<CalendarMode>("day");
  const [list, setList] = useState(false);
  const selected = useMemo(() => Temporal.PlainDate.from(date), [date]);
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
  const [undo, setUndo] = useState<Undo>();
  const [localError, setLocalError] = useState(false);
  const create = useCreateCalendarTask(workspace.id, {
    onCreated: () => setEditor(undefined),
  });
  const clock = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: me.user.tz,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    [locale, me.user.tz],
  );
  const dayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeZone: me.user.tz,
        month: "short",
        day: "numeric",
        weekday: "short",
      }),
    [locale, me.user.tz],
  );
  // Undo is the inverse API call with the returned version (plan §2.4).
  const revert = (entry: Undo) =>
    update.mutate({
      current: entry.current,
      input: { version: entry.current.task.version, schedule: entry.schedule },
      onDone: () => setUndo((value) => (value === entry ? undefined : value)),
    });
  // Toast copy of prototype 2533/2538; editor saves keep the plain notice.
  const toastText = (gesture?: Gesture) => {
    if (!gesture) return t("calendar.saved");
    const startAt = new Date(gesture.startAt);
    const endAt = new Date(gesture.endAt);
    return gesture.startAt === gesture.previousStart
      ? t("calendar.toast.durationSet", {
          start: clock.format(startAt),
          end: clock.format(endAt),
        })
      : t("calendar.toast.moved", {
          date: dayLabel.format(startAt),
          time: clock.format(startAt),
        });
  };
  const save = (
    current: TaskCalendar,
    schedule: CalendarScheduleInput | null,
    gesture?: Gesture,
  ) =>
    update.mutate({
      current,
      input: { version: current.task.version, schedule },
      onDone: (result) => {
        const entry: Undo = {
          current: result,
          schedule: current.schedule
            ? {
                startAt: current.schedule.startAt,
                endAt: current.schedule.endAt,
                timeZone: current.schedule.timeZone,
                rrule: current.schedule.rrule,
              }
            : null,
        };
        setUndo(entry);
        setEditor(undefined);
        showToast(toastText(gesture), {
          label: t("calendar.undo"),
          run: () => {
            if (client.isMutating({ mutationKey: m3MutationKey }) === 0)
              revert(entry);
          },
        });
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
      const gesture: Gesture = {
        previousStart: Temporal.Instant.from(occurrence.startAt).toString(),
        startAt: event.start.toInstant().toString(),
        endAt: event.end.toInstant().toString(),
      };
      const schedule = shiftCalendarSeries(
        occurrence.schedule,
        occurrence.startAt,
        gesture.startAt,
        gesture.endAt,
      );
      setLocalError(false);
      save(occurrence, schedule, gesture);
    } catch {
      setLocalError(true);
      void invalidateM3(client);
    }
  };
  const agentState = useCallback(
    (task: Task) => {
      const run = runs.data
        ?.filter((item) => item.taskId === task.id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
      return t(run ? `run.status.${run.status}` : `status.${task.status}`);
    },
    [runs.data, t],
  );
  const events: CalendarEvent[] = useMemo(
    () =>
      (data.data?.occurrences ?? []).map((item) => ({
        id: `occurrence-${item.task.id.replaceAll(":", "-")}-${Date.parse(item.startAt)}`,
        occurrenceId: item.id,
        title: item.task.title,
        isAgent: item.isAgent,
        start: Temporal.Instant.from(item.startAt).toZonedDateTimeISO(
          me.user.tz,
        ),
        end: Temporal.Instant.from(item.endAt).toZonedDateTimeISO(me.user.tz),
        // Prototype event block: title, then the 24-hour range (and the
        // agent's state); the SDK keeps its own event element and handles.
        _customContent: {
          timeGrid: `<span class="calendar-event-title">${escapeHtml(item.task.title)}</span><span class="calendar-event-time">${clock.format(new Date(item.startAt))}–${clock.format(new Date(item.endAt))}</span>${item.isAgent ? `<span class="calendar-event-time">${escapeHtml(agentState(item.task))}</span>` : ""}`,
        },
        _options: {
          disableDND: busy || !item.canSchedule,
          disableResize: busy || !item.canSchedule,
          additionalClasses: [
            `taff-event-${item.task.status}`,
            ...(item.isAgent ? ["taff-agent-event"] : []),
          ],
        },
      })),
    [data.data?.occurrences, me.user.tz, clock, agentState, busy],
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
    desktop,
    events,
    onDate: setDate,
    onSelect: (id) => {
      const item = data.data?.occurrences.find((value) => value.id === id);
      if (item && !id.startsWith("optimistic:")) showEditor(item);
    },
    // Click-to-create on an empty slot (phone and desktop, prototype 2891).
    onSlot: (startAt) => {
      if (access.data?.canCreateTasks && !busy) showEditor(undefined, startAt);
    },
    onMove: move,
    canMove: (id) =>
      !busy &&
      !!data.data?.occurrences.find((item) => item.id === id)?.canSchedule,
  };
  const periodTitle = useMemo(
    () =>
      desktop && view === "day"
        ? selected.toLocaleString(locale, {
            month: "long",
            day: "numeric",
            weekday: "short",
          })
        : selected.toLocaleString(
            locale,
            view === "month-grid" || desktop
              ? { month: "long", year: "numeric" }
              : { month: "long" },
          ),
    [desktop, view, selected, locale],
  );
  const navigation = (
    <div className="calendar-source-navigation">
      <p className="calendar-month-title" aria-live="polite">
        {periodTitle}
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
  );
  const todayButton = (className: string) => (
    <Button
      className={className}
      data-testid="calendar-today"
      onClick={() => setDate(today.toString())}
    >
      {t("calendar.today")}
    </Button>
  );
  const modes = (
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
  );
  const listToggle = (
    <Button
      className="button-quiet"
      aria-pressed={list}
      data-testid="calendar-list"
      onClick={() => setList(!list)}
    >
      {t("calendar.list")}
    </Button>
  );
  const createButton = (
    <Button
      className="button-quiet"
      data-testid="calendar-create"
      disabled={busy || !access.data?.canCreateTasks}
      onClick={() => showEditor()}
    >
      {t("calendar.create")}
    </Button>
  );
  const scheduledOn = (day: Temporal.PlainDate) => {
    const from = day.toZonedDateTime(me.user.tz).epochMilliseconds;
    const to = day
      .add({ days: 1 })
      .toZonedDateTime(me.user.tz).epochMilliseconds;
    return weekData.data?.occurrences.some(
      (item) => Date.parse(item.startAt) < to && Date.parse(item.endAt) > from,
    );
  };
  const strip = (
    <div
      className={`calendar-source-strip${view === "week" ? " calendar-source-week-strip" : ""}`}
    >
      {Array.from({ length: 7 }, (_, index) => {
        const day = weekStart.add({ days: index });
        return (
          <button
            key={day.toString()}
            type="button"
            aria-pressed={day.toString() === date}
            aria-label={day.toLocaleString(locale, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            onClick={() => {
              setDate(day.toString());
              if (view === "week") setView("day");
            }}
          >
            <span aria-hidden="true">
              {day.toLocaleString(locale, { weekday: "narrow" })}
            </span>
            <strong aria-hidden="true">{day.day}</strong>
            <span
              className={`calendar-source-day-dot${scheduledOn(day) ? " has-events" : ""}`}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
  // Desktop column heads (prototype 1408): 週一 5 … one per grid column.
  const deskDays = (
    <div
      className={`calendar-desk-days calendar-desk-days-${view === "week" ? 7 : 1}`}
    >
      <span aria-hidden="true" />
      {Array.from({ length: view === "week" ? 7 : 1 }, (_, index) => {
        const day = view === "week" ? weekStart.add({ days: index }) : selected;
        return (
          <button
            key={day.toString()}
            type="button"
            aria-pressed={day.equals(today)}
            aria-label={day.toLocaleString(locale, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            onClick={() => {
              setDate(day.toString());
              setView("day");
            }}
          >
            <span aria-hidden="true">
              {day.toLocaleString(locale, { weekday: "short" })}
            </span>
            <strong aria-hidden="true">{day.day}</strong>
          </button>
        );
      })}
    </div>
  );
  const tray = !!data.data?.unscheduled.length && (
    <section
      className="calendar-source-tray"
      aria-label={t("calendar.unscheduled")}
    >
      <h2>
        {t("calendar.unscheduled")} ·{" "}
        <span>{data.data.unscheduled.length}</span>
      </h2>
      <div className="calendar-source-tray-items">
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
      </div>
    </section>
  );
  const notices = (
    <>
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
            onClick={() => revert(undo)}
          >
            {t("calendar.undo")}
          </Button>
        </div>
      )}
    </>
  );
  const stage = list ? (
    <section className="calendar-list">
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
      className={`calendar-stage${hasAgents && view === "day" ? " calendar-with-agent-rail" : ""}`}
    >
      {hasAgents && view === "day" && (
        <div className="calendar-agent-label" title={t("calendar.agentHint")}>
          <Sparkles size={14} strokeWidth={1.5} aria-hidden="true" />
          {t("calendar.agentLane")}
        </div>
      )}
      {hasAgents && view === "day" ? (
        <div className="calendar-day-lanes">
          <CalendarEngine
            key={`human:${workspace.id}:${locale}:${me.user.tz}:${desktop}`}
            {...engineProps}
            events={events.filter((event) => !event.isAgent)}
          />
          <CalendarEngine
            key={`agent:${workspace.id}:${locale}:${me.user.tz}:${desktop}`}
            {...engineProps}
            agentLane
            events={events.filter((event) => event.isAgent)}
            onSlot={() => {}}
          />
        </div>
      ) : (
        <CalendarEngine
          key={`${workspace.id}:${locale}:${me.user.tz}:${desktop}`}
          {...engineProps}
        />
      )}
    </div>
  );
  return (
    <div
      className={`calendar-scene ${desktop ? "calendar-desktop" : "calendar-phone"}`}
      data-testid="calendar-scene"
    >
      {desktop ? (
        <>
          <header className="calendar-desk-header">
            <h1 className="sr-only">{t("calendar.title")}</h1>
            {navigation}
            {todayButton("calendar-today")}
            <span className="calendar-desk-spacer" />
            {modes}
            <Button
              className="button-primary calendar-new-task"
              data-testid="desktop-new-task"
              onClick={openQuick}
            >
              <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
              {t("quickAdd.newTask")}
            </Button>
          </header>
          <div className="calendar-desk-body">
            <div className="calendar-desk-main">
              {!list && view !== "month-grid" && deskDays}
              {stage}
            </div>
            <aside
              className="calendar-desk-side"
              aria-label={t("calendar.tools")}
            >
              {notices}
              {tray || (
                <p className="calendar-desk-empty">{t("calendar.emptyTray")}</p>
              )}
              <div className="calendar-desk-tools">
                <p>
                  <GripVertical
                    size={12}
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  {t("calendar.dragHint")}
                </p>
                <p>{t("calendar.keyboardHint")}</p>
                {listToggle}
                {createButton}
              </div>
            </aside>
          </div>
        </>
      ) : (
        <>
          <header className="calendar-source-header">
            <h1 className="sr-only">{t("calendar.title")}</h1>
            {navigation}
            {modes}
          </header>
          <details className="calendar-source-tools">
            <summary
              aria-label={t("calendar.tools")}
              data-testid="calendar-tools"
            >
              <GripVertical size={12} strokeWidth={1.5} aria-hidden="true" />
              <span>{t("calendar.dragHint")}</span>
              <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
            </summary>
            <div className="calendar-source-tool-actions">
              <p>{t("calendar.keyboardHint")}</p>
              {todayButton("button-quiet")}
              {listToggle}
              {createButton}
            </div>
          </details>
          {view !== "month-grid" && strip}
          {tray}
          {notices}
          {stage}
        </>
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
