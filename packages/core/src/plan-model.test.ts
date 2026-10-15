import { describe, expect, it } from "vitest";
import { buildPlanModel, type PlanModelInput } from "./plan-model";
import { day, northwind, task } from "./plan-model.fixture";

/* The Northwind fixture lives in plan-model.fixture.ts; the M17 brief test
 * reads the same data (brief.test.ts). */
const replan = (
  input: PlanModelInput,
  id: string,
  startDate: string,
  durationDays: number,
) => ({
  ...input,
  tasks: input.tasks.map((t) =>
    t.id === id ? { ...t, plan: { startDate, durationDays, version: 2 } } : t,
  ),
});
const item = (model: ReturnType<typeof buildPlanModel>, id: string) => {
  const found = model.items.find((x) => x.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe("plan model: Northwind on 2026-10-08", () => {
  const model = buildPlanModel(northwind());
  it("orders parents before children, top level by start, milestones last", () => {
    expect(model.items.map((x) => [x.id, x.depth])).toEqual([
      ["NW-133", 0],
      ["NW-135", 0],
      ["NW-136", 0],
      ["NW-140", 0],
      ["NW-141", 1],
      ["NW-144", 1],
      ["NW-142", 1],
      ["NW-138", 1],
      ["NW-139", 1],
      ["NW-145", 1],
      ["NW-146", 0],
      ["NW-147", 0],
      ["ms-v24", 0],
    ]);
  });
  it("derives spans, durations and duration-weighted parent progress", () => {
    expect(item(model, "NW-141")).toMatchObject({
      start: "2026-10-06",
      end: "2026-10-08",
      durationDays: 3,
      progress: 90,
      planned: true,
      parentId: "NW-140",
    });
    expect(item(model, "NW-144")).toMatchObject({
      start: "2026-10-06",
      end: "2026-10-09",
      progress: 50,
      blocked: true,
      behindDays: 2,
    });
    // (90·3 + 90·2 + 50·3 + 50·4 + 50·3 + 0·1) / 16 = 59.375
    expect(item(model, "NW-140")).toMatchObject({
      start: "2026-10-06",
      end: "2026-10-10",
      durationDays: 5,
      progress: 59,
      hasChildren: true,
      blocked: true,
      planned: false,
      version: null,
      taskVersion: 1,
      behindDays: 0,
      forecastEnd: "2026-10-11",
    });
    expect(item(model, "ms-v24")).toMatchObject({
      kind: "milestone",
      start: "2026-10-15",
      end: "2026-10-15",
      durationDays: 0,
      status: null,
      version: 1,
      taskVersion: null,
    });
  });
  it("forecasts from predecessors and children", () => {
    expect(
      Object.fromEntries(model.items.map((x) => [x.id, x.forecastEnd])),
    ).toEqual({
      "NW-133": "2026-10-05",
      "NW-135": "2026-10-06",
      "NW-136": "2026-10-07",
      "NW-140": "2026-10-11",
      "NW-141": "2026-10-08",
      "NW-144": "2026-10-11",
      "NW-142": "2026-10-08",
      "NW-138": "2026-10-09",
      "NW-139": "2026-10-10",
      "NW-145": "2026-10-09",
      "NW-146": "2026-10-12",
      "NW-147": "2026-10-13",
      "ms-v24": "2026-10-15",
    });
  });
  it("flags no conflict and walks the critical path back from the release", () => {
    expect(model.dependencies.every((dep) => !dep.conflict)).toBe(true);
    expect(model.items.filter((x) => x.critical).map((x) => x.id)).toEqual([
      "NW-133",
      "NW-139",
      "NW-147",
      "ms-v24",
    ]);
  });
  it("reports a medium risk for the blocked migration, 69% delivered, 40% collected", () => {
    // Leaves: (90·3 + 90·2 + 50·3 + 50·4 + 50·3 + 0·1 + 0·1 + 0·2 + 100·4 + 100·5 + 100·3) / 31 = 69.35
    expect(model.risk).toEqual({
      level: "medium",
      reasons: ["blocked"],
      start: "2026-10-01",
      plannedEnd: "2026-10-15",
      forecastEnd: "2026-10-15",
      slipDays: 0,
      deliveryPercent: 69,
      driverTaskId: null,
      blockedTaskId: "NW-144",
      conflictDependencyId: null,
      lastMilestoneId: "ms-v24",
      finance: {
        contractAmount: "1280000.00",
        collectedAmount: "512000.00",
        currency: "HKD",
        collectedPercent: 40,
      },
    });
  });
});

describe("plan model: scenarios", () => {
  it("reports whole behind days without an extra day from floating-point noise", () => {
    const model = buildPlanModel({
      today: day(6),
      tasks: [task("six-days", 6, 6, "todo")],
      milestones: [],
      dependencies: [],
      finance: null,
    });
    expect(item(model, "six-days").behindDays).toBe(5);
    expect(item(model, "six-days").forecastEnd).toBe(day(11));
    expect(
      item(
        buildPlanModel({
          today: day(1),
          tasks: [task("future", 6, 6, "todo")],
          milestones: [],
          dependencies: [],
          finance: null,
        }),
        "future",
      ).behindDays,
    ).toBe(0);
  });
  it("a successor starting before its predecessor ends is a high-risk conflict", () => {
    const model = buildPlanModel(
      replan(northwind(), "NW-139", "2026-10-05", 3),
    );
    expect(
      model.dependencies.filter((d) => d.conflict).map((d) => d.id),
    ).toEqual(["NW-133>NW-139"]);
    // Started Oct 5, expected 100% on Oct 8, at 50%: 1.5 days, displayed as 2.
    expect(item(model, "NW-139")).toMatchObject({
      start: "2026-10-05",
      end: "2026-10-07",
      behindDays: 2,
      forecastEnd: "2026-10-09",
    });
    expect(item(model, "NW-140")).toMatchObject({
      start: "2026-10-05",
      end: "2026-10-09",
    });
    expect(model.risk).toMatchObject({
      level: "high",
      reasons: ["dependency_conflict", "blocked", "behind"],
      conflictDependencyId: "NW-133>NW-139",
      driverTaskId: "NW-139",
      blockedTaskId: "NW-144",
      slipDays: 0,
    });
  });
  it("on 2026-10-12 late work becomes the driver without slipping the release", () => {
    const model = buildPlanModel(northwind(day(12)));
    expect(
      Object.fromEntries(model.items.map((x) => [x.id, x.behindDays])),
    ).toMatchObject({
      "NW-141": 1,
      "NW-142": 1,
      "NW-138": 2,
      "NW-144": 2,
      "NW-139": 2,
      "NW-145": 1,
      "NW-146": 0,
      "NW-147": 0,
      "NW-140": 3,
      "NW-133": 0,
      "ms-v24": 0,
    });
    expect(item(model, "NW-147").forecastEnd).toBe("2026-10-14");
    expect(model.risk).toMatchObject({
      level: "medium",
      reasons: ["blocked", "behind"],
      driverTaskId: "NW-138",
      slipDays: 0,
      forecastEnd: "2026-10-15",
    });
  });
  it("a long late task slips the release", () => {
    const model = buildPlanModel(
      replan(northwind(day(12)), "NW-147", "2026-10-11", 5),
    );
    expect(model.dependencies.every((d) => !d.conflict)).toBe(true);
    // max(Oct 16 + 1 behind, NW-139's 12.5 + 5) = 17.5 → slip round(1.5) = 2
    expect(item(model, "NW-147")).toMatchObject({
      behindDays: 1,
      forecastEnd: "2026-10-17",
    });
    expect(item(model, "ms-v24").forecastEnd).toBe("2026-10-17");
    expect(model.risk).toMatchObject({
      level: "medium",
      reasons: ["slip", "blocked", "behind"],
      plannedEnd: "2026-10-15",
      forecastEnd: "2026-10-17",
      slipDays: 2,
      driverTaskId: "NW-138",
    });
    expect(model.items.filter((x) => x.critical).map((x) => x.id)).toEqual([
      "NW-133",
      "NW-139",
      "NW-147",
      "ms-v24",
    ]);
  });
  it("defaults unplanned durations from priority and omits undated tasks", () => {
    const model = buildPlanModel({
      today: day(8),
      tasks: [
        task("urgent", 10, null, "todo", { priority: 1 }),
        task("normal", 10, null, "todo"),
        task("undated", 10, null, "todo", { dueDate: null }),
      ],
      milestones: [],
      dependencies: [],
      finance: null,
    });
    expect(model.items.map((x) => [x.id, x.start, x.end, x.planned])).toEqual([
      ["urgent", "2026-10-08", "2026-10-10", false],
      ["normal", "2026-10-09", "2026-10-10", false],
    ]);
    expect(model.risk.finance).toBeNull();
    expect(model.risk.lastMilestoneId).toBeNull();
  });
  it("a milestone conflicts only when it falls before its predecessor's last day", () => {
    const base = {
      today: day(1),
      tasks: [task("a", 10, 2, "todo")],
      dependencies: [
        {
          id: "a>m",
          from: { kind: "task" as const, id: "a" },
          to: { kind: "milestone" as const, id: "m" },
        },
      ],
      finance: null,
    };
    const at = (date: string) =>
      buildPlanModel({
        ...base,
        milestones: [{ id: "m", name: "M", date, version: 1 }],
      }).dependencies[0].conflict;
    expect(at(day(10))).toBe(false);
    expect(at(day(9))).toBe(true);
  });
  it("survives a dependency cycle and an empty project", () => {
    const model = buildPlanModel({
      today: day(8),
      tasks: [task("a", 10, 2, "todo"), task("b", 12, 2, "todo")],
      milestones: [],
      dependencies: [
        {
          id: "a>b",
          from: { kind: "task", id: "a" },
          to: { kind: "task", id: "b" },
        },
        {
          id: "b>a",
          from: { kind: "task", id: "b" },
          to: { kind: "task", id: "a" },
        },
      ],
      finance: null,
    });
    expect(model.items).toHaveLength(2);
    expect(model.risk.level).toBe("high");
    const empty = buildPlanModel({
      today: day(8),
      tasks: [],
      milestones: [],
      dependencies: [],
      finance: { contractAmount: null, currency: null, collected: "0" },
    });
    expect(empty.risk).toMatchObject({
      level: "low",
      start: null,
      deliveryPercent: 0,
      finance: { collectedPercent: null },
    });
  });
});
