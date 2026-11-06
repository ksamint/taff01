import type { DailySummarySnapshot, SummaryWatermark } from "@taff/schemas";

export type SummaryTranslate = (
  key: string,
  values?: Record<string, string | number>,
) => string;
export const SUMMARY_TEXT_LIMIT = 4000;
const LISTS = [
  "completedToday",
  "movedToday",
  "dueToday",
  "overdue",
  "blocked",
] as const;
const TOTALS = [
  "projects",
  "open",
  "completedToday",
  "movedToday",
  "dueToday",
  "overdue",
  "blocked",
  "inReview",
] as const;
const clean = (text: string, limit = 120) =>
  Array.from(text.replace(/[\r\n\t\u0000-\u001f]/g, " "))
    .slice(0, limit)
    .join("");

/** A display column is one Latin glyph or half a full-width CJK glyph. */
export function wrapSummaryLine(text: string): string {
  const lines = [""];
  let columns = 0;
  for (const char of text) {
    const width =
      /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe10-\ufe6f\uff00-\uff60\u{1f000}-\u{1ffff}]/u.test(
        char,
      )
        ? 2
        : 1;
    if (columns + width > 72) {
      const current = lines[lines.length - 1];
      const space = current.lastIndexOf(" ");
      if (space > 0) {
        lines[lines.length - 1] = current.slice(0, space);
        const remainder = current.slice(space + 1);
        lines.push(remainder);
        columns = Array.from(remainder).reduce(
          (sum, glyph) => sum + (glyph.codePointAt(0)! > 0xff ? 2 : 1),
          0,
        );
      } else {
        lines.push("");
        columns = 0;
      }
    }
    lines[lines.length - 1] += char;
    columns += width;
  }
  return lines.join("\n");
}

/** Snapshot-only render: callers supply recipient-localized messages, never live rows. */
export function renderSummaryText(
  snapshot: DailySummarySnapshot,
  watermark: SummaryWatermark,
  contentHash: string,
  createdAt: string,
  locale: "en" | "zh-CN" | "zh-HK",
  t: SummaryTranslate,
): string {
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
  const header = [
    t("summary.heading"),
    `${clean(snapshot.workspace.name)} · ${clean(snapshot.tag.org)}`,
    snapshot.localDate,
  ];
  const totals = TOTALS.map(
    (key) => `${t(`summary.totals.${key}`)}: ${number(snapshot.totals[key])}`,
  ).join(" · ");
  const footer = [
    totals,
    t("summary.generated", { date: generated, zone: snapshot.timeZone }),
    clean(watermark.text, 400),
    t("summary.hash", { hash: contentHash }),
  ];
  function document(itemLimit: number, projectLimit: number) {
    const blocks = [header.join("\n")];
    for (const project of snapshot.projects.slice(0, projectLimit)) {
      const lines = [clean(project.name)];
      if (project.stage) lines.push(t(`projects.stages.${project.stage}`));
      if (project.leadName)
        lines.push(t("summary.lead", { name: clean(project.leadName) }));
      if (project.dueAt)
        lines.push(t("summary.due", { date: date(project.dueAt) }));
      lines.push(
        t("summary.recorded", {
          percent: `${number(project.deliveryProgress)}%`,
        }),
        t(`timeline.risk.level.${project.risk.level}`),
      );
      lines.push(
        TOTALS.filter((key) => key !== "projects")
          .map(
            (key) =>
              `${t(`summary.totals.${key}`)}: ${number(project.counts[key])}`,
          )
          .join(" · "),
      );
      if (project.finance) {
        const money = (value: string) =>
          project.finance!.currency
            ? new Intl.NumberFormat(locale, {
                style: "currency",
                currency: project.finance!.currency,
              }).format(Number(value))
            : value;
        lines.push(
          project.finance.contractAmount
            ? t("summary.finance", {
                collected: money(project.finance.collectedAmount),
                contract: money(project.finance.contractAmount),
              })
            : t("summary.financeNoContract", {
                collected: money(project.finance.collectedAmount),
              }),
        );
      }
      lines.push(
        t("summary.agentRuns", {
          completed: number(project.agentRuns.completedToday),
          pending: number(project.agentRuns.pendingReview),
        }),
      );
      for (const key of LISTS) {
        if (!project.counts[key]) continue;
        lines.push(
          `${t(`summary.lists.${key}`)} (${number(project.counts[key])})`,
        );
        const shown = project[key].slice(0, itemLimit);
        for (const task of shown)
          lines.push(
            `• #${task.number} ${clean(task.title)}${task.ownerName ? ` · ${clean(task.ownerName)}` : ""}${task.dueAt ? ` · ${t("summary.due", { date: date(task.dueAt) })}` : ""}`,
          );
        const omitted = project.counts[key] - shown.length;
        if (omitted > 0) lines.push(`…(+${omitted})`);
      }
      blocks.push(lines.join("\n"));
    }
    if (projectLimit < snapshot.projects.length)
      blocks.push(`…(+${snapshot.projects.length - projectLimit})`);
    blocks.push(footer.join("\n"));
    return (
      blocks.join("\n\n").split("\n").map(wrapSummaryLine).join("\n") + "\n"
    );
  }
  let itemLimit = 20,
    projectLimit = snapshot.projects.length;
  let result = document(itemLimit, projectLimit);
  while (
    result.length > SUMMARY_TEXT_LIMIT &&
    (itemLimit > 0 || projectLimit > 0)
  ) {
    if (itemLimit > 0) itemLimit--;
    else projectLimit--;
    result = document(itemLimit, projectLimit);
  }
  return result;
}
