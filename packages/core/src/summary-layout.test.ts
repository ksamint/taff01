import {
  dailySummarySnapshotSchema,
  summaryImageLayoutInputSchema,
  summaryLayoutSchema,
} from "@taff/schemas";
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/summary-golden.json";
import {
  buildSummaryLayout,
  estimateSummaryImageHeight,
  fitSummaryLayout,
  IMAGE_HEIGHT_BUDGET,
} from "./summary-layout";
import { summaryTranslate } from "./summary-messages";
import { summaryWatermark } from "./summary-model";

const snapshot = dailySummarySnapshotSchema.parse(fixture.snapshot);
const layoutFor = (
  locale: "en" | "zh-CN" | "zh-HK",
  source = snapshot,
  limits?: { items: number; projects: number },
) =>
  buildSummaryLayout(
    source,
    summaryWatermark(source, null),
    fixture.contentHash,
    "2026-10-08T12:00:00.000Z",
    locale,
    summaryTranslate(locale),
    limits,
  );

describe("summary layout", () => {
  for (const locale of ["en", "zh-CN", "zh-HK"] as const) {
    it(`is a valid, fully localized ${locale} layout`, () => {
      const layout = layoutFor(locale);
      expect(summaryLayoutSchema.parse(layout)).toEqual(layout);
      expect(
        summaryImageLayoutInputSchema.parse({
          layout,
          watermark: summaryWatermark(snapshot, null),
          contentHash: fixture.contentHash,
        }).layout,
      ).toEqual(layout);
      const text = JSON.stringify(layout);
      expect(text).not.toMatch(
        /summary\.|timeline\.|projects\.stages|audience\.kind|comment|email|token/i,
      );
      expect(layout.kpis.map((kpi) => kpi.key)).toEqual([
        "projects",
        "open",
        "completedToday",
        "dueToday",
        "overdue",
        "blocked",
        "inReview",
      ]);
      expect(layout.footer.hashFull).toBe(fixture.contentHash);
      expect(layout.footer.hashShort).toBe("405ddea3…3c21");
    });
  }

  it("carries the timeline's risk and tones the blocked tile", () => {
    const layout = layoutFor("en");
    expect(layout.projects[0].risk).toEqual({
      level: "medium",
      label: "Watch",
      reasons: ["A task is blocked"],
    });
    expect(layout.kpis.find((kpi) => kpi.key === "blocked")?.tone).toBe(
      "warning",
    );
    expect(layout.kpis.find((kpi) => kpi.key === "overdue")?.tone).toBe(
      "neutral",
    );
    expect(layout.projects[0].progress.percent).toBe(60);
    expect(layout.projects[0].finance?.percent).toBe(40);
  });

  it("drops finance and names when the recipient switches them off", () => {
    const source = structuredClone(snapshot);
    source.projects[0].finance = null;
    source.projects[0].leadName = null;
    for (const key of [
      "completedToday",
      "movedToday",
      "dueToday",
      "overdue",
      "blocked",
    ] as const)
      for (const task of source.projects[0][key]) task.ownerName = null;
    const layout = layoutFor("en", source);
    expect(layout.projects[0].finance).toBeNull();
    expect(JSON.stringify(layout)).not.toContain("Mia Wong");
    expect(JSON.stringify(layout)).not.toContain("Alex Chen");
    expect(JSON.stringify(layout)).not.toContain("HK$");
  });

  it("names omitted items and projects instead of hiding them", () => {
    const source = structuredClone(snapshot);
    source.projects = Array.from({ length: 3 }, () => snapshot.projects[0]);
    const layout = layoutFor("en", source, { items: 1, projects: 2 });
    expect(layout.projects).toHaveLength(2);
    expect(layout.moreProjects).toBe("+1 more projects");
    const moved = layout.projects[0].sections.find(
      (section) => section.key === "movedToday",
    );
    expect(moved?.items).toHaveLength(1);
    expect(moved?.more).toBe("+1 more");
  });

  it("fits a maximal snapshot under the image height budget", () => {
    const source = structuredClone(snapshot);
    source.projects = Array.from({ length: 100 }, () => ({
      ...snapshot.projects[0],
      completedToday: Array.from(
        { length: 20 },
        () => snapshot.projects[0].completedToday[0],
      ),
      counts: { ...snapshot.projects[0].counts, completedToday: 20 },
    }));
    const full = layoutFor("en", source);
    expect(estimateSummaryImageHeight(full)).toBeGreaterThan(
      IMAGE_HEIGHT_BUDGET,
    );
    const fitted = fitSummaryLayout(
      (limits) => layoutFor("en", source, limits),
      (layout) => estimateSummaryImageHeight(layout) <= IMAGE_HEIGHT_BUDGET,
    );
    expect(estimateSummaryImageHeight(fitted)).toBeLessThanOrEqual(
      IMAGE_HEIGHT_BUDGET,
    );
    expect(fitted.moreProjects ?? fitted.projects[0].sections[0].more).toMatch(
      /^\+\d+ more/,
    );
  });
});
