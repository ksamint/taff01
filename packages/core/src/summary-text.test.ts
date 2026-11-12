import { readFileSync } from "node:fs";
import { dailySummarySnapshotSchema } from "@taff/schemas";
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/summary-golden.json";
import { summaryTranslate } from "./summary-messages";
import { summaryWatermark } from "./summary-model";
import { renderSummaryText, wrapSummaryLine } from "./summary-text";

const snapshot = dailySummarySnapshotSchema.parse(fixture.snapshot);
const render = (locale: "en" | "zh-CN" | "zh-HK", source = snapshot) =>
  renderSummaryText(
    source,
    summaryWatermark(source, null),
    fixture.contentHash,
    "2026-10-08T12:00:00.000Z",
    locale,
    summaryTranslate(locale),
  );
describe("summary text", () => {
  for (const locale of ["en", "zh-CN", "zh-HK"] as const) {
    it(`matches ${locale} snapshot-only golden with watermark and hash last`, () => {
      const text = render(locale);
      expect(text).toBe(
        readFileSync(
          new URL(`./__fixtures__/summary-text-${locale}.txt`, import.meta.url),
          "utf8",
        ),
      );
      expect(text.length).toBeLessThanOrEqual(4000);
      expect(text).not.toMatch(
        /comment|email|token|summary\.|timeline\.|projects\./i,
      );
      expect(text.replaceAll("\n", "").endsWith(fixture.contentHash)).toBe(
        true,
      );
      expect(text).toContain(summaryWatermark(snapshot, null).text);
    });
    // Allow the 100-project size fixture to finish on shared deploy hosts.
    it(`caps oversized ${locale} lists and projects with explicit omitted counts`, () => {
      const source = structuredClone(snapshot);
      source.projects = Array.from({ length: 100 }, () => ({
        ...snapshot.projects[0],
        name: "長".repeat(200),
        completedToday: Array.from(
          { length: 20 },
          () => snapshot.projects[0].completedToday[0],
        ),
        counts: { ...snapshot.projects[0].counts, completedToday: 123 },
      }));
      const text = render(locale, source);
      expect(text.length).toBeLessThanOrEqual(4000);
      expect(text).toMatch(/\+\d+ more|另有 \d+ (项|項)/);
      expect(text.replaceAll("\n", "").endsWith(fixture.contentHash)).toBe(
        true,
      );
    }, 120_000);
  }
  it("retains a complete maximum-length task title instead of silently shortening it", () => {
    const source = structuredClone(snapshot);
    source.projects[0].completedToday[0].title = "x".repeat(200);
    // Continuation lines are indented; joining them restores the title.
    expect(render("en", source).replaceAll(/\n */g, "")).toContain(
      "x".repeat(200),
    );
  });
  it("wraps Latin and CJK by display width without splitting surrogate pairs", () => {
    expect(wrapSummaryLine("a".repeat(73)).split("\n")).toEqual([
      "a".repeat(72),
      "a",
    ]);
    expect(wrapSummaryLine("中".repeat(37)).split("\n")).toEqual([
      "中".repeat(36),
      "中",
    ]);
    expect(wrapSummaryLine("😀".repeat(37)).split("\n")).toEqual([
      "😀".repeat(36),
      "😀",
    ]);
  });
});
