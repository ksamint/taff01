import type {
  DailySummarySnapshot,
  SummaryLayout,
  SummaryTranslate,
  SummaryWatermark,
} from "@taff/schemas";
import {
  buildSummaryLayout,
  fitSummaryLayout,
  type SummaryLocale,
} from "./summary-layout";

export type { SummaryTranslate } from "@taff/schemas";
export const SUMMARY_TEXT_LIMIT = 4000;
export const SUMMARY_TEXT_VERSION = "text-2";
const COLUMNS = 72;
const RULE = "─".repeat(28);

const isWide = (char: string) =>
  /[ᄀ-ᅟ⺀-꓏가-힯豈-﫿︐-﹯＀-｠\u{1f000}-\u{1ffff}]/u.test(char);
const columnsOf = (text: string) =>
  Array.from(text).reduce((sum, char) => sum + (isWide(char) ? 2 : 1), 0);

/** A display column is one Latin glyph or half a full-width CJK glyph. */
export function wrapSummaryLine(text: string, indent = ""): string {
  const lines = [""];
  let columns = 0;
  for (const char of text) {
    const width = isWide(char) ? 2 : 1;
    if (columns + width > COLUMNS) {
      const current = lines[lines.length - 1];
      const space = current.lastIndexOf(" ");
      if (space > indent.length) {
        lines[lines.length - 1] = current.slice(0, space);
        const remainder = indent + current.slice(space + 1);
        lines.push(remainder);
        columns = columnsOf(remainder);
      } else {
        lines.push(indent);
        columns = columnsOf(indent);
      }
    }
    lines[lines.length - 1] += char;
    columns += width;
  }
  return lines.join("\n");
}

/**
 * Joins `label value` tokens with " · " and breaks only between tokens, so a
 * label never separates from its value. A single overlong token falls back to
 * display-width wrapping.
 */
function joinTokens(tokens: string[], indent = ""): string[] {
  const lines: string[] = [];
  let line = "";
  for (const token of tokens.filter(Boolean)) {
    const next = line ? `${line} · ${token}` : `${indent}${token}`;
    if (line && columnsOf(next) > COLUMNS) {
      lines.push(line);
      line = `${indent}${token}`;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.flatMap((value) => wrapSummaryLine(value, indent).split("\n"));
}

/** text-2: plain text for chat apps, no Markdown and no emoji. */
export function renderSummaryLayoutText(layout: SummaryLayout): string {
  const cjk = layout.locale !== "en";
  const join = cjk ? "、" : ", ";
  const lines: string[] = [
    ...joinTokens([layout.header.title, layout.header.audience]),
    ...joinTokens([layout.header.workspace, layout.header.recipient]),
    ...joinTokens([layout.header.date]),
    RULE,
    ...joinTokens(layout.kpis.map((kpi) => `${kpi.label} ${kpi.value}`)),
  ];
  if (layout.empty) lines.push("", ...joinTokens([layout.empty]));
  for (const project of layout.projects) {
    lines.push("");
    const name = cjk ? `【${project.name}】` : `▌${project.name}`;
    lines.push(...joinTokens([name, project.stage ?? "", project.risk.label]));
    if (project.risk.reasons.length)
      lines.push(...joinTokens([project.risk.reasons.join(join)]));
    lines.push(...joinTokens(project.meta));
    lines.push(
      ...joinTokens([project.progress.label, project.finance?.label ?? ""]),
    );
    if (project.agentRuns) lines.push(...joinTokens([project.agentRuns]));
    for (const section of project.sections) {
      lines.push(`${section.title} (${section.count})`);
      for (const item of section.items)
        lines.push(
          ...joinTokens(
            [`${item.number} ${item.title}`, item.detail],
            "  ",
          ).map((line, index) =>
            index === 0 ? `  ${line.trimStart()}` : line,
          ),
        );
      if (section.more) lines.push(`  ${section.more}`);
    }
  }
  if (layout.moreProjects) lines.push("", layout.moreProjects);
  lines.push(
    "",
    RULE,
    ...(layout.footer.generated
      ? wrapSummaryLine(layout.footer.generated).split("\n")
      : []),
    ...wrapSummaryLine(layout.footer.confidential).split("\n"),
    ...wrapSummaryLine(layout.footer.watermark).split("\n"),
    `${layout.footer.hashLabel} ${layout.footer.hashFull}`,
  );
  return `${lines.join("\n")}\n`;
}

/** Snapshot-only render: callers supply recipient-localized messages, never live rows. */
export function renderSummaryText(
  snapshot: DailySummarySnapshot,
  watermark: SummaryWatermark,
  contentHash: string,
  createdAt: string,
  locale: SummaryLocale,
  t: SummaryTranslate,
): string {
  const layout = fitSummaryLayout(
    (limits) =>
      buildSummaryLayout(
        snapshot,
        watermark,
        contentHash,
        createdAt,
        locale,
        t,
        limits,
      ),
    (candidate) =>
      renderSummaryLayoutText(candidate).length <= SUMMARY_TEXT_LIMIT,
  );
  return renderSummaryLayoutText(layout);
}
