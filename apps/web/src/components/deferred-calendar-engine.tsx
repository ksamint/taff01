"use client";
import { type ComponentType, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CalendarEngineProps } from "./calendar-engine";

/** Import the SDK only after the browser has painted the lightweight grid. */
export function DeferredCalendarEngine(props: CalendarEngineProps) {
  const { t } = useTranslation();
  const [Engine, setEngine] = useState<ComponentType<CalendarEngineProps>>();
  useEffect(() => {
    let active = true;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        void import("./calendar-engine").then(({ CalendarEngine }) => {
          if (active) setEngine(() => CalendarEngine);
        });
      });
    });
    return () => {
      active = false;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, []);
  if (Engine) return <Engine {...props} />;
  const groups = new Map<string, CalendarEngineProps["events"]>();
  for (const event of props.events) {
    if (
      props.view !== "day" ||
      event.start.toString().slice(0, 10) !== props.date
    )
      continue;
    const start = event.start.toString().slice(11, 16);
    groups.set(start, [...(groups.get(start) ?? []), event]);
  }
  const minutes = (value: string) =>
    Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return (
    <div
      className="calendar-grid-shell"
      data-testid="calendar-grid-shell"
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
      <div className="calendar-grid-shell-hours" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index}>{String(index + 8).padStart(2, "0")}:00</div>
        ))}
      </div>
      <div
        className="calendar-grid-shell-columns"
        aria-hidden="true"
        style={{
          gridTemplateColumns: `repeat(${props.view === "week" ? 7 : 1}, 1fr)`,
        }}
      >
        {Array.from({ length: props.view === "week" ? 7 : 1 }, (_, index) => (
          <div key={index} />
        ))}
      </div>
      <div className="calendar-grid-shell-events">
        {[...groups].map(([start, events]) => (
          <div
            key={start}
            className="calendar-grid-shell-event"
            style={{ top: ((minutes(start) - 480) * 56) / 60, minHeight: 56 }}
          >
            <p className="calendar-grid-shell-titles">
              {events
                .slice(0, 3)
                .map(
                  (event) =>
                    `${event.title} · ${start}–${event.end.toString().slice(11, 16)}`,
                )
                .join("\n")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
