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
import { calendarWallToInstant } from "./calendar";
import { riskLevelSchema } from "./plan";
import { idSchema, localeSchema } from "./primitives";
import type { DailySummarySnapshot, SummaryWatermark } from "./summaries";

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
  taskId: idSchema,
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
  projectId: idSchema,
  name: label(140),
  stage: nullable(label(100)),
  risk: strictObject({
    level: riskLevelSchema,
    label: label(60),
    reasons: array(label(120)).check(maxLength(4)),
  }),
  meta: array(label(200)).check(maxLength(4)),
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
    audience: label(340),
    workspace: label(140),
    recipient: label(160),
    date: label(60),
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
  /** Shown instead of project cards when no project carries the tag. */
  empty: nullable(label(200)),
  footer: strictObject({
    confidential: label(200),
    /** Null for a preview, which has no generation instant. */
    generated: nullable(label(200)),
    watermark: label(400),
    hashLabel: label(40),
    hashShort: string().check(regex(/^[a-f0-9]{8}…[a-f0-9]{4}$/)),
    hashFull: string().check(regex(/^[a-f0-9]{64}$/)),
  }),
});
export type SummaryLayout = Infer<typeof summaryLayoutSchema>;
export type SummaryLayoutProject = Infer<typeof summaryLayoutProjectSchema>;
export type SummaryLayoutSection = Infer<typeof summaryLayoutSectionSchema>;

export type SummaryTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;
export type SummaryLocale = "en" | "zh-CN" | "zh-HK";
export type SummaryLayoutLimits = { items: number; projects: number };
export const FULL_LAYOUT: SummaryLayoutLimits = { items: 20, projects: 100 };

/** Control characters never reach a render; lengths stay inside the schema. */
export const cleanSummaryText = (value: string, limit = 120) =>
  Array.from(value.replace(/[\r\n\t\u0000-\u001f]/g, " "))
    .slice(0, limit)
    .join("")
    .trim();

/**
 * Pure snapshot → display layout, shared by the web page, the text render and
 * the image render (ADR 0029 amendment 1). Every date, number, currency and
 * plural is formatted here in the recipient's locale and the summary's zone.
 */
