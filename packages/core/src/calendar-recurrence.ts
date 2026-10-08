import {
  type CalendarRange,
  type CalendarScheduleInput,
  calendarCivilTime,
  calendarScheduleInputSchema,
  calendarWallToInstant,
  canonicalCalendarTimeZone,
  SchemaError,
} from "@taff/schemas";
import rrule from "rrule";

const { RRule } = rrule;

import { CoreError } from "./index";

const DAY = 86400000;
const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const PARTS = [
  "FREQ",
  "INTERVAL",
  "COUNT",
  "UNTIL",
  "BYDAY",
  "BYMONTHDAY",
  "BYMONTH",
  "WKST",
];
function invalid(): never {
  throw new CoreError("invalid_input", 400);
}
function civilInstant(date: Date, zone: string): Date {
  return new Date(calendarWallToInstant(date.toISOString().slice(0, -1), zone));
}
function parseUntil(value: string): Date {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!match) invalid();
  const date = new Date(
    `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`,
  );
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().replace(/[-:]/g, "").replace(".000Z", "Z") !== value ||
    date.getTime() < Date.UTC(1970, 0, 1) ||
    date.getTime() >= Date.UTC(2201, 0, 1)
  )
    invalid();
  return date;
}
type Rule = {
  canonical: string;
  options: ReturnType<typeof RRule.parseString>;
  until: Date | null;
};
function ruleFor(raw: string, anchor: Date, actualStart: Date): Rule {
  if (/[\r\n]/.test(raw)) invalid();
  const values = new Map<string, string>();
  for (const part of raw
    .trim()
    .replace(/^RRULE:/i, "")
    .toUpperCase()
    .split(";")) {
    const [key, value, ...extra] = part.trim().split("=");
    if (!PARTS.includes(key) || !value || extra.length || values.has(key))
      invalid();
    values.set(key, value);
  }
  const freq = values.get("FREQ");
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq))
    invalid();
  const integer = (key: string, min: number, max: number) => {
    const value = values.get(key);
    if (value === undefined) return;
    if (!/^-?\d+$/.test(value)) invalid();
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < min || number > max)
      invalid();
    values.set(key, String(number));
  };
  integer("INTERVAL", 1, 366);
  integer("COUNT", 1, 1000);
  integer("BYMONTH", 1, 12);
  integer("BYMONTHDAY", -1, 31);
  if (
    values.get("BYMONTHDAY") === "0" ||
    (values.has("COUNT") && values.has("UNTIL"))
  )
    invalid();
  if (values.has("BYMONTH") && freq !== "YEARLY") invalid();
  if (values.has("BYMONTHDAY") && !["MONTHLY", "YEARLY"].includes(freq))
    invalid();
  if (
    values.has("WKST") &&
    (freq !== "WEEKLY" || !DAYS.includes(values.get("WKST") ?? ""))
  )
    invalid();
  if (values.has("BYDAY")) {
    if (freq !== "WEEKLY") invalid();
    const days = (values.get("BYDAY") ?? "").split(",");
    if (
      days.length > 7 ||
      new Set(days).size !== days.length ||
      days.some((day) => !DAYS.includes(day)) ||
      !days.includes(DAYS[anchor.getUTCDay()])
    )
      invalid();
    values.set(
      "BYDAY",
      days
        .sort(
          (a, b) => ((DAYS.indexOf(a) + 6) % 7) - ((DAYS.indexOf(b) + 6) % 7),
        )
        .join(","),
    );
  }
  if (
    values.has("BYMONTH") &&
    Number(values.get("BYMONTH")) !== anchor.getUTCMonth() + 1
  )
    invalid();
  if (values.has("BYMONTHDAY")) {
    const expected = Number(values.get("BYMONTHDAY"));
    const last = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0),
    ).getUTCDate();
    if (
      expected === -1
        ? anchor.getUTCDate() !== last
        : anchor.getUTCDate() !== expected
    )
      invalid();
  }
  const until = values.has("UNTIL")
    ? parseUntil(values.get("UNTIL") ?? "")
    : null;
  if (until && until.getTime() < actualStart.getTime()) invalid();
  const canonical = PARTS.filter((key) => values.has(key))
    .map((key) => `${key}=${values.get(key)}`)
    .join(";");
  try {
    const options = RRule.parseString(canonical);
    options.until = null;
    options.dtstart = anchor;
    if ((freq === "MONTHLY" || freq === "YEARLY") && !options.bymonthday)
      options.bymonthday = anchor.getUTCDate();
    if (freq === "YEARLY" && !options.bymonth)
      options.bymonth = anchor.getUTCMonth() + 1;
    return { canonical, options, until };
  } catch {
    invalid();
  }
}
export function normalizeCalendarSchedule(
  input: CalendarScheduleInput,
): CalendarScheduleInput {
  let body: CalendarScheduleInput;
  try {
    body = calendarScheduleInputSchema.parse(input);
  } catch (error) {
    if (error instanceof SchemaError) invalid();
    throw error;
  }
  const timeZone = canonicalCalendarTimeZone(body.timeZone);
  const startAt = new Date(body.startAt).toISOString();
  const endAt = new Date(body.endAt).toISOString();
  const rrule = body.rrule
    ? ruleFor(
        body.rrule,
        calendarCivilTime(startAt, timeZone),
        new Date(startAt),
      ).canonical
    : null;
  return { startAt, endAt, timeZone, rrule };
}
/** For unlimited rules, retain recurrence phase while seeking close to the requested civil window. */
function seek(rule: Rule, anchor: Date, after: Date): void {
  if (rule.options.count) return;
  const interval = rule.options.interval ?? 1;
  const freq = rule.options.freq;
  let steps = 0;
  let target: Date;
  if (freq === RRule.DAILY || freq === RRule.WEEKLY) {
    const period = (freq === RRule.WEEKLY ? 7 : 1) * interval * DAY;
    steps = Math.max(
      0,
      Math.floor((after.getTime() - anchor.getTime()) / period) - 1,
    );
    target = new Date(anchor.getTime() + steps * period);
  } else if (freq === RRule.MONTHLY) {
    const months =
      (after.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      after.getUTCMonth() -
      anchor.getUTCMonth();
    steps = Math.max(0, Math.floor(months / interval) - 1);
    target = new Date(
      Date.UTC(
        anchor.getUTCFullYear(),
        anchor.getUTCMonth() + steps * interval,
        1,
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds(),
      ),
    );
  } else {
    steps = Math.max(
      0,
      Math.floor(
        (after.getUTCFullYear() - anchor.getUTCFullYear()) / interval,
      ) - 1,
    );
    target = new Date(
      Date.UTC(
        anchor.getUTCFullYear() + steps * interval,
        0,
        1,
        anchor.getUTCHours(),
        anchor.getUTCMinutes(),
        anchor.getUTCSeconds(),
        anchor.getUTCMilliseconds(),
      ),
    );
  }
  if (steps > 0) rule.options.dtstart = target;
}
export function expandCalendarSchedule(
  input: CalendarScheduleInput,
  range: CalendarRange,
): { occurrences: { startAt: string; endAt: string }[]; truncated: boolean } {
  const from = Date.parse(range.from),
    to = Date.parse(range.to),
    start = Date.parse(input.startAt),
    duration = Date.parse(input.endAt) - start;
  if (!input.rrule)
    return {
      occurrences:
        start < to && start + duration > from
          ? [
              {
                startAt: new Date(start).toISOString(),
                endAt: new Date(start + duration).toISOString(),
              },
            ]
          : [],
      truncated: false,
    };
  const anchor = calendarCivilTime(input.startAt, input.timeZone);
  const rule = ruleFor(input.rrule, anchor, new Date(start));
  if (start >= to || (rule.until && rule.until.getTime() + duration <= from))
    return { occurrences: [], truncated: false };
  const after = calendarCivilTime(
    new Date(from - duration - 2 * DAY),
    input.timeZone,
  );
  const before = calendarCivilTime(new Date(to + 2 * DAY), input.timeZone);
  seek(rule, anchor, after);
  let truncated = false;
  const dates = new RRule(rule.options, true).between(
    after,
    before,
    true,
    (_, index) => {
      if (index >= 128) {
        truncated = true;
        return false;
      }
      return true;
    },
  );
  const occurrences: { startAt: string; endAt: string }[] = [];
  for (const civil of dates) {
    const actual =
      civil.getTime() === anchor.getTime()
        ? new Date(start)
        : civilInstant(civil, input.timeZone);
    const ms = actual.getTime();
    if (
      ms < start ||
      (rule.until && ms > rule.until.getTime()) ||
      ms >= to ||
      ms + duration <= from
    )
      continue;
    occurrences.push({
      startAt: actual.toISOString(),
      endAt: new Date(ms + duration).toISOString(),
    });
  }
  return { occurrences, truncated };
}
