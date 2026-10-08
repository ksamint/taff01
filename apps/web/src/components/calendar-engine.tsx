"use client";
import "temporal-polyfill/global";
import "@schedule-x/theme-default/dist/index.css";
import {
  type CalendarEvent,
  createViewDay,
  createViewMonthGrid,
  createViewWeek,
} from "@schedule-x/calendar";
import { createCalendarControlsPlugin } from "@schedule-x/calendar-controls";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import { ScheduleXCalendar, useCalendarApp } from "@schedule-x/react";
import { createResizePlugin } from "@schedule-x/resize";
import { enUS, zhCN, zhTW } from "@schedule-x/translations";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { createCalendarDragPlugin } from "../lib/calendar-plugins";
import "./calendar.css";

export type CalendarMode = "day" | "week" | "month-grid";
export interface CalendarEngineProps {
  agentLane?: boolean;
  locale: string;
  timeZone: string;
  date: string;
  view: CalendarMode;
  events: CalendarEvent[];
  onDate: (date: string) => void;
  onSelect: (id: string) => void;
  onSlot: (startAt: string) => void;
  onMove: (event: CalendarEvent) => void;
  canMove: (id: string) => boolean;
}
export function CalendarEngine(props: CalendarEngineProps) {
  const { t } = useTranslation();
  const latest = useRef(props);
  latest.current = props;
  const cancelled = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const monthDrag = useRef<{
    pointerId: number;
    event: CalendarEvent;
    x: number;
    y: number;
    moved: boolean;
  }>(undefined);
  const [preview, setPreview] = useState<{
    title: string;
    x: number;
    y: number;
  }>();
  const [plugins] = useState(() => ({
    controls: createCalendarControlsPlugin(),
    events: createEventsServicePlugin(),
    drag: createCalendarDragPlugin(),
    resize: createResizePlugin(15),
  }));
  const [ready, setReady] = useState(false);
  const app = useCalendarApp(
    {
      views: [createViewDay(), createViewWeek(), createViewMonthGrid()],
      defaultView: props.view,
      selectedDate: Temporal.PlainDate.from(props.date),
      timezone: props.timeZone,
      locale:
        props.locale === "en"
          ? "en-US"
          : props.locale === "zh-HK"
            ? "zh-HK"
            : "zh-CN",
      translations: {
        enUS,
        zhCN,
        zhHK: {
          ...zhTW,
          "Select View": t("calendar.selectView"),
          "No events": t("calendar.noEvents"),
        },
      },
      isResponsive: false,
      firstDayOfWeek: 1,
      dayBoundaries: { start: "00:00", end: "24:00" },
      weekOptions: {
        gridHeight: 1344,
        gridStep: 30,
        eventWidth: 96,
        timeAxisFormatOptions: {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        },
      },
      monthGridOptions: { nEventsPerDay: 2 },
      events: props.events,
      callbacks: {
        onRender: () => setReady(true),
        onSelectedDateUpdate: (date) => latest.current.onDate(date.toString()),
        onClickPlusEvents: (date) => latest.current.onDate(date.toString()),
        onEventClick: (event) =>
          latest.current.onSelect(String(event.occurrenceId)),
        onClickDateTime: (date) =>
          latest.current.onSlot(
            date
              .round({
                smallestUnit: "minute",
                roundingIncrement: 30,
                roundingMode: "floor",
              })
              .toInstant()
              .toString(),
          ),
        onClickDate: (date) =>
          latest.current.onSlot(
            date
              .toZonedDateTime({
                timeZone: latest.current.timeZone,
                plainTime: "09:00",
              })
              .toInstant()
              .toString(),
          ),
        onBeforeEventUpdate: (old, next) =>
          !cancelled.current &&
          latest.current.canMove(String(old.occurrenceId)) &&
          (old.start.toString() !== next.start.toString() ||
            old.end.toString() !== next.end.toString()),
        onEventUpdate: (event) => latest.current.onMove(event),
      },
    },
    [plugins.controls, plugins.events, plugins.drag, plugins.resize],
  );
  useEffect(() => {
    if (ready) plugins.events.set(props.events);
  }, [ready, plugins.events, props.events]);
  useEffect(() => {
    if (!ready) return;
    if (plugins.controls.getView() !== props.view)
      plugins.controls.setView(props.view);
    if (plugins.controls.getDate().toString() !== props.date)
      plugins.controls.setDate(Temporal.PlainDate.from(props.date));
  }, [ready, plugins.controls, props.date, props.view]);
  useEffect(() => {
    if (!ready || props.view === "month-grid") return;
    const frame = requestAnimationFrame(() => {
      const container = root.current?.querySelector(".sx__view-container");
      if (container) container.scrollTop = 8 * 56;
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, props.view]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let active = false;
    let sourceElement: Element | undefined;
    const start = (event: Event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest(".sx__event")
      )
        return;
      cancelled.current = false;
      sourceElement = event.target.closest(".sx__event") ?? undefined;
      active = true;
      if (event.type === "touchstart" && monthDrag.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const end = () => {
      active = false;
    };
    const cancel = () => {
      if (!active && !monthDrag.current) return;
      cancelled.current = true;
      active = false;
      // The MIT plugins clean up on end, but do not register touchcancel/blur.
      // Their validator rejects this synthetic end before any update callback.
      document.dispatchEvent(new Event("dragend"));
      (sourceElement ?? document).dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true }),
      );
      document.dispatchEvent(new Event("touchend"));
      monthDrag.current = undefined;
      setPreview(undefined);
      if (ready) plugins.events.set(latest.current.events);
    };
    element.addEventListener("mousedown", start, true);
    element.addEventListener("touchstart", start, {
      capture: true,
      passive: false,
    });
    document.addEventListener("mouseup", end);
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", cancel, true);
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      element.removeEventListener("mousedown", start, true);
      element.removeEventListener("touchstart", start, true);
      document.removeEventListener("mouseup", end);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel, true);
      window.removeEventListener("blur", cancel);
    };
  }, [ready, plugins.events]);
  useEffect(() => {
    if (!ready) return;
    const element = root.current;
    const lanes = element?.closest<HTMLElement>(".calendar-day-lanes");
    if (!element || !lanes) return;
    const synchronize = (event: Event) => {
      if (
        !(event.target instanceof HTMLElement) ||
        !event.target.classList.contains("sx__view-container")
      )
        return;
      for (const container of lanes.querySelectorAll<HTMLElement>(
        ".sx__view-container",
      ))
        if (
          container !== event.target &&
          Math.abs(container.scrollTop - event.target.scrollTop) > 1
        )
          container.scrollTop = event.target.scrollTop;
    };
    element.addEventListener("scroll", synchronize, true);
    return () => element.removeEventListener("scroll", synchronize, true);
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const lanes = root.current?.closest<HTMLElement>(".calendar-day-lanes");
    if (!lanes) return;
    const frame = requestAnimationFrame(() => {
      lanes.style.setProperty("--calendar-date-row-height", "auto");
      const rows = [...lanes.querySelectorAll<HTMLElement>(".sx__date-grid")];
      const height = Math.max(
        0,
        ...rows.map((row) => row.getBoundingClientRect().height),
      );
      lanes.style.setProperty("--calendar-date-row-height", `${height}px`);
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, props.events]);
  const cancelMonthDrag = () => {
    monthDrag.current = undefined;
    setPreview(undefined);
  };
  return (
    <div
      ref={root}
      className={`calendar-engine calendar-engine-${props.view}${props.agentLane ? " calendar-agent-engine" : ""}`}
      data-testid="calendar-engine"
      onKeyDownCapture={(keyboard) => {
        // SDK opens the dialog on keydown; suppress activation of its newly focused button.
        if (
          ["Enter", " "].includes(keyboard.key) &&
          keyboard.target instanceof Element &&
          keyboard.target.closest(".sx__event")
        )
          keyboard.preventDefault();
      }}
      onDragStartCapture={(event) => {
        if (props.view === "month-grid") event.preventDefault();
      }}
      onPointerDownCapture={(pointer) => {
        if (
          props.view !== "month-grid" ||
          pointer.button !== 0 ||
          monthDrag.current ||
          !(pointer.target instanceof Element)
        )
          return;
        const id =
          pointer.target.closest<HTMLElement>(".sx__event")?.dataset.eventId;
        const event = props.events.find((item) => String(item.id) === id);
        if (!event || !props.canMove(String(event.occurrenceId))) return;
        pointer.preventDefault();
        cancelled.current = false;
        monthDrag.current = {
          pointerId: pointer.pointerId,
          event,
          x: pointer.clientX,
          y: pointer.clientY,
          moved: false,
        };
        pointer.currentTarget.setPointerCapture(pointer.pointerId);
      }}
      onPointerMove={(pointer) => {
        const drag = monthDrag.current;
        if (!drag || pointer.pointerId !== drag.pointerId) return;
        if (Math.hypot(pointer.clientX - drag.x, pointer.clientY - drag.y) > 5)
          drag.moved = true;
        if (drag.moved)
          setPreview({
            title: drag.event.title ?? "",
            x: pointer.clientX,
            y: pointer.clientY,
          });
      }}
      onPointerUp={(pointer) => {
        const drag = monthDrag.current;
        if (!drag || pointer.pointerId !== drag.pointerId) return;
        const day = document
          .elementFromPoint(pointer.clientX, pointer.clientY)
          ?.closest<HTMLElement>(".sx__month-grid-day")?.dataset.date;
        if (
          drag.moved &&
          day &&
          props.canMove(String(drag.event.occurrenceId)) &&
          "toInstant" in drag.event.start &&
          "toInstant" in drag.event.end
        ) {
          const next = Temporal.PlainDate.from(day);
          const start = drag.event.start.with({
            year: next.year,
            month: next.month,
            day: next.day,
          });
          const end = start.add({
            nanoseconds: Number(
              drag.event.end.epochNanoseconds -
                drag.event.start.epochNanoseconds,
            ),
          });
          props.onMove({ ...drag.event, start, end });
        } else if (!drag.moved) props.onSelect(String(drag.event.occurrenceId));
        cancelMonthDrag();
        if (pointer.currentTarget.hasPointerCapture(pointer.pointerId))
          pointer.currentTarget.releasePointerCapture(pointer.pointerId);
      }}
      onPointerCancel={cancelMonthDrag}
      onLostPointerCapture={cancelMonthDrag}
    >
      <ScheduleXCalendar calendarApp={app} />
      {preview &&
        createPortal(
          <div
            className="calendar-touch-preview"
            style={{ left: preview.x + 8, top: preview.y + 8 }}
          >
            {preview.title}
          </div>,
          document.body,
        )}
    </div>
  );
}
