// Display layout for summary renders (ADR 0029 amendment 1). Every string is
// already localized and formatted in TypeScript; renderers only place it.
import {
  array,
  boolean,
  type infer as Infer,
  literal,
  maxLength,
  minLength,
  nullable,
  number,
  refine,
  regex,
  strictObject,
  string,
  enum as zodEnum,
} from "zod/mini";
import { riskLevelSchema } from "./plan";
import { localeSchema } from "./primitives";

const text = (max: number) => string().check(maxLength(max));
const label = (max = 200) => string().check(minLength(1), maxLength(max));
const percent = number().check(
  refine((value) => Number.isInteger(value) && value >= 0 && value <= 100),
);

export const SUMMARY_SECTION_KEYS = [
  "completedToday",
  "movedToday",
  "dueToday",
  "overdue",
  "blocked",
] as const;
export const SUMMARY_KPI_KEYS = [
  "projects",
  "open",
  "completedToday",
  "dueToday",
  "overdue",
  "blocked",
  "inReview",
] as const;

export const summaryLayoutItemSchema = strictObject({
  number: label(20),
  title: label(220),
  detail: text(300),
  overdue: boolean(),
});
export const summaryLayoutSectionSchema = strictObject({
  key: zodEnum(SUMMARY_SECTION_KEYS),
  title: label(100),
  count: label(20),
  items: array(summaryLayoutItemSchema).check(maxLength(20)),
  more: nullable(label(100)),
});
export const summaryLayoutProjectSchema = strictObject({
  name: label(140),
  stage: nullable(label(100)),
  risk: strictObject({
    level: riskLevelSchema,
    label: label(60),
    reasons: array(label(120)).check(maxLength(4)),
  }),
  meta: array(label(200)).check(maxLength(3)),
  progress: strictObject({ percent, label: label(100) }),
  finance: nullable(
    strictObject({ percent: nullable(percent), label: label(240) }),
  ),
  agentRuns: nullable(label(240)),
  sections: array(summaryLayoutSectionSchema).check(maxLength(5)),
});
export const summaryLayoutSchema = strictObject({
  version: literal(1),
  locale: localeSchema,
  header: strictObject({
    title: label(100),
    audience: label(220),
    workspace: label(140),
    date: label(40),
  }),
  kpis: array(
    strictObject({
      key: zodEnum(SUMMARY_KPI_KEYS),
      label: label(60),
      value: label(20),
      tone: zodEnum(["neutral", "warning", "danger"]),
    }),
  ).check(maxLength(7)),
  projects: array(summaryLayoutProjectSchema).check(maxLength(100)),
  moreProjects: nullable(label(100)),
  footer: strictObject({
    generated: label(200),
    watermark: label(400),
    hashLabel: label(40),
    hashShort: string().check(regex(/^[a-f0-9]{8}…[a-f0-9]{4}$/)),
    hashFull: string().check(regex(/^[a-f0-9]{64}$/)),
  }),
});
export type SummaryLayout = Infer<typeof summaryLayoutSchema>;
export type SummaryLayoutProject = Infer<typeof summaryLayoutProjectSchema>;
export type SummaryLayoutSection = Infer<typeof summaryLayoutSectionSchema>;
