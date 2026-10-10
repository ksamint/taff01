"use client";
import "temporal-polyfill/global";
import "./calendar.css";
import {
  type CalendarScheduleInput,
  calendarScheduleInputSchema,
  calendarWallToInstant,
  type TaskCalendar,
} from "@taff/schemas";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

const rules = {
  none: "",
  daily: "FREQ=DAILY",
  weekdays: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
};
type Preset = keyof typeof rules | "custom";
function local(iso: string, zone: string) {
  return Temporal.Instant.from(iso)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "second" });
}
export function ScheduleEditor({
  current,
  startAt,
  timeZone,
  busy,
  canSave = true,
  error,
  onClose,
  onSave,
  onClear,
  onRetry,
}: {
  current?: TaskCalendar;
  startAt: string;
  timeZone: string;
  busy: boolean;
  canSave?: boolean;
  error?: string;
  onClose: () => void;
  onSave: (schedule: CalendarScheduleInput, title: string) => void;
  onClear?: () => void;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const [baseline] = useState(() => {
    const original = current?.schedule;
    const zone = original?.timeZone ?? timeZone;
    const originalStart = original?.startAt ?? startAt;
    const originalEnd =
      original?.endAt ?? new Date(Date.parse(startAt) + 3600000).toISOString();
    return {
      original,
      zone,
      originalStart,
      originalEnd,
      initialStart: local(originalStart, zone),
      initialEnd: local(originalEnd, zone),
    };
  });
  const {
    original,
    zone,
    originalStart,
    originalEnd,
    initialStart,
    initialEnd,
  } = baseline;
  const initialRule = original?.rrule ?? "";
  const initialCount =
    initialRule.match(/(?:^|;)COUNT=(\d+)(?:;|$)/)?.[1] ?? "";
  const presetRule = initialRule
    .split(";")
    .filter((part) => !part.startsWith("COUNT="))
    .join(";");
  const initialPreset = Object.entries(rules).find(
    ([, value]) => value === presetRule,
  )?.[0] as Preset | undefined;
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [tz, setTz] = useState(zone);
  const [preset, setPreset] = useState<Preset>(initialPreset ?? "custom");
  const [rule, setRule] = useState(initialRule);
  const [count, setCount] = useState(initialCount);
  const [title, setTitle] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <SheetDialog
      title={t(current ? "calendar.edit" : "calendar.create")}
      onClose={onClose}
    >
      <form
        className="planning-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy || !canSave || (current && !current.canSchedule)) return;
          try {
            const rrule =
              preset === "custom"
                ? rule
                : `${rules[preset]}${preset !== "none" && count ? `;COUNT=${count}` : ""}`;
            const schedule = calendarScheduleInputSchema.parse({
              startAt:
                start === initialStart && tz === zone
                  ? originalStart
                  : calendarWallToInstant(start, tz),
              endAt:
                end === initialEnd && tz === zone
                  ? originalEnd
                  : calendarWallToInstant(end, tz),
              timeZone: tz,
              rrule: rrule || null,
            });
            setInvalid(false);
            onSave(schedule, title.trim());
          } catch {
            setInvalid(true);
          }
        }}
      >
        {current ? (
          <Link className="back-link" href={`/tasks/${current.task.id}`}>
            {current.task.title} · {t("calendar.openTask")}
          </Link>
        ) : (
          <div>
            <Label htmlFor="schedule-title">{t("calendar.titleLabel")}</Label>
            <Input
              id="schedule-title"
              data-testid="schedule-title"
              required
              maxLength={200}
              value={title}
              disabled={busy || !canSave}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        )}
        <fieldset
          disabled={busy || !canSave || (current && !current.canSchedule)}
          className="schedule-fields"
        >
          <div>
            <Label htmlFor="schedule-start">{t("calendar.start")}</Label>
            <Input
              id="schedule-start"
              data-testid="schedule-start"
              type="text"
              placeholder="YYYY-MM-DDTHH:mm"
              step={1}
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="schedule-end">{t("calendar.end")}</Label>
            <Input
              id="schedule-end"
              data-testid="schedule-end"
              type="text"
              placeholder="YYYY-MM-DDTHH:mm"
              step={1}
              required
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="schedule-zone">{t("calendar.timeZone")}</Label>
            <Input
              id="schedule-zone"
              data-testid="schedule-zone"
              required
              value={tz}
              onChange={(event) => setTz(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="schedule-repeat">{t("calendar.repeat")}</Label>
            <select
              id="schedule-repeat"
              data-testid="schedule-repeat"
              className="select"
              value={preset}
              onChange={(event) => setPreset(event.target.value as Preset)}
            >
              {[...Object.keys(rules), "custom"].map((key) => (
                <option key={key} value={key}>
                  {t(`calendar.${key}`)}
                </option>
              ))}
            </select>
          </div>
          {preset === "custom" ? (
            <div>
              <Label htmlFor="schedule-rule">{t("calendar.rule")}</Label>
              <Input
                id="schedule-rule"
                data-testid="schedule-rule"
                value={rule}
                onChange={(event) => setRule(event.target.value)}
              />
            </div>
          ) : preset !== "none" ? (
            <div>
              <Label htmlFor="schedule-count">{t("calendar.count")}</Label>
              <Input
                id="schedule-count"
                data-testid="schedule-count"
                type="number"
                min={1}
                max={1000}
                value={count}
                onChange={(event) => setCount(event.target.value)}
              />
            </div>
          ) : null}
        </fieldset>
        <p className="muted">{t("calendar.series")}</p>
        {(error || invalid) && (
          <p className="alert" role="alert">
            {error ?? t("calendar.invalid")}
            {onRetry && (
              <Button type="button" disabled={busy} onClick={onRetry}>
                {t("retry")}
              </Button>
            )}
          </p>
        )}
        <div className="schedule-actions">
          <Button
            type="submit"
            data-testid="schedule-save"
            disabled={busy || !canSave || (current && !current.canSchedule)}
          >
            {t("calendar.save")}
          </Button>
          {original && onClear && (
            <Button
              className="button-quiet"
              type="button"
              data-testid="schedule-clear"
              disabled={busy || !canSave || !current?.canSchedule}
              onClick={onClear}
            >
              {t("calendar.clear")}
            </Button>
          )}
        </div>
      </form>
    </SheetDialog>
  );
}
