import {
  type DailySummarySnapshot,
  SUMMARY_KPI_KEYS,
  SUMMARY_SECTION_KEYS,
  type SummaryLayout,
  type SummaryLayoutSection,
  type SummaryWatermark,
} from "@taff/schemas";
import type { SummaryTranslate } from "./summary-text";

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
 * Pure snapshot → display layout. All dates, numbers, money and plurals are
 * formatted here in the recipient's locale and zone; renderers only place them.
 */
export function buildSummaryLayout(
  snapshot: DailySummarySnapshot,
  watermark: SummaryWatermark,
  contentHash: string,
  createdAt: string,
  locale: SummaryLocale,
  t: SummaryTranslate,
  limits: SummaryLayoutLimits = FULL_LAYOUT,
): SummaryLayout {
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: snapshot.timeZone,
    }).format(new Date(value));
  const generated = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: snapshot.timeZone,
  }).format(new Date(createdAt));
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
      ].filter((value): value is string => value !== null);
      const sections: SummaryLayoutSection[] = SUMMARY_SECTION_KEYS.filter(
        (key) => project.counts[key] > 0,
      ).map((key) => {
        const shown = project[key].slice(0, limits.items);
        const omitted = project.counts[key] - shown.length;
        return {
          key,
          title: t(`summary.lists.${key}`),
          count: number(project.counts[key]),
          items: shown.map((task) => ({
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
  return {
    version: 1,
    locale,
    header: {
      title: t("summary.heading"),
      audience: t("summary.eyebrow", {
        kind: t(`audience.kind.${snapshot.tag.kind}`),
        org: cleanSummaryText(snapshot.tag.org, 100),
      }),
      workspace: cleanSummaryText(snapshot.workspace.name) || "—",
      date: snapshot.localDate,
    },
    kpis,
    projects,
    moreProjects:
      omittedProjects > 0
        ? t("summary.moreProjects", { count: number(omittedProjects) })
        : null,
    footer: {
      generated: t("summary.generated", {
        date: generated,
        zone: snapshot.timeZone,
      }),
      watermark: cleanSummaryText(watermark.text, 400),
      hashLabel: t("summary.hashLabel"),
      hashShort: `${contentHash.slice(0, 8)}…${contentHash.slice(-4)}`,
      hashFull: contentHash,
    },
  };
}

/**
 * Trims items first, then projects, until `fits` accepts the layout. Omitted
 * work is always named by the layout's localized "+N more" strings. Both
 * dimensions shrink the layout monotonically, so projects use a binary search.
 */
export function fitSummaryLayout(
  build: (limits: SummaryLayoutLimits) => SummaryLayout,
  fits: (layout: SummaryLayout) => boolean,
): SummaryLayout {
  for (let items = FULL_LAYOUT.items; items >= 0; items--) {
    const layout = build({ items, projects: FULL_LAYOUT.projects });
    if (fits(layout)) return layout;
  }
  let low = 0;
  let high = FULL_LAYOUT.projects;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(build({ items: 0, projects: middle }))) low = middle;
    else high = middle - 1;
  }
  return build({ items: 0, projects: low });
}

/**
 * Upper bound of the image height in pixels, mirroring `taff-render`'s
 * designed geometry (`backend/crates/taff-render/src/designed.rs`) with every
 * wrappable line at its two-line maximum. The renderer refuses anything above
 * 16,000 px; the worker fits layouts below IMAGE_HEIGHT_BUDGET, which keeps
 * the PNG under its 400 KB cap.
 */
export const IMAGE_HEIGHT_BUDGET = 3400;
export const IMAGE_GEOMETRY = {
  header: 348, // padding, two title lines, chip, two place lines
  kpis: 308, // gap, two tile rows, row gap, trailing gap
  project: 504, // padding, name, meta, reasons, bars, agent runs, gap
  section: 80, // rule, heading with count pill
  sectionMore: 30,
  item: 96, // two title lines, detail, spacing
  moreProjects: 50,
  footer: 216,
} as const;
export function estimateSummaryImageHeight(layout: SummaryLayout): number {
  const g = IMAGE_GEOMETRY;
  let height = g.header + g.kpis + g.footer;
  for (const project of layout.projects) {
    height += g.project;
    for (const section of project.sections)
      height +=
        g.section +
        section.items.length * g.item +
        (section.more ? g.sectionMore : 0);
  }
  return height + (layout.moreProjects ? g.moreProjects : 0);
}
