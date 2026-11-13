// Display-only timeline contract. Core supplies authorized data and translated labels.
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
import type { Timeline } from "./plan";
import { localeSchema } from "./primitives";

const text = (max: number) => string().check(maxLength(max));
const coordinate = (max: number) => number().check(minimum(0), maximum(max));
const hash = string().check(regex(/^[a-f0-9]{64}$/));
export const timelineLayoutSchema = strictObject({
  locale: localeSchema,
  width: literal(1600),
  height: number().check(minimum(320), maximum(4000)),
  title: text(200),
  subtitle: text(300),
  todayLabel: text(100),
  todayX: coordinate(1552),
  ticks: array(strictObject({ x: coordinate(1552), label: text(100) })).check(
    maxLength(7),
  ),
  rows: array(
    strictObject({
      kind: zodEnum(["task", "milestone"]),
      title: text(220),
      y: coordinate(3800),
      x: coordinate(1552),
      endX: coordinate(1552),
      forecastX: coordinate(1552),
      progress: number().check(minimum(0), maximum(100)),
      depth: number().check(minimum(0), maximum(8)),
      critical: boolean(),
      blocked: boolean(),
    }),
  ).check(maxLength(60)),
  dependencies: array(
    strictObject({
      from: number().check(minimum(0), maximum(59)),
      to: number().check(minimum(0), maximum(59)),
      conflict: boolean(),
    }),
  ).check(maxLength(3600)),
  more: nullable(text(100)),
  footer: strictObject({ text: text(300), hashFull: hash }),
});
export const timelineImageInputSchema = strictObject({
  layout: timelineLayoutSchema,
  watermark: strictObject({ text: text(500), contentHash: hash }),
  contentHash: hash,
});
export type TimelineLayout = Infer<typeof timelineLayoutSchema>;
export type TimelineImageInput = Infer<typeof timelineImageInputSchema>;
export type TimelineImageLabels = {
  title: string;
  subtitle: string;
  today: string;
  footer: string;
  more: (count: number) => string;
  /** Receives a civil YYYY-MM-DD, never an instant in the viewer's zone. */
  date: (civil: string) => string;
};
const day = (civil: string) => Date.parse(`${civil}T00:00:00Z`) / 86_400_000;
const civil = (value: number) =>
  new Date(value * 86_400_000).toISOString().slice(0, 10);

/** Preserve getTimeline's stable hierarchy order; fit the retained chart, including forecasts and today. */
export function buildTimelineLayout(
  timeline: Timeline,
  locale: TimelineLayout["locale"],
  labels: TimelineImageLabels,
  contentHash: string,
): TimelineLayout {
  const items = timeline.items.slice(0, 60);
  let first = day(timeline.today),
    last = first;
  for (const item of items) {
    first = Math.min(first, day(item.start));
    last = Math.max(last, day(item.end), day(item.forecastEnd));
  }
  if (!Number.isFinite(first) || !Number.isFinite(last))
    throw new Error("invalid timeline dates");
  const origin = first - 1,
    span = last - first + 3;
  const x = (value: number) => 440 + ((value - origin) / span) * 1096;
  const rows = items.map((item, index) => ({
    kind: item.kind,
    title: item.title.slice(0, 220),
    y: 194 + index * 52,
    x: x(day(item.start) + (item.kind === "milestone" ? 1 : 0)),
    endX: x(day(item.end) + 1),
    forecastX: x(Math.max(day(item.end), day(item.forecastEnd)) + 1),
    progress: Math.min(100, item.progress),
    depth: Math.min(8, item.depth),
    critical: item.critical,
    blocked: item.blocked,
  }));
  const indices = new Map(
    items.map((item, index) => [`${item.kind}:${item.id}`, index]),
  );
  const dependencies = timeline.dependencies
    .flatMap((link) => {
      const from = indices.get(`${link.from.kind}:${link.from.id}`),
        to = indices.get(`${link.to.kind}:${link.to.id}`);
      return from === undefined || to === undefined
        ? []
        : [{ from, to, conflict: link.conflict }];
    })
    .slice(0, 3600);
  const ticks = Array.from({ length: Math.min(7, span) }, (_, index) => {
    const value =
      origin + Math.round((index * (span - 1)) / (Math.min(7, span) - 1));
    return { x: x(value), label: labels.date(civil(value)) };
  });
  return timelineLayoutSchema.parse({
    locale,
    width: 1600,
    height: Math.max(320, 280 + rows.length * 52),
    title: labels.title,
    subtitle: labels.subtitle,
    todayLabel: labels.today,
    todayX: x(day(timeline.today) + 0.5),
    ticks,
    rows,
    dependencies,
    more:
      timeline.items.length > 60
        ? labels.more(timeline.items.length - 60)
        : null,
    footer: { text: labels.footer, hashFull: contentHash },
  });
}
