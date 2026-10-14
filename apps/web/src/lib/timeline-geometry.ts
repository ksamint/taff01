// Pure geometry for the M16 timeline (hand-rolled SVG, no Gantt library).
// The server owns the plan model (`GET /api/projects/:id/timeline`); these
// helpers only map its civil dates to pixels and back.
import type { Timeline, TimelineItem } from "@taff/schemas/plan";

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 for a civil date (YYYY-MM-DD). */
export function dayNumber(date: string) {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}
/** The civil date `days` after `date` (negative goes back). */
export function addDays(date: string, days: number) {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string) {
  return dayNumber(to) - dayNumber(from);
}
/** 0 = Monday … 6 = Sunday. */
export function weekday(date: string) {
  return (((dayNumber(date) + 3) % 7) + 7) % 7;
}

export type Zoom = "day" | "week";
export type Scale = {
  /** First day drawn; always a Monday. */
  origin: string;
  /** Number of days drawn. */
  days: number;
  /** Pixels per day. */
  dayWidth: number;
};

/** Pixels per day: day zoom shows numbers, week zoom fits a quarter. */
export function dayWidthFor(zoom: Zoom, phone: boolean) {
  if (zoom === "day") return phone ? 24 : 28;
  return phone ? 10 : 12;
}

/**
 * The drawn range: from the Monday on or before the earliest date (today
 * included) minus a week, to two weeks after the latest end or forecast.
 */
export function scaleFor(
  timeline: Pick<Timeline, "items" | "today">,
  dayWidth: number,
): Scale {
  let first = timeline.today;
  let last = timeline.today;
  for (const item of timeline.items) {
    if (item.start < first) first = item.start;
    const end = item.forecastEnd > item.end ? item.forecastEnd : item.end;
    if (end > last) last = end;
  }
  const origin = addDays(first, -weekday(first) - 7);
  return { origin, days: daysBetween(origin, last) + 15, dayWidth };
}
/** Left edge of a day's column. */
export function dateToX(scale: Scale, date: string) {
  return daysBetween(scale.origin, date) * scale.dayWidth;
}
/** The day under an x position (floor). */
export function xToDate(scale: Scale, x: number) {
  return addDays(scale.origin, Math.floor(x / scale.dayWidth));
}
/** A pointer offset in whole days, rounded to the nearest day. */
export function deltaDays(dx: number, dayWidth: number) {
  const days = Math.round(dx / dayWidth);
  return Object.is(days, -0) ? 0 : days;
}
/** A bar's left edge and width; a milestone is a point at the end of its day. */
export function barGeometry(scale: Scale, item: TimelineItem) {
  const x = dateToX(scale, item.start);
  if (item.kind === "milestone") return { x: x + scale.dayWidth, width: 0 };
  return {
    x,
    width: (daysBetween(item.start, item.end) + 1) * scale.dayWidth,
  };
}

/** Week starts (Mondays) and every day, for the header and the grid. */
export function ticks(scale: Scale) {
  const weeks: { date: string; x: number }[] = [];
  const days: { date: string; x: number; weekend: boolean }[] = [];
  for (let i = 0; i < scale.days; i++) {
    const date = addDays(scale.origin, i);
    const x = i * scale.dayWidth;
    const day = weekday(date);
    if (day === 0) weeks.push({ date, x });
    days.push({ date, x, weekend: day >= 5 });
  }
  return { weeks, days };
}

/**
 * A finish-to-start arrow from the predecessor's end to the successor's
 * start: an elbow when there is room, otherwise it doubles back between
 * the rows.
 */
export function arrowPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  rowHeight: number,
) {
  const gap = 8;
  if (to.x - from.x >= gap * 2)
    return `M${from.x},${from.y}H${from.x + gap}V${to.y}H${to.x}`;
  const between = to.y + (to.y >= from.y ? -rowHeight / 2 : rowHeight / 2);
  return `M${from.x},${from.y}H${from.x + gap}V${between}H${to.x - gap}V${to.y}H${to.x}`;
}

/** Rows to render for a scroll position; everything up to `threshold`. */
export function visibleRows(
  count: number,
  scrollTop: number,
  viewport: number,
  rowHeight: number,
  threshold = 200,
  overscan = 8,
) {
  if (count <= threshold) return { from: 0, to: count };
  const from = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const to = Math.min(
    count,
    Math.ceil((scrollTop + viewport) / rowHeight) + overscan,
  );
  return { from, to };
}

/** Every descendant id of a task, from the timeline's parent links. */
export function descendantIds(items: TimelineItem[], id: string) {
  const children = new Map<string, string[]>();
  for (const item of items)
    if (item.parentId)
      children.set(item.parentId, [
        ...(children.get(item.parentId) ?? []),
        item.id,
      ]);
  const out: string[] = [];
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const next = stack.pop() as string;
    out.push(next);
    stack.push(...(children.get(next) ?? []));
  }
  return out;
}

/**
 * The optimistic timeline after a plan change: the item takes the new start
 * and duration; a subtree move shifts every descendant by the same days.
 * The next read replaces it with the server's model.
 */
export function applyPlanChange(
  timeline: Timeline,
  id: string,
  startDate: string,
  durationDays: number,
  shiftChildren: boolean,
): Timeline {
  const item = timeline.items.find((entry) => entry.id === id);
  if (!item) return timeline;
  const shift = daysBetween(item.start, startDate);
  const moved = new Set(shiftChildren ? descendantIds(timeline.items, id) : []);
  return {
    ...timeline,
    items: timeline.items.map((entry) => {
      if (entry.id === id) {
        const end =
          entry.kind === "milestone"
            ? startDate
            : addDays(startDate, durationDays - 1);
        return {
          ...entry,
          start: startDate,
          end,
          durationDays: entry.kind === "milestone" ? 0 : durationDays,
          forecastEnd: addDays(entry.forecastEnd, daysBetween(entry.end, end)),
        };
      }
      if (!moved.has(entry.id)) return entry;
      return {
        ...entry,
        start: addDays(entry.start, shift),
        end: addDays(entry.end, shift),
        forecastEnd: addDays(entry.forecastEnd, shift),
      };
    }),
  };
}
