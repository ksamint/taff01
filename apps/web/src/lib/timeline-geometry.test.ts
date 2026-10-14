import type { Timeline, TimelineItem } from "@taff/schemas/plan";
import { describe, expect, it } from "vitest";
import {
  addDays,
  applyPlanChange,
  arrowPath,
  barGeometry,
  dateToX,
  daysBetween,
  dayWidthFor,
  deltaDays,
  descendantIds,
  scaleFor,
  ticks,
  visibleRows,
  weekday,
  xToDate,
} from "./timeline-geometry";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function item(n: number, overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    kind: "task",
    id: id(n),
    title: `Task ${n}`,
    parentId: null,
    depth: 0,
    start: "2026-10-12",
    end: "2026-10-13",
    durationDays: 2,
    planned: true,
    progress: 0,
    status: "todo",
    ownerId: null,
    workerId: null,
    workerIsAgent: false,
    blocked: false,
    hasChildren: false,
    behindDays: 0,
    forecastEnd: "2026-10-13",
    critical: false,
    version: 1,
    taskVersion: 1,
    ...overrides,
  };
}
function timeline(items: TimelineItem[]): Timeline {
  return {
    projectId: id(99),
    today: "2026-10-14",
    timeZone: "Asia/Hong_Kong",
    items,
    dependencies: [],
    risk: {
      level: "low",
      reasons: [],
      start: null,
      plannedEnd: null,
      forecastEnd: null,
      slipDays: 0,
      deliveryPercent: 0,
      driverTaskId: null,
      blockedTaskId: null,
      conflictDependencyId: null,
      lastMilestoneId: null,
      finance: null,
    },
    canEditPlan: true,
  };
}

describe("civil dates", () => {
  it("adds days across months, years and DST changes", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-12", "2026-11-12")).toBe(31);
  });
  it("numbers weekdays from Monday", () => {
    expect(weekday("2026-10-12")).toBe(0);
    expect(weekday("2026-10-18")).toBe(6);
    expect(weekday("1970-01-01")).toBe(3);
  });
});

describe("date ↔ x", () => {
  const scale = { origin: "2026-10-05", days: 40, dayWidth: 28 };
  it("maps a date to its column and back", () => {
    expect(dateToX(scale, "2026-10-05")).toBe(0);
    expect(dateToX(scale, "2026-10-14")).toBe(9 * 28);
    for (const date of ["2026-10-05", "2026-10-14", "2026-11-02"])
      expect(xToDate(scale, dateToX(scale, date) + 5)).toBe(date);
  });
  it("snaps a drag to whole days", () => {
    expect(deltaDays(13, 28)).toBe(0);
    expect(deltaDays(15, 28)).toBe(1);
    expect(deltaDays(-15, 28)).toBe(-1);
    expect(deltaDays(-3, 28)).toBe(0);
    expect(deltaDays(57, 28)).toBe(2);
  });
  it("draws bars over inclusive days and milestones at the end of their day", () => {
    expect(barGeometry(scale, item(1))).toEqual({ x: 7 * 28, width: 56 });
    expect(
      barGeometry(
        scale,
        item(2, { kind: "milestone", start: "2026-10-15", end: "2026-10-15" }),
      ),
    ).toEqual({ x: 11 * 28, width: 0 });
  });
  it("starts on a Monday a week before the earliest date", () => {
    const value = scaleFor(
      timeline([item(1, { start: "2026-10-14", end: "2026-10-20" })]),
      dayWidthFor("day", false),
    );
    expect(value.origin).toBe("2026-10-05");
    expect(weekday(value.origin)).toBe(0);
    expect(value.days).toBe(daysBetween("2026-10-05", "2026-10-20") + 15);
    expect(dayWidthFor("week", true)).toBe(10);
  });
  it("lists weeks and weekends", () => {
    const { weeks, days } = ticks({
      origin: "2026-10-05",
      days: 14,
      dayWidth: 10,
    });
    expect(weeks.map((week) => week.date)).toEqual([
      "2026-10-05",
      "2026-10-12",
    ]);
    expect(days.filter((day) => day.weekend)).toHaveLength(4);
  });
});

describe("arrows", () => {
  it("draws an elbow when the successor starts later", () => {
    expect(arrowPath({ x: 10, y: 18 }, { x: 60, y: 54 }, 36)).toBe(
      "M10,18H18V54H60",
    );
  });
  it("doubles back between rows when it starts earlier", () => {
    expect(arrowPath({ x: 60, y: 18 }, { x: 40, y: 54 }, 36)).toBe(
      "M60,18H68V36H32V54H40",
    );
  });
});

describe("virtualization", () => {
  it("renders everything up to the threshold", () => {
    expect(visibleRows(150, 900, 400, 36)).toEqual({ from: 0, to: 150 });
  });
  it("renders a window with overscan beyond it", () => {
    expect(visibleRows(1000, 3600, 720, 36)).toEqual({ from: 92, to: 128 });
    expect(visibleRows(1000, 0, 720, 36)).toEqual({ from: 0, to: 28 });
  });
});

describe("optimistic plan changes", () => {
  const parent = item(1, {
    hasChildren: true,
    start: "2026-10-12",
    end: "2026-10-16",
    durationDays: 5,
    forecastEnd: "2026-10-16",
  });
  const child = item(2, { parentId: id(1), depth: 1 });
  const grandchild = item(3, {
    parentId: id(2),
    depth: 2,
    start: "2026-10-14",
    end: "2026-10-16",
    durationDays: 3,
    forecastEnd: "2026-10-16",
  });
  const other = item(4);
  const model = timeline([parent, child, grandchild, other]);

  it("finds the whole subtree", () => {
    expect(descendantIds(model.items, id(1)).sort()).toEqual([id(2), id(3)]);
  });
  it("moves a parent's subtree by the same days (D10)", () => {
    const moved = applyPlanChange(model, id(1), "2026-10-15", 5, true);
    const byId = new Map(moved.items.map((entry) => [entry.id, entry]));
    expect(byId.get(id(1))?.start).toBe("2026-10-15");
    expect(byId.get(id(1))?.end).toBe("2026-10-19");
    expect(byId.get(id(2))?.start).toBe("2026-10-15");
    expect(byId.get(id(3))?.end).toBe("2026-10-19");
    expect(byId.get(id(4))).toBe(other);
  });
  it("resizes one bar without touching others", () => {
    const resized = applyPlanChange(model, id(4), "2026-10-12", 4, false);
    const bar = resized.items.find((entry) => entry.id === id(4));
    expect(bar?.end).toBe("2026-10-15");
    expect(bar?.durationDays).toBe(4);
    expect(resized.items[1]).toBe(child);
  });
});
