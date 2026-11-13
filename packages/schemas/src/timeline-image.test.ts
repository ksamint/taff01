import { describe, expect, it } from "vitest";
import {
  buildTimelineLayout,
  timelineImageInputSchema,
} from "./timeline-image";
import {
  timelineFixture,
  timelineImageFixture,
} from "./timeline-image.fixture";

describe("timeline image layout", () => {
  it.each(["en", "zh-CN", "zh-HK"] as const)(
    "builds a bounded localized %s contract",
    (locale) => {
      const input = timelineImageFixture(locale, 61);
      expect(timelineImageInputSchema.parse(input)).toEqual(input);
      expect(input.layout.rows).toHaveLength(60);
      expect(input.layout.dependencies).toHaveLength(59);
      expect(input.layout.more).toContain("+1");
      expect(input.layout.height).toBeLessThanOrEqual(4000);
      expect(
        input.layout.rows.every((r) => r.x >= 440 && r.forecastX < 1552),
      ).toBe(true);
    },
  );
  it("uses civil dates across DST and fits distant forecasts without daily tick allocation", () => {
    const timeline = timelineFixture();
    timeline.items[0].forecastEnd = "2199-12-31";
    const labels = {
      title: "",
      subtitle: "",
      today: "",
      footer: "",
      more: String,
      date: (s: string) => s,
    };
    const layout = buildTimelineLayout(timeline, "en", labels, "a".repeat(64));
    expect(layout.ticks).toHaveLength(7);
    expect(layout.rows[0].forecastX).toBeLessThan(1552);
    expect(
      buildTimelineLayout(
        { ...timeline, timeZone: "Asia/Shanghai" },
        "en",
        labels,
        "a".repeat(64),
      ),
    ).toEqual(layout);
    expect(
      buildTimelineLayout(
        { ...timeline, items: [], dependencies: [] },
        "en",
        labels,
        "a".repeat(64),
      ).height,
    ).toBe(320);
  });
  it("rejects nonfinite coordinates, oversized arrays, text, and unknown fields", () => {
    for (const patch of [
      { height: 4001 },
      { todayX: Infinity },
      { title: "x".repeat(201) },
      { rows: Array(61).fill(timelineImageFixture("en").layout.rows[0]) },
      { svg: "<svg/>" },
    ]) {
      const input = timelineImageFixture("en");
      expect(
        timelineImageInputSchema.safeParse({
          ...input,
          layout: { ...input.layout, ...patch },
        }).success,
      ).toBe(false);
    }
  });
});
