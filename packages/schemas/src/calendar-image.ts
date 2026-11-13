// Display-only calendar exports. Core owns authorization and occurrence expansion.
import {
  array,
  boolean,
  type infer as Infer,
  literal,
  maximum,
  maxLength,
  minimum,
  nullable,
  number,
  regex,
  strictObject,
  string,
  enum as zodEnum,
} from "zod/mini";
import {
  calendarCivilTime,
  calendarWallToInstant,
  canonicalCalendarTimeZone,
} from "./calendar";
import type { CalendarViewData } from "./calendar-read";
import { civilDateSchema } from "./plan";
import { localeSchema } from "./primitives";

const text = (max: number) => string().check(maxLength(max));
const bounded = (max: number) => number().check(minimum(0), maximum(max));
const hash = string().check(regex(/^[a-f0-9]{64}$/));
export const calendarImageQuerySchema = strictObject({
  mode: zodEnum(["week", "month"]),
  visibleDate: civilDateSchema,
  timeZone: text(100),
});
export type CalendarImageQuery = Infer<typeof calendarImageQuerySchema>;
export const calendarLayoutSchema = strictObject({
  locale: localeSchema,
  mode: zodEnum(["week", "month"]),
  width: literal(1600),
  height: number().check(minimum(320), maximum(4000)),
  title: text(200),
  subtitle: text(300),
  allDayLabel: text(100),
  weekdays: array(text(100)).check(maxLength(7)),
  cells: array(
    strictObject({
      x: bounded(1556),
      y: bounded(3900),
      width: literal(216),
      height: bounded(3700),
      dateLabel: text(100),
      inMonth: boolean(),
      timedY: bounded(3900),
      items: array(
        strictObject({
          title: text(220),
          detail: text(100),
          y: bounded(3900),
          allDay: boolean(),
          continuesBefore: boolean(),
          continuesAfter: boolean(),
        }),
      ).check(maxLength(8)),
      more: nullable(text(100)),
    }),
  ).check(maxLength(42)),
  sourceTruncatedNote: nullable(text(300)),
  footer: strictObject({ text: text(300), hashFull: hash }),
});
export const calendarImageInputSchema = strictObject({
  layout: calendarLayoutSchema,
  watermark: strictObject({ text: text(500), contentHash: hash }),
  contentHash: hash,
});
export type CalendarLayout = Infer<typeof calendarLayoutSchema>;
export type CalendarImageInput = Infer<typeof calendarImageInputSchema>;
export type CalendarImageLabels = {
  title: string;
  subtitle: string;
  allDay: string;
  footer: string;
  sourceTruncated: string;
  date: (civilDate: string) => string;
  weekday: (civilDate: string) => string;
  time: (startAt: string, endAt: string, timeZone: string) => string;
  more: (count: number) => string;
};
const DAY = 86_400_000;
const civilNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
const civil = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const monday = (day: number) => day - ((((day + 3) % 7) + 7) % 7);
const lexical = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Query listCalendar with from/to; endDate/to are exclusive, converted separately through the viewer's zone. */
export function calendarImageWindow(input: CalendarImageQuery) {
  const query = calendarImageQuerySchema.parse(input);
  if (/^[+-]/.test(query.timeZone))
    throw new RangeError("Expected IANA time zone");
  const timeZone = canonicalCalendarTimeZone(query.timeZone);
  const selected = civilNumber(query.visibleDate);
  const first =
    query.mode === "month"
      ? civilNumber(`${query.visibleDate.slice(0, 7)}-01`)
      : selected;
  const start = monday(first);
  const nextMonth = new Date(first * DAY);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1, 1);
  const last =
    query.mode === "month" ? nextMonth.getTime() / DAY - 1 : start + 6;
  const end = monday(last) + 7;
  const startDate = civil(start),
    endDate = civil(end);
  return {
    ...query,
    timeZone,
    startDate,
    endDate,
    from: calendarWallToInstant(`${startDate}T00:00`, timeZone),
    to: calendarWallToInstant(`${endDate}T00:00`, timeZone),
  };
}

