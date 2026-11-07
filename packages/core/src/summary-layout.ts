import type { SummaryLayout, SummaryLayoutLimits } from "@taff/schemas";
import { FULL_LAYOUT } from "@taff/schemas";

// The builder is shared with the web page, so it lives in @taff/schemas.
export {
  buildSummaryLayout,
  cleanSummaryText,
  FULL_LAYOUT,
  type SummaryLayoutLimits,
  type SummaryLocale,
} from "@taff/schemas";

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
  header: 382, // padding, two title lines, chip, two place lines, date
  kpis: 308, // gap, two tile rows, row gap, trailing gap
  project: 504, // padding, name, meta, reasons, bars, agent runs, gap
  section: 80, // rule, heading with count pill
  sectionMore: 30,
  item: 96, // two title lines, detail, spacing
  moreProjects: 50,
  footer: 272, // rule, two-line time, confidential and watermark, hash
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
