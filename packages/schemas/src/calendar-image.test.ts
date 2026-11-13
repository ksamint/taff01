import { describe, expect, it } from "vitest";
import {
  buildCalendarLayout,
  type CalendarImageQuery,
  calendarImageInputSchema,
  calendarImageWindow,
} from "./calendar-image";
import {
  calendarImageFixture,
  calendarLabelsFixture,
  calendarOccurrenceFixture,
} from "./calendar-image.fixture";
import type { CalendarViewData } from "./calendar-read";

const query: CalendarImageQuery = {
  visibleDate: "2026-03-08",
  mode: "week",
  timeZone: "America/New_York",
};
const source = (
  occurrences: CalendarViewData["occurrences"] = [],
  truncated = false,
): CalendarViewData => ({ occurrences, unscheduled: [], truncated });
const build = (input = source(), q = query) =>
  buildCalendarLayout(
    input,
    q,
    "en",
    calendarLabelsFixture("en"),
    "a".repeat(64),
  );

describe("calendar image layout", () => {
  it.each(["en", "zh-CN", "zh-HK"] as const)(
    "builds week and month localized %s contracts",
    (locale) => {
      for (const mode of ["week", "month"] as const) {
        const input = calendarImageFixture(locale, mode);
        expect(calendarImageInputSchema.parse(input)).toEqual(input);
        expect(input.layout.cells).toHaveLength(mode === "week" ? 7 : 42);
        expect(input.layout.height).toBeLessThanOrEqual(4000);
      }
    },
  );
  it.each([
    ["2021-02-12", 28, "2021-02-01", "2021-03-01"],
    ["2026-04-12", 35, "2026-03-30", "2026-05-04"],
    ["2026-03-08", 42, "2026-02-23", "2026-04-06"],
  ] as const)(
    "includes complete surrounding weeks for %s",
    (visibleDate, count, startDate, endDate) => {
      const q = { ...query, visibleDate, mode: "month" as const };
      expect(calendarImageWindow(q)).toMatchObject({ startDate, endDate });
      const layout = build(source(), q);
      expect(layout.cells).toHaveLength(count);
      expect(
        layout.cells.every(
          (cell) => cell.items.length === 0 && cell.more === null,
        ),
      ).toBe(true);
      expect(layout.sourceTruncatedNote).toBeNull();
    },
  );
  it.each([
    ["2026-03-08", "2026-03-09", 23],
    ["2026-11-01", "2026-11-02", 25],
  ] as const)("classifies the %s DST day as all-day", (date, next, hours) => {
    const event = calendarOccurrenceFixture(
      1,
      `${date}T00:00`,
      `${next}T00:00`,
    );
    expect(
      (Date.parse(event.endAt) - Date.parse(event.startAt)) / 3600000,
    ).toBe(hours);
    const layout = build(source([event]), { ...query, visibleDate: date });
    expect(layout.cells.flatMap((cell) => cell.items)).toHaveLength(1);
    expect(layout.cells[6].items[0].allDay).toBe(true);
    const spanning = {
      ...event,
      startAt: new Date(Date.parse(event.startAt) - 3600000).toISOString(),
      endAt: new Date(Date.parse(event.endAt) + 7200000).toISOString(),
    };
    expect(
      build(source([spanning]), { ...query, visibleDate: date }).cells[6]
        .items[0],
    ).toMatchObject({ allDay: false, detail: "00:00–24:00" });
    const window = calendarImageWindow({ ...query, visibleDate: date });
    expect((Date.parse(window.to) - Date.parse(window.from)) / 3600000).toBe(
      6 * 24 + hours,
    );
  });
  it("caps eight total including all-day and keeps unknown source overflow separate", () => {
    const events = Array.from({ length: 9 }, (_, index) =>
      calendarOccurrenceFixture(index, "2026-03-02T09:00", "2026-03-02T10:00"),
    );
    events[0] = calendarOccurrenceFixture(
      0,
      "2026-03-02T00:00",
      "2026-03-03T00:00",
    );
    expect(build(source(events.slice(0, 8))).cells[0].more).toBeNull();
    const layout = build(source(events, true));
    expect(layout.cells[0].items).toHaveLength(8);
    expect(layout.cells[0].items[0].allDay).toBe(true);
    expect(layout.cells[0].more).toBe("+1 more");
    expect(layout.sourceTruncatedNote).toBe("Some source results were omitted");
    expect(build(source([], true)).cells.every((c) => c.more === null)).toBe(
      true,
    );
    expect(build(source([...events].reverse(), true))).toEqual(layout);
  });
  it("splits and clips timed multi-day spans, with exclusive midnight ends and occurrence deduplication", () => {
    const event = calendarOccurrenceFixture(
      1,
      "2026-03-01T22:00",
      "2026-03-04T00:00",
    );
    const input = source([
      event,
      { ...event, id: "duplicate" },
      calendarOccurrenceFixture(2, "2026-03-09T00:00", "2026-03-10T00:00"),
    ]);
    const layout = build(input);
    expect(layout.cells.map((c) => c.items.length)).toEqual([
      1, 1, 0, 0, 0, 0, 0,
    ]);
    expect(layout.cells[0].items[0]).toMatchObject({
      allDay: false,
      continuesBefore: true,
      continuesAfter: true,
      detail: "00:00–24:00",
    });
    expect(layout.cells[1].items[0]).toMatchObject({
      continuesBefore: true,
      continuesAfter: false,
    });
    const eod = calendarOccurrenceFixture(
      3,
      "2026-03-02T00:00",
      "2026-03-02T23:59:59.999",
    );
    expect(build(source([eod])).cells[0].items[0].allDay).toBe(false);
  });
  it("uses viewer timezone, clips month edges and omits skipped civil dates", () => {
    const event = calendarOccurrenceFixture(
      1,
      "2026-03-01T23:30",
      "2026-03-02T00:30",
      "UTC",
    );
    expect(
      build(source([event]), { ...query, timeZone: "UTC" }).cells[0].items,
    ).toHaveLength(1);
    expect(build(source([event])).cells[0].items).toHaveLength(0);
    const spanning = calendarOccurrenceFixture(
      2,
      "2026-02-01T00:00",
      "2026-05-01T00:00",
    );
    const month = build(source([spanning]), { ...query, mode: "month" });
    expect(month.cells.every((cell) => cell.items.length === 1)).toBe(true);
    expect(month.cells[0].inMonth).toBe(false);
    const skip = calendarOccurrenceFixture(
      3,
      "2011-12-29T00:00",
      "2012-01-01T00:00",
      "Pacific/Apia",
    );
    const apia = build(source([skip]), {
      ...query,
      visibleDate: "2011-12-30",
      timeZone: "Pacific/Apia",
    });
    expect(apia.cells[4].items).toHaveLength(0);
  });
  it("bounds hostile display input and rejects invalid query dates, modes, zones and occurrences", () => {
    for (const patch of [
      { visibleDate: "2026-02-30" },
      { mode: "day" },
      { timeZone: "Not/AZone" },
      { timeZone: "+08:00" },
    ]) {
      expect(() =>
        calendarImageWindow({ ...query, ...patch } as CalendarImageQuery),
      ).toThrow();
    }
    const event = calendarOccurrenceFixture(
      1,
      "2026-03-02T09:00",
      "2026-03-02T10:00",
    );
    expect(() => build(source([{ ...event, endAt: event.startAt }]))).toThrow();
    for (const patch of [
      { height: 4001 },
      { height: Infinity },
      {
        cells: Array(43).fill(
          calendarImageFixture("en", "week").layout.cells[0],
        ),
      },
      { title: "x".repeat(201) },
      { svg: "<svg/>" },
    ]) {
      const input = calendarImageFixture("en", "week");
      expect(
        calendarImageInputSchema.safeParse({
          ...input,
          layout: { ...input.layout, ...patch },
        }).success,
      ).toBe(false);
    }
  });

  it("fits the maximum separate all-day and timed bands across six weeks", () => {
    const events = [];
    for (let week = 0; week < 6; week++) {
      const day = new Date(Date.UTC(2026, 1, 23 + week * 7));
      const monday = day.toISOString().slice(0, 10);
      day.setUTCDate(day.getUTCDate() + 1);
      const tuesday = day.toISOString().slice(0, 10);
      for (let index = 0; index < 8; index++) {
        events.push(
          calendarOccurrenceFixture(
            week * 16 + index,
            `${monday}T00:00`,
            `${tuesday}T00:00`,
          ),
        );
        events.push(
          calendarOccurrenceFixture(
            week * 16 + 8 + index,
            `${tuesday}T09:00`,
            `${tuesday}T10:00`,
          ),
        );
      }
    }
    const layout = build(source(events), { ...query, mode: "month" });
    expect(layout.height).toBe(3728);
    expect(layout.cells.every((cell) => cell.items.length <= 8)).toBe(true);
  });
});
