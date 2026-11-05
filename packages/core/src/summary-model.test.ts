import { dailySummarySnapshotSchema } from "@taff/schemas";
import { describe, expect, it } from "vitest";
import { buildPlanModel, type PlanModelInput } from "./plan-model";
import { day, northwind } from "./plan-model.fixture";
import {
  buildDailySummary,
  SUMMARY_ITEM_LIMIT,
  type SummarySource,
  type SummarySourceProject,
  summaryContentHash,
  summaryWatermark,
} from "./summary-model";

/** Deterministic UUIDs so the snapshot also passes the shared schema. */
const uuid = (key: string) => {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hex = hash.toString(16).padStart(8, "0");
  return `${hex}-0000-4000-8000-${hex.padStart(12, "0")}`;
};
function withUuids(plan: PlanModelInput): PlanModelInput {
  const id = (value: string) => uuid(value);
  return {
    ...plan,
    tasks: plan.tasks.map((task) => ({
      ...task,
      id: id(task.id),
      parentId: task.parentId ? id(task.parentId) : null,
    })),
    milestones: plan.milestones.map((ms) => ({ ...ms, id: id(ms.id) })),
    dependencies: plan.dependencies.map((dep) => ({
      id: id(dep.id),
      from: { ...dep.from, id: id(dep.from.id) },
      to: { ...dep.to, id: id(dep.to.id) },
    })),
  };
}
const TODAY = day(8);
const changedToday = new Set(["NW-135", "NW-139", "NW-141"]);
function checkout(): SummarySourceProject {
  const raw = northwind(TODAY);
  return {
    projectId: uuid("checkout"),
    name: "Checkout v2",
    stage: "in_service",
    leadName: "Alex Chen",
    dueAt: "2026-10-15T09:00:00.000Z",
    deliveryProgress: 60,
    plan: withUuids(raw),
    tasks: raw.tasks.map((task) => ({
      taskId: uuid(task.id),
      number: Number(task.id.slice(3)),
      title: `Task ${task.id}`,
      status: task.status,
      ownerName: "Mia Wong",
      dueAt: task.dueDate ? `${task.dueDate}T09:00:00.000Z` : null,
      dueDate: task.dueDate,
      changedOn: changedToday.has(task.id) ? TODAY : day(7),
      blocked: task.blocked,
    })),
    agentRuns: { completedToday: 1, pendingReview: 2 },
  };
}
function source(overrides: Partial<SummarySource> = {}): SummarySource {
  return {
    localDate: TODAY,
    timeZone: "Asia/Hong_Kong",
    workspaceName: "Northwind",
    tag: { kind: "shareholder", org: "Harbour Capital", label: "Series A" },
    recipient: { name: "Pat Lee", includeFinance: true, showPeople: true },
    projects: [checkout()],
    ...overrides,
  };
}

