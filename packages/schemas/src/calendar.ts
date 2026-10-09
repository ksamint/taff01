import type { CalendarScheduleInput } from "./task-create";

const DAY = 86400000;
const zoneCache = new Map<string, string>();
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, Set<number>>();
function cached<K, V>(
  map: Map<K, V>,
  key: K,
  limit: number,
  build: () => V,
): V {
  const known = map.get(key);
  if (known !== undefined) return known;
  const value = build();
  if (map.size >= limit) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
  map.set(key, value);
  return value;
}
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
export function canonicalCalendarTimeZone(zone: string): string {
  return cached(zoneCache, zone, 64, () => {
    const resolved = new Intl.DateTimeFormat("en", {
      timeZone: zone,
    }).resolvedOptions().timeZone;
    const offset = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(zone);
    return offset ? `${offset[1]}${offset[2]}:${offset[3] ?? "00"}` : resolved;
  });
}
/** A Date whose UTC fields represent local calendar fields; never expose it as an actual instant. */
export function calendarCivilTime(
  instant: string | Date,
  timeZone: string,
): Date {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  if (!Number.isFinite(date.getTime()))
    throw new RangeError("Invalid calendar instant");
  const zone = canonicalCalendarTimeZone(timeZone);
  const formatter = cached(
    formatterCache,
    zone,
    64,
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }),
  );
  const parts = formatter.formatToParts(date);
  const part = (name: string) =>
    Number(parts.find((p) => p.type === name)?.value);
  return new Date(
    Date.UTC(
      part("year"),
      part("month") - 1,
      part("day"),
      part("hour"),
      part("minute"),
      part("second"),
      date.getUTCMilliseconds(),
    ),
  );
}
/** RFC5545: first instant in a fold, offset before the transition in a gap. */
export function calendarWallToInstant(
  localISO: string,
  timeZone: string,
): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      localISO,
    );
  if (!match) throw new RangeError("Invalid calendar wall time");
  const y = Number(match[1]),
    m = Number(match[2]),
    d = Number(match[3]),
    h = Number(match[4]),
    minute = Number(match[5]),
    second = Number(match[6] ?? 0),
    ms = Number((match[7] ?? "0").padEnd(3, "0"));
  const wall = new Date(Date.UTC(y, m - 1, d, h, minute, second, ms));
  if (
    wall.getUTCFullYear() !== y ||
    wall.getUTCMonth() !== m - 1 ||
    wall.getUTCDate() !== d ||
    wall.getUTCHours() !== h ||
    wall.getUTCMinutes() !== minute ||
    wall.getUTCSeconds() !== second
  )
    throw new RangeError("Invalid calendar wall time");
  const zone = canonicalCalendarTimeZone(timeZone);
  const offsets = cached(
    offsetCache,
    `${zone}|${wall.toISOString().slice(0, 10)}`,
    512,
    () => {
      const found = new Set<number>();
      for (const days of [-2, -1, 0, 1, 2]) {
        const sample = new Date(wall.getTime() + days * DAY);
        found.add(calendarCivilTime(sample, zone).getTime() - sample.getTime());
      }
      return found;
    },
  );
  const candidates = [...offsets].map(
    (offset) => new Date(wall.getTime() - offset),
  );
  const exact = candidates
    .filter(
      (candidate) =>
        calendarCivilTime(candidate, zone).getTime() === wall.getTime(),
    )
    .sort((a, b) => a.getTime() - b.getTime());
  if (exact.length) return exact[0].toISOString();
  const after = candidates
    .map((candidate) => ({
      candidate,
      delta: calendarCivilTime(candidate, zone).getTime() - wall.getTime(),
    }))
    .filter((item) => item.delta > 0)
    .sort((a, b) => a.delta - b.delta);
  if (!after.length) throw new RangeError("Unresolvable calendar wall time");
  return after[0].candidate.toISOString();
}
function resolveCivil(date: Date, zone: string): string {
  return calendarWallToInstant(date.toISOString().slice(0, -1), zone);
}
function basicInstant(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) throw new RangeError("Invalid calendar UNTIL");
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
}
/** Prepare a whole-series move/resize from any displayed occurrence, preserving the original anchor. */
export function shiftCalendarSeries(
  schedule: CalendarScheduleInput,
  previousOccurrenceStart: string,
  newOccurrenceStart: string,
  newOccurrenceEnd?: string,
): CalendarScheduleInput {
  const timeZone = canonicalCalendarTimeZone(schedule.timeZone);
  const previous = calendarCivilTime(previousOccurrenceStart, timeZone),
    next = calendarCivilTime(newOccurrenceStart, timeZone);
  const delta = next.getTime() - previous.getTime();
  const dayShift = Math.round(
    (Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate()) -
      Date.UTC(
        previous.getUTCFullYear(),
        previous.getUTCMonth(),
        previous.getUTCDate(),
      )) /
      DAY,
  );
  const base = calendarCivilTime(schedule.startAt, timeZone);
  base.setTime(base.getTime() + delta);
  const startAt =
    delta === 0
      ? new Date(schedule.startAt).toISOString()
      : resolveCivil(base, timeZone);
  const duration = newOccurrenceEnd
    ? Date.parse(newOccurrenceEnd) - Date.parse(newOccurrenceStart)
    : Date.parse(schedule.endAt) - Date.parse(schedule.startAt);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 7 * DAY)
    throw new RangeError("Invalid calendar duration");
  let rrule = schedule.rrule;
  if (rrule) {
    const parts = new Map(
      rrule
        .replace(/^RRULE:/i, "")
        .toUpperCase()
        .split(";")
        .map((part) => {
          const [key, value] = part.split("=");
          return [key, value] as const;
        }),
    );
    const freq = parts.get("FREQ");
    if (freq === "WEEKLY" && dayShift) {
      const shift = (day: string) => {
        const index = WEEKDAYS.indexOf(day);
        if (index < 0) throw new RangeError("Invalid calendar weekday");
        return WEEKDAYS[(index + (dayShift % 7) + 7) % 7];
      };
      if (parts.has("BYDAY"))
        parts.set(
          "BYDAY",
          (parts.get("BYDAY") ?? "").split(",").map(shift).join(","),
        );
      parts.set("WKST", shift(parts.get("WKST") ?? "MO"));
    }
    if (
      dayShift &&
      (freq === "MONTHLY" || freq === "YEARLY") &&
      parts.has("BYMONTHDAY")
    )
      parts.set("BYMONTHDAY", String(base.getUTCDate()));
    if (dayShift && freq === "YEARLY" && parts.has("BYMONTH"))
      parts.set("BYMONTH", String(base.getUTCMonth() + 1));
    if (delta !== 0 && parts.has("UNTIL")) {
      const until = calendarCivilTime(
        basicInstant(parts.get("UNTIL") ?? ""),
        timeZone,
      );
      until.setTime(until.getTime() + delta);
      parts.set(
        "UNTIL",
        resolveCivil(until, timeZone)
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}Z$/, "Z"),
      );
    }
    rrule = [...parts].map(([key, value]) => `${key}=${value}`).join(";");
  }
  return {
    startAt,
    endAt: new Date(Date.parse(startAt) + duration).toISOString(),
    timeZone,
    rrule,
  };
}