export function buildSummaryLayout(
  snapshot: DailySummarySnapshot,
  watermark: SummaryWatermark,
  contentHash: string,
  createdAt: string | null,
  locale: SummaryLocale,
  t: SummaryTranslate,
  limits: SummaryLayoutLimits = FULL_LAYOUT,
): SummaryLayout {
  const zone = snapshot.timeZone;
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: zone,
    }).format(new Date(value));
  const civil = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(`${value}T00:00:00Z`));
  const day = new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeZone: zone,
  }).format(
    new Date(calendarWallToInstant(`${snapshot.localDate}T12:00`, zone)),
  );
  const kpis = SUMMARY_KPI_KEYS.map((key) => {
    const value = snapshot.totals[key];
    const tone =
      key === "overdue" && value > 0
        ? ("danger" as const)
        : key === "blocked" && value > 0
          ? ("warning" as const)
          : ("neutral" as const);
    return {
      key,
      label: t(`summary.totals.${key}`),
      value: number(value),
      tone,
    };
  });
  const projects = snapshot.projects
    .slice(0, limits.projects)
    .map((project) => {
      const money = (value: string) =>
        project.finance?.currency
          ? new Intl.NumberFormat(locale, {
              style: "currency",
              currency: project.finance.currency,
            }).format(Number(value))
          : value;
      const meta = [
        project.leadName
          ? t("summary.lead", { name: cleanSummaryText(project.leadName) })
          : null,
        project.dueAt ? t("summary.due", { date: date(project.dueAt) }) : null,
        project.risk.slipDays > 0 && project.risk.forecastEnd
          ? t("summary.forecast", { date: civil(project.risk.forecastEnd) })
          : null,
        project.risk.slipDays > 0
          ? t("summary.slip", { count: project.risk.slipDays })
          : null,
      ].filter((value): value is string => value !== null);
      const sections = SUMMARY_SECTION_KEYS.filter(
        (key) => project.counts[key] > 0,
      ).map((key) => {
        const shown = project[key].slice(0, limits.items);
        const omitted = project.counts[key] - shown.length;
        return {
          key,
          title: t(`summary.lists.${key}`),
          count: number(project.counts[key]),
          items: shown.map((task) => ({
            taskId: task.taskId,
            number: `#${task.number}`,
            title: cleanSummaryText(task.title, 200) || `#${task.number}`,
            detail: [
              task.ownerName ? cleanSummaryText(task.ownerName) : null,
              task.dueAt ? t("summary.due", { date: date(task.dueAt) }) : null,
            ]
              .filter(Boolean)
              .join(" · "),
            overdue: key === "overdue",
          })),
          more:
            omitted > 0 ? t("summary.more", { count: number(omitted) }) : null,
        };
      });
      const runs = project.agentRuns;
      return {
        projectId: project.projectId,
        name: cleanSummaryText(project.name) || "—",
        stage: project.stage ? t(`projects.stages.${project.stage}`) : null,
        risk: {
          level: project.risk.level,
          label: t(`timeline.risk.level.${project.risk.level}`),
          reasons: project.risk.reasons
            .slice(0, 4)
            .map((reason) => t(`timeline.risk.reason.${reason}`)),
        },
        meta,
        progress: {
          percent: Math.min(100, Math.max(0, project.deliveryProgress)),
          label: t("summary.progress", {
            percent: `${number(project.deliveryProgress)}%`,
          }),
        },
        finance: project.finance
          ? {
              percent:
                project.finance.collectedPercent === null
                  ? null
                  : Math.min(100, project.finance.collectedPercent),
              label: project.finance.contractAmount
                ? t("summary.finance", {
                    collected: money(project.finance.collectedAmount),
                    contract: money(project.finance.contractAmount),
                  })
                : t("summary.financeNoContract", {
                    collected: money(project.finance.collectedAmount),
                  }),
            }
          : null,
        agentRuns:
          runs.completedToday + runs.pendingReview > 0
            ? t("summary.agentRuns", {
                completed: number(runs.completedToday),
                pending: number(runs.pendingReview),
              })
            : null,
        sections,
      };
    });
  const omittedProjects = snapshot.projects.length - projects.length;
  const recipient = cleanSummaryText(snapshot.recipient.name, 100);
  const tagLabel = cleanSummaryText(snapshot.tag.label, 100);
  const audience = t("summary.eyebrow", {
    kind: t(`audience.kind.${snapshot.tag.kind}`),
    org: cleanSummaryText(snapshot.tag.org, 100),
  });
  return {
    version: 1,
    locale,
    header: {
      title: t("summary.heading"),
      audience: tagLabel ? `${audience} · ${tagLabel}` : audience,
      workspace: cleanSummaryText(snapshot.workspace.name) || "—",
      recipient: t("summary.forRecipient", { name: recipient }),
      date: day,
    },
    kpis,
    projects,
    moreProjects:
      omittedProjects > 0
        ? t("summary.moreProjects", { count: number(omittedProjects) })
        : null,
    empty: snapshot.projects.length === 0 ? t("summary.noProjects") : null,
    footer: {
      confidential: t("summary.confidential", {
        name: cleanSummaryText(watermark.recipientName, 100),
      }),
      generated: createdAt
        ? t("summary.generated", {
            date: new Intl.DateTimeFormat(locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: zone,
            }).format(new Date(createdAt)),
            zone,
          })
        : null,
      watermark: cleanSummaryText(watermark.text, 400),
      hashLabel: t("summary.hashLabel"),
      hashShort: `${contentHash.slice(0, 8)}…${contentHash.slice(-4)}`,
      hashFull: contentHash,
    },
  };
}