describe("shareholder daily summary model (ADR 0027)", () => {
  it("reports exactly the timeline's risk for each project", () => {
    const project = checkout();
    const snapshot = buildDailySummary(source({ projects: [project] }));
    const risk = buildPlanModel(project.plan).risk;
    expect(snapshot.projects[0].risk).toEqual({
      level: risk.level,
      reasons: risk.reasons,
      plannedEnd: risk.plannedEnd,
      forecastEnd: risk.forecastEnd,
      slipDays: risk.slipDays,
      deliveryPercent: risk.deliveryPercent,
    });
    expect(snapshot.projects[0].risk.level).toBe("medium");
    expect(snapshot.projects[0].risk.reasons).toContain("blocked");
  });
  it("counts the day's movement, due work, blockers and reviews", () => {
    const [project] = buildDailySummary(source()).projects;
    expect(project.counts).toEqual({
      total: 12,
      open: 9,
      done: 3,
      inReview: 2,
      blocked: 1,
      dueToday: 2,
      overdue: 0,
      completedToday: 1,
      movedToday: 2,
    });
    expect(project.completedToday.map((t) => t.number)).toEqual([135]);
    expect(project.movedToday.map((t) => t.number)).toEqual([139, 141]);
    expect(project.dueToday.map((t) => t.number)).toEqual([141, 142]);
    expect(project.blocked.map((t) => t.number)).toEqual([144]);
    expect(project.agentRuns).toEqual({ completedToday: 1, pendingReview: 2 });
  });
  it("lists overdue open work by due time, never done work", () => {
    const base = checkout();
    const snapshot = buildDailySummary(
      source({ localDate: day(10), projects: [base] }),
    );
    expect(snapshot.projects[0].overdue.map((t) => t.number)).toEqual([
      141, 142, 138, 144, 145,
    ]);
  });
  it("shows finance only when the recipient allows it", () => {
    const on = buildDailySummary(source()).projects[0].finance;
    expect(on).toEqual({
      currency: "HKD",
      contractAmount: "1280000.00",
      collectedAmount: "512000.00",
      collectedPercent: 40,
    });
    const off = buildDailySummary(
      source({
        recipient: { name: "Pat Lee", includeFinance: false, showPeople: true },
      }),
    );
    expect(off.projects[0].finance).toBeNull();
  });
  it("hides people's names when the recipient turns them off", () => {
    const snapshot = buildDailySummary(
      source({
        recipient: {
          name: "Pat Lee",
          includeFinance: false,
          showPeople: false,
        },
      }),
    );
    const [project] = snapshot.projects;
    expect(project.leadName).toBeNull();
    for (const list of [
      project.completedToday,
      project.movedToday,
      project.dueToday,
      project.blocked,
    ])
      for (const item of list) expect(item.ownerName).toBeNull();
    expect(JSON.stringify(snapshot)).not.toMatch(/Mia Wong|Alex Chen/);
    expect(snapshot.recipient.name).toBe("Pat Lee");
  });
  it("caps every list at twenty with true counts", () => {
    const base = checkout();
    const many = Array.from({ length: 25 }, (_, i) => ({
      ...base.tasks[0],
      taskId: uuid(`late-${i}`),
      number: 500 + i,
      status: "todo" as const,
      dueDate: day(1),
      dueAt: `${day(1)}T09:00:00.000Z`,
    }));
    const snapshot = buildDailySummary(
      source({ projects: [{ ...base, tasks: [...base.tasks, ...many] }] }),
    );
    expect(snapshot.projects[0].counts.overdue).toBe(25);
    expect(snapshot.projects[0].overdue).toHaveLength(SUMMARY_ITEM_LIMIT);
    expect(snapshot.truncated).toBe(true);
    expect(buildDailySummary(source()).truncated).toBe(false);
  });
  it("orders projects by name and caps them at one hundred", () => {
    const base = checkout();
    const projects = Array.from({ length: 101 }, (_, i) => ({
      ...base,
      projectId: uuid(`p-${i}`),
      name: `P${String(100 - i).padStart(3, "0")}`,
    }));
    const snapshot = buildDailySummary(source({ projects }));
    expect(snapshot.projects).toHaveLength(100);
    expect(snapshot.projects[0].name).toBe("P000");
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.totals.projects).toBe(100);
    expect(snapshot.totals.open).toBe(900);
  });
  it("passes the shared schema and carries no private fields", () => {
    const snapshot = buildDailySummary(source());
    expect(dailySummarySnapshotSchema.parse(snapshot)).toEqual(snapshot);
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object")
        for (const [key, inner] of Object.entries(value)) {
          keys.add(key.toLowerCase());
          walk(inner);
        }
    };
    walk(snapshot);
    for (const forbidden of [
      "comment",
      "comments",
      "output",
      "email",
      "token",
      "description",
    ])
      expect(keys.has(forbidden), forbidden).toBe(false);
  });
  it("hashes deterministically and binds the watermark to the recipient", () => {
    const snapshot = buildDailySummary(source());
    const hash = summaryContentHash(snapshot);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(summaryContentHash(buildDailySummary(source()))).toBe(hash);
    expect(
      summaryContentHash(
        buildDailySummary(
          source({
            recipient: {
              name: "Someone Else",
              includeFinance: true,
              showPeople: true,
            },
          }),
        ),
      ),
    ).not.toBe(hash);
    const id = "0f9e8d7c-0000-4000-8000-000000000001";
    expect(summaryWatermark(snapshot, id)).toEqual({
      text: "Pat Lee · Harbour Capital · 2026-10-08 · 0f9e8d7c",
      recipientName: "Pat Lee",
      org: "Harbour Capital",
      localDate: TODAY,
      summaryId: id,
      contentHash: hash,
    });
    expect(summaryWatermark(snapshot, null).text).toBe(
      "Pat Lee · Harbour Capital · 2026-10-08 · preview",
    );
  });
  it("matches the committed golden snapshot", async () => {
    const snapshot = buildDailySummary(source());
    await expect(
      `${JSON.stringify({ snapshot, contentHash: summaryContentHash(snapshot) }, null, 2)}\n`,
    ).toMatchFileSnapshot("./__fixtures__/summary-golden.json");
  });
});
