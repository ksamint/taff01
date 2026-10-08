import { describe, expect, it } from "vitest";
import { deadlineFields, deadlineIso } from "./task-date";

describe("task deadlines in the saved user zone", () => {
  it("uses local end-of-day for date-only inputs and preserves explicit wall time", () => {
    expect(deadlineIso("2026-10-09", "", "Asia/Singapore")).toBe(
      "2026-10-09T15:59:59.999Z",
    );
    expect(
      deadlineFields("2026-10-09T15:59:59.999Z", "Asia/Singapore"),
    ).toEqual({ date: "2026-10-09", time: "" });
    expect(deadlineIso("2026-07-09", "09:30", "America/New_York")).toBe(
      "2026-07-09T13:30:00.000Z",
    );
    expect(deadlineIso("2026-01-09", "09:30", "America/New_York")).toBe(
      "2026-01-09T14:30:00.000Z",
    );
    expect(deadlineIso("", "", "Asia/Singapore")).toBeNull();
  });
  it("rejects impossible dates and nonexistent daylight-saving wall times", () => {
    expect(() =>
      deadlineIso("2026-02-30", "09:00", "Asia/Singapore"),
    ).toThrow();
    expect(() =>
      deadlineIso("2026-03-08", "02:30", "America/New_York"),
    ).toThrow();
    const repeated = deadlineIso("2026-11-01", "01:30", "America/New_York");
    expect(deadlineFields(repeated, "America/New_York")).toEqual({
      date: "2026-11-01",
      time: "01:30",
    });
  });
});
