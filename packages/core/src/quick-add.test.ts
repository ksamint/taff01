import { describe, expect, it } from "vitest";
import { localDate, parseQuickAddText, zonedInstant } from "./quick-add";

const options = {
  members: [
    { id: "alex", name: "Alex Chen", kind: "person" as const },
    { id: "research", name: "Research Agent", kind: "agent" as const },
  ],
  projects: [{ id: "checkout", name: "Checkout v2" }],
  ownerId: "alex",
  tz: "Asia/Singapore",
  now: new Date("2026-10-08T23:30:00Z"),
};
describe("quick add editable parsing", () => {
  it("uses actual local today and separates editable fields", () => {
    expect(localDate(options.now, options.tz)).toBe("2026-10-09");
    expect(
      parseQuickAddText(
        'Ship report tomorrow at 2:30pm @Research #"Checkout v2" !high +launch',
        options,
      ),
    ).toMatchObject({
      title: "Ship report",
      ownerId: "alex",
      workerId: "research",
      projectId: "checkout",
      priority: 2,
      labels: ["launch"],
      dueDate: "2026-10-10",
      dueTime: "14:30",
      dueAt: "2026-10-10T06:30:00.000Z",
      warnings: [],
    });
  });
  it("parses Chinese without fixed date or English fragments", () => {
    expect(
      parseQuickAddText("交付報告 後天 下午2點半 !緊急 @Research", options),
    ).toMatchObject({
      title: "交付報告",
      dueDate: "2026-10-11",
      dueTime: "14:30",
      priority: 1,
      workerId: "research",
    });
    expect(parseQuickAddText("檢查 大後天", options).dueDate).toBe(
      "2026-10-12",
    );
  });
  it("preserves ambiguous and unknown values as warnings", () => {
    const result = parseQuickAddText("Send @Alex @Nobody #Unknown", {
      ...options,
      members: [
        ...options.members,
        { id: "other", name: "Alex Smith", kind: "person" },
      ],
    });
    expect(result).toMatchObject({
      ownerId: "alex",
      workerId: null,
      projectId: null,
      warnings: ["ambiguous_member", "unknown_member", "unknown_project"],
      unresolved: ["Alex", "Nobody", "Unknown"],
    });
  });
  it("does not normalize impossible dates or times into another day", () => {
    const result = parseQuickAddText("Do 2026-02-30 at 25:90", options);
    expect(result.warnings).toEqual(["invalid_date", "invalid_time"]);
    expect(result.dueAt).toBeNull();
  });
  it("date-only due means local end-of-day deadline", () => {
    expect(parseQuickAddText("Read today", options)).toMatchObject({
      dueDate: "2026-10-09",
      dueTime: null,
      dueAt: "2026-10-09T15:59:59.999Z",
    });
  });
  it("time-only uses current local day, quoted person resolves", () => {
    expect(
      parseQuickAddText('Read at 9am @"Alex Chen"', options),
    ).toMatchObject({
      title: "Read",
      ownerId: "alex",
      dueDate: "2026-10-09",
      dueTime: "09:00",
    });
  });
  it("rejects DST gap, resolves ordinary DST-zone dates", () => {
    expect(zonedInstant("2026-03-08", "02:30", "America/New_York")).toBeNull();
    expect(
      zonedInstant("2026-07-08", "14:30", "America/New_York")?.toISOString(),
    ).toBe("2026-07-08T18:30:00.000Z");
    expect(
      parseQuickAddText("Work 2026-03-08 02:30", {
        ...options,
        tz: "America/New_York",
      }).warnings,
    ).toEqual(["invalid_time"]);
  });
  it("next weekday means next calendar week", () => {
    expect(parseQuickAddText("Plan next monday", options).dueDate).toBe(
      "2026-10-12",
    );
    expect(parseQuickAddText("Plan 下週二", options).dueDate).toBe(
      "2026-10-13",
    );
  });
});