/** Whole local days only: midnight to later midnight, end-exclusive (23:59:59.999 is a timed event). */
export function buildCalendarLayout(
  source: CalendarViewData,
  query: CalendarImageQuery,
  locale: CalendarLayout["locale"],
  labels: CalendarImageLabels,
  contentHash: string,
): CalendarLayout {
  const window = calendarImageWindow(query);
  const first = civilNumber(window.startDate),
    last = civilNumber(window.endDate);
  const seen = new Set<string>();
  const occurrences = source.occurrences
    .map((occurrence) => {
      const start = Date.parse(occurrence.startAt),
        end = Date.parse(occurrence.endAt);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        throw new RangeError("Invalid calendar occurrence");
      const localStart = calendarCivilTime(new Date(start), window.timeZone),
        localEnd = calendarCivilTime(new Date(end), window.timeZone);
      const allDay =
        localStart.getTime() % DAY === 0 &&
        localEnd.getTime() % DAY === 0 &&
        localEnd > localStart;
      return { occurrence, start, end, allDay };
    })
    .sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        a.start - b.start ||
        a.end - b.end ||
        lexical(a.occurrence.id, b.occurrence.id),
    )
    .filter(({ occurrence, start }) => {
      const key = `${occurrence.task.id}:${start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const days = Array.from({ length: last - first }, (_, index) => {
    const date = civil(first + index);
    const start = Date.parse(
      calendarWallToInstant(`${date}T00:00`, window.timeZone),
    );
    const end = Date.parse(
      calendarWallToInstant(
        `${civil(first + index + 1)}T00:00`,
        window.timeZone,
      ),
    );
    // A civil date skipped by a zone transition has no instants and no occurrences.
    const matching =
      end > start
        ? occurrences.filter((o) => o.start < end && o.end > start)
        : [];
    return {
      date,
      start,
      end,
      matching: matching.slice(0, 8),
      omitted: Math.max(0, matching.length - 8),
    };
  });
  const cells: CalendarLayout["cells"] = [];
  let top = 164;
  for (let week = 0; week < days.length / 7; week++) {
    const row = days.slice(week * 7, week * 7 + 7);
    const allDayCount = Math.max(
      ...row.map((d) => d.matching.filter((o) => o.allDay).length),
    );
    const timedCount = Math.max(
      ...row.map((d) => d.matching.filter((o) => !o.allDay).length),
    );
    const timedY = top + 68 + allDayCount * 26;
    const height = Math.max(
      query.mode === "week" ? 420 : 200,
      108 + allDayCount * 26 + timedCount * 32,
    );
    row.forEach((day, column) => {
      let a = 0,
        t = 0;
      cells.push({
        x: 44 + column * 216,
        y: top,
        width: 216,
        height,
        dateLabel: labels.date(day.date),
        inMonth:
          query.mode === "week" ||
          day.date.slice(0, 7) === query.visibleDate.slice(0, 7),
        timedY,
        items: day.matching.map(({ occurrence, start, end, allDay }) => ({
          title: occurrence.task.title.slice(0, 220),
          detail: allDay
            ? ""
            : labels.time(
                new Date(Math.max(start, day.start)).toISOString(),
                new Date(Math.min(end, day.end)).toISOString(),
                window.timeZone,
              ),
          y: allDay ? top + 62 + a++ * 26 : timedY + 14 + t++ * 32,
          allDay,
          continuesBefore: start < day.start,
          continuesAfter: end > day.end,
        })),
        more: day.omitted ? labels.more(day.omitted) : null,
      });
    });
    top += height;
  }
  return calendarLayoutSchema.parse({
    locale,
    mode: query.mode,
    width: 1600,
    height: top + 132,
    title: labels.title,
    subtitle: labels.subtitle,
    allDayLabel: labels.allDay,
    weekdays: days.slice(0, 7).map((day) => labels.weekday(day.date)),
    cells,
    sourceTruncatedNote: source.truncated ? labels.sourceTruncated : null,
    footer: { text: labels.footer, hashFull: contentHash },
  });
}
