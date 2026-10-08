import type { CalendarScheduleInput } from "@taff/schemas";
import { calendarWallToInstant, shiftCalendarSeries } from "@taff/schemas";
import { describe, expect, it } from "vitest";
import {
  expandCalendarSchedule,
  normalizeCalendarSchedule,
} from "./calendar-recurrence";

const schedule = (
  start: string,
  zone = "America/New_York",
  rrule: string | null = "FREQ=DAILY;COUNT=4",
  duration = 3600000,
): CalendarScheduleInput => {
  const startAt = calendarWallToInstant(start, zone);
  return {
    startAt,
    endAt: new Date(Date.parse(startAt) + duration).toISOString(),
    timeZone: zone,
    rrule,
  };
};
const between = (value: CalendarScheduleInput, from: string, to: string) =>
  expandCalendarSchedule(normalizeCalendarSchedule(value), { from, to })
    .occurrences;
describe("bounded calendar recurrence", () => {
  it("keeps09 local across spring and autumn with exact elapsed duration", () => {
    const spring = between(
      schedule("2026-03-06T09:00"),
      "2026-03-06T00:00:00Z",
      "2026-03-11T00:00:00Z",
    );
    expect(spring.map((o) => o.startAt)).toEqual([
      "2026-03-06T14:00:00.000Z",
      "2026-03-07T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-09T13:00:00.000Z",
    ]);
    expect(
      spring.every(
        (o) => Date.parse(o.endAt) - Date.parse(o.startAt) === 3600000,
      ),
    ).toBe(true);
    const fall = between(
      schedule("2026-10-30T09:00"),
      "2026-10-30T00:00:00Z",
      "2026-11-04T00:00:00Z",
    );
    expect(fall.map((o) => o.startAt)).toEqual([
      "2026-10-30T13:00:00.000Z",
      "2026-10-31T13:00:00.000Z",
      "2026-11-01T14:00:00.000Z",
      "2026-11-02T14:00:00.000Z",
    ]);
  });
  it("gap follows pre-transition offset and counts as an occurrence", () => {
    const gap = between(
      schedule("2026-03-07T02:30", "America/New_York", "FREQ=DAILY;COUNT=3"),
      "2026-03-07T00:00:00Z",
      "2026-03-11T00:00:00Z",
    );
    expect(gap.map((o) => o.startAt)).toEqual([
      "2026-03-07T07:30:00.000Z",
      "2026-03-08T07:30:00.000Z",
      "2026-03-09T06:30:00.000Z",
    ]);
  });
  it("fold chooses first instant, but an explicitly anchored second-fold start stays exact", () => {
    expect(calendarWallToInstant("2026-11-01T01:30", "America/New_York")).toBe(
      "2026-11-01T05:30:00.000Z",
    );
    const fold = between(
      schedule("2026-10-31T01:30", "America/New_York", "FREQ=DAILY;COUNT=3"),
      "2026-10-31T00:00:00Z",
      "2026-11-04T00:00:00Z",
    );
    expect(fold.map((o) => o.startAt)).toEqual([
      "2026-10-31T05:30:00.000Z",
      "2026-11-01T05:30:00.000Z",
      "2026-11-02T06:30:00.000Z",
    ]);
    expect(
      between(
        {
          startAt: "2026-11-01T06:30:00Z",
          endAt: "2026-11-01T07:30:00Z",
          timeZone: "America/New_York",
          rrule: "FREQ=DAILY;COUNT=1",
        },
        "2026-11-01T00:00:00Z",
        "2026-11-03T00:00:00Z",
      )[0].startAt,
    ).toBe("2026-11-01T06:30:00.000Z");
  });
  it("supports half-hour DST and quarter-hour offsets without whole-hour assumptions", () => {
    expect(
      calendarWallToInstant("2026-10-04T02:15", "Australia/Lord_Howe"),
    ).toBe("2026-10-03T15:45:00.000Z");
    const lord = between(
      schedule("2026-10-03T09:00", "Australia/Lord_Howe", "FREQ=DAILY;COUNT=3"),
      "2026-10-02T00:00:00Z",
      "2026-10-06T00:00:00Z",
    );
    expect(lord.map((o) => o.startAt)).toEqual([
      "2026-10-02T22:30:00.000Z",
      "2026-10-03T22:00:00.000Z",
      "2026-10-04T22:00:00.000Z",
    ]);
    expect(calendarWallToInstant("2026-10-09T09:00", "Asia/Kathmandu")).toBe(
      "2026-10-09T03:15:00.000Z",
    );
    expect(
      normalizeCalendarSchedule(schedule("2026-10-09T09:00", "+0800")).timeZone,
    ).toBe("+08:00");
  });
  it("monthly31 skips invalid months without consumingCOUNT; leap yearly skips invalid dates", () => {
    const monthly = between(
      schedule("2026-01-31T09:00", "UTC", "FREQ=MONTHLY;COUNT=3"),
      "2026-03-01T00:00:00Z",
      "2026-05-02T00:00:00Z",
    );
    expect(monthly.map((o) => o.startAt)).toEqual(["2026-03-31T09:00:00.000Z"]);
    const later = between(
      schedule("2026-01-31T09:00", "UTC", "FREQ=MONTHLY;COUNT=3"),
      "2026-05-01T00:00:00Z",
      "2026-06-02T00:00:00Z",
    );
    expect(later.map((o) => o.startAt)).toEqual(["2026-05-31T09:00:00.000Z"]);
    const leap = between(
      schedule("2024-02-29T09:00", "UTC", "FREQ=YEARLY;COUNT=2"),
      "2028-02-01T00:00:00Z",
      "2028-03-05T00:00:00Z",
    );
    expect(leap.map((o) => o.startAt)).toEqual(["2028-02-29T09:00:00.000Z"]);
  });
  it("UNTIL is an inclusive actualUTC instant across offset changes", () => {
    const input = schedule(
      "2026-03-07T09:00",
      "America/New_York",
      "FREQ=DAILY;UNTIL=20260309T130000Z",
    );
    expect(
      between(input, "2026-03-07T00:00:00Z", "2026-03-12T00:00:00Z").map(
        (o) => o.startAt,
      ),
    ).toEqual([
      "2026-03-07T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
      "2026-03-09T13:00:00.000Z",
    ]);
  });
  it("nonrecurring overlap includes overnight block and excludes exact endpoints", () => {
    const input = {
      startAt: "2026-10-08T23:00:00Z",
      endAt: "2026-10-09T01:00:00Z",
      timeZone: "UTC",
      rrule: null,
    };
    expect(
      between(input, "2026-10-09T00:00:00Z", "2026-10-10T00:00:00Z"),
    ).toHaveLength(1);
    expect(
      between(input, "2026-10-09T01:00:00Z", "2026-10-10T00:00:00Z"),
    ).toHaveLength(0);
    expect(
      between(input, "2026-10-08T00:00:00Z", "2026-10-08T23:00:00Z"),
    ).toHaveLength(0);
  });
  it("recurring overlap includes prior-day start and retains stable actual start", () => {
    const input = schedule(
      "2026-10-08T23:00",
      "UTC",
      "FREQ=DAILY",
      3 * 3600000,
    );
    expect(
      between(input, "2026-10-09T00:00:00Z", "2026-10-09T01:00:00Z"),
    ).toEqual([
      {
        startAt: "2026-10-08T23:00:00.000Z",
        endAt: "2026-10-09T02:00:00.000Z",
      },
    ]);
  });
  it("analytical seek preserves ancientdaily/weekly/monthly/yearly interval phase", () => {
    expect(
      between(
        schedule("1970-01-01T09:00", "UTC", "FREQ=DAILY;INTERVAL=2"),
        "2199-10-08T00:00:00Z",
        "2199-10-12T00:00:00Z",
      ).map((o) => o.startAt),
    ).toEqual(["2199-10-09T09:00:00.000Z", "2199-10-11T09:00:00.000Z"]);
    const weekly = between(
      schedule(
        "1970-01-02T09:00",
        "UTC",
        "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;WKST=MO",
      ),
      "2026-10-05T00:00:00Z",
      "2026-10-20T00:00:00Z",
    );
    expect(weekly.map((o) => o.startAt)).toEqual([
      "2026-10-05T09:00:00.000Z",
      "2026-10-09T09:00:00.000Z",
      "2026-10-19T09:00:00.000Z",
    ]);
    expect(
      between(
        schedule("1970-01-30T09:00", "UTC", "FREQ=MONTHLY;INTERVAL=2"),
        "2026-10-01T00:00:00Z",
        "2026-12-01T00:00:00Z",
      ).map((o) => o.startAt),
    ).toEqual(["2026-11-30T09:00:00.000Z"]);
    expect(
      between(
        schedule("1972-02-29T09:00", "UTC", "FREQ=YEARLY;INTERVAL=4"),
        "2032-02-01T00:00:00Z",
        "2032-03-02T00:00:00Z",
      ).map((o) => o.startAt),
    ).toEqual(["2032-02-29T09:00:00.000Z"]);
  });
  it("canonicalizes raw rule ordering/case, accepts last day and rejects unsupported patterns", () => {
    expect(
      normalizeCalendarSchedule(
        schedule(
          "2026-10-09T09:00",
          "UTC",
          "byday=FR,MO;freq=weekly;interval=2;wkst=MO",
        ),
      ).rrule,
    ).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;WKST=MO");
    expect(
      normalizeCalendarSchedule(
        schedule("2026-01-31T09:00", "UTC", "FREQ=MONTHLY;BYMONTHDAY=-1"),
      ).rrule,
    ).toBe("FREQ=MONTHLY;BYMONTHDAY=-1");
  });
  it.each([
    "FREQ=SECONDLY",
    "FREQ=HOURLY",
    "FREQ=DAILY;INTERVAL=0",
    "FREQ=DAILY;COUNT=1001",
    "FREQ=DAILY;COUNT=2;UNTIL=20261010T090000Z",
    "FREQ=DAILY;BYDAY=MO",
    "FREQ=WEEKLY;BYDAY=1FR",
    "FREQ=MONTHLY;BYMONTHDAY=1,15",
    "FREQ=MONTHLY;BYMONTHDAY=0",
    "FREQ=MONTHLY;BYSETPOS=-1",
    "FREQ=DAILY;BYHOUR=9,10",
    "FREQ=WEEKLY;WKST=BAD",
    "FREQ=DAILY\nDTSTART=20261009T090000Z",
    "FREQ=DAILY;FREQ=WEEKLY",
    "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30",
    "FREQ=WEEKLY;BYDAY=MO",
    "FREQ=DAILY;UNTIL=20260230T090000Z",
  ])("rejects adversarial/anchor-mismatched rule %s", (rrule) =>
    expect(() =>
      normalizeCalendarSchedule(schedule("2026-10-09T09:00", "UTC", rrule)),
    ).toThrow("invalid_input"),
  );
  it("whole-series later-occurrence move usescivil delta and transforms weeklyphase", () => {
    const input = schedule(
      "2026-02-27T09:00",
      "America/New_York",
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR;WKST=MO",
    );
    const shifted = shiftCalendarSeries(
      input,
      "2026-03-13T13:00:00Z",
      "2026-03-16T14:00:00Z",
    );
    expect(shifted).toMatchObject({
      startAt: "2026-03-02T15:00:00.000Z",
      endAt: "2026-03-02T16:00:00.000Z",
      rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=TH,MO;WKST=TH",
    });
    expect(normalizeCalendarSchedule(shifted).rrule).toBe(
      "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;WKST=TH",
    );
  });
  it("whole-series resize adjusts duration and shiftsUNTIL in walltime", () => {
    const input = schedule(
      "2026-03-01T09:00",
      "America/New_York",
      "FREQ=DAILY;UNTIL=20260320T130000Z",
    );
    const shifted = shiftCalendarSeries(
      input,
      "2026-03-09T13:00:00Z",
      "2026-03-10T14:00:00Z",
      "2026-03-10T16:00:00Z",
    );
    expect(shifted).toMatchObject({
      startAt: "2026-03-02T15:00:00.000Z",
      endAt: "2026-03-02T17:00:00.000Z",
      rrule: "FREQ=DAILY;UNTIL=20260321T140000Z",
    });
  });
});
