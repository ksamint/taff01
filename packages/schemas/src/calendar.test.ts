import { describe, expect, it } from "vitest";
import {
  calendarRangeSchema,
  calendarScheduleInputSchema,
  calendarWallToInstant,
  canonicalCalendarTimeZone,
  changeEventSchema,
  createTaskSchema,
  mcpCalendarListArgs,
  mcpCalendarSetArgs,
  mcpTasksCreateArgs,
  setTaskCalendarSchema,
  shiftCalendarSeries,
} from "./index";

const id = "00000000-0000-4000-8000-000000000001";
const schedule = {
  startAt: "2026-01-31T09:00:00Z",
  endAt: "2026-01-31T10:00:00Z",
  timeZone: "UTC",
  rrule: "FREQ=MONTHLY;BYMONTHDAY=-1",
};
describe("calendar shared trust boundaries and gestures", () => {
  it("shares atomic create and MCP calendar fields without permitting workspace/worker injection", () => {
    expect(
      createTaskSchema.parse({
        workspaceId: id,
        ownerId: id,
        title: "Slot",
        calendar: schedule,
      }).calendar,
    ).toEqual(schedule);
    expect(
      mcpTasksCreateArgs.parse({
        ownerId: id,
        title: "Slot",
        calendar: schedule,
      }).calendar,
    ).toEqual(schedule);
    expect(
      mcpTasksCreateArgs.safeParse({
        ownerId: id,
        title: "Slot",
        calendar: schedule,
        workspaceId: id,
      }).success,
    ).toBe(false);
    expect(
      mcpTasksCreateArgs.safeParse({ ownerId: id, title: "Slot", workerId: id })
        .success,
    ).toBe(false);
  });
  it.each([
    { ...schedule, endAt: schedule.startAt },
    { ...schedule, endAt: "2026-02-08T10:00:00Z" },
    { ...schedule, startAt: "1969-12-31T23:59:59Z" },
    { ...schedule, endAt: "2201-01-01T00:00:00Z" },
    { ...schedule, startAt: "2026-01-31T09:00:00" },
    { ...schedule, timeZone: "Not/AZone" },
    { ...schedule, rrule: "x".repeat(501) },
    { ...schedule, taskId: id },
  ])("rejects invalid schedule at REST/MCP boundary %j", (input) =>
    expect(calendarScheduleInputSchema.safeParse(input).success).toBe(false),
  );
  it("range and setters are strict versioned bounded inputs", () => {
    const range = { from: "2026-10-01T00:00:00Z", to: "2026-12-02T00:00:00Z" };
    expect(mcpCalendarListArgs.parse(range)).toEqual(
      calendarRangeSchema.parse(range),
    );
    for (const to of ["2026-10-01T00:00:00Z", "2026-12-03T00:00:00Z"])
      expect(calendarRangeSchema.safeParse({ ...range, to }).success).toBe(
        false,
      );
    expect(setTaskCalendarSchema.parse({ version: 1, schedule: null })).toEqual(
      { version: 1, schedule: null },
    );
    for (const version of [0, 1.5, -1])
      expect(
        mcpCalendarSetArgs.safeParse({ taskId: id, version, schedule }).success,
      ).toBe(false);
    expect(
      mcpCalendarSetArgs.safeParse({
        taskId: id,
        version: 1,
        schedule,
        workspaceId: id,
      }).success,
    ).toBe(false);
  });
  it("resize and time-only moves preserve last-day and yearly selectors", () => {
    const resized = shiftCalendarSeries(
      schedule,
      schedule.startAt,
      schedule.startAt,
      "2026-01-31T11:00:00Z",
    );
    expect(resized).toMatchObject({
      startAt: "2026-01-31T09:00:00.000Z",
      endAt: "2026-01-31T11:00:00.000Z",
      rrule: schedule.rrule,
    });
    const moved = shiftCalendarSeries(
      { ...schedule, rrule: "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=-1" },
      schedule.startAt,
      "2026-01-31T10:00:00Z",
    );
    expect(moved.rrule).toBe("FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=-1");
  });
  it("zero civil movement preserves second-fold anchor and exact UNTIL on resize", () => {
    const fold = {
      startAt: "2026-11-01T06:30:00Z",
      endAt: "2026-11-01T07:30:00Z",
      timeZone: "America/New_York",
      rrule: "FREQ=DAILY;UNTIL=20271107T063000Z",
    };
    expect(
      shiftCalendarSeries(
        fold,
        fold.startAt,
        fold.startAt,
        "2026-11-01T08:30:00Z",
      ),
    ).toEqual({
      ...fold,
      startAt: "2026-11-01T06:30:00.000Z",
      endAt: "2026-11-01T08:30:00.000Z",
    });
  });
  it("canonicalizes accepted offset forms and rejects impossible local dates", () => {
    for (const offset of ["+08", "+0800", "+08:00"])
      expect(canonicalCalendarTimeZone(offset)).toBe("+08:00");
    expect(calendarWallToInstant("2026-10-09T09:00", "-03:30")).toBe(
      "2026-10-09T12:30:00.000Z",
    );
    expect(() => calendarWallToInstant("2026-02-30T09:00", "UTC")).toThrow();
    expect(() =>
      shiftCalendarSeries(
        schedule,
        schedule.startAt,
        schedule.startAt,
        schedule.startAt,
      ),
    ).toThrow();
  });
  it("allows safe calendar mutation notifications but no schedule payload", () => {
    const event = {
      activityId: id,
      workspaceId: id,
      resourceId: id,
      actorId: "person",
      userId: null,
    };
    for (const action of [
      "task_calendar.insert",
      "task_calendar.update",
      "task_calendar.delete",
    ])
      expect(changeEventSchema.safeParse({ ...event, action }).success).toBe(
        true,
      );
    expect(
      changeEventSchema.safeParse({
        ...event,
        action: "task_calendar.update",
        schedule,
      }).success,
    ).toBe(false);
  });
});
