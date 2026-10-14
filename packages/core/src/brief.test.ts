import { briefSchema } from "@taff/schemas";
import { describe, expect, it } from "vitest";
import { answerAsk, askIntent } from "./ask";
import { type BriefSource, buildBrief } from "./brief";
import { buildPlanModel } from "./plan-model";
import { day, northwind, task } from "./plan-model.fixture";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const W = id(1);
const W2 = id(2);
function source(fields: Partial<BriefSource> = {}): BriefSource {
  return {
    today: day(8),
    timeZone: "Asia/Hong_Kong",
    scope: "all",
    workspaceIds: [W, W2],
    projects: [
      {
        workspaceId: W2,
        projectId: id(20),
        name: "Website",
        plan: {
          today: day(8),
          tasks: [task("site", 12, 2, "todo")],
          milestones: [],
          dependencies: [],
          finance: null,
        },
      },
      {
        workspaceId: W,
        projectId: id(10),
        name: "Checkout v2",
        plan: northwind(),
      },
    ],
    reviews: [
      { workspaceId: W, taskId: id(30), runId: id(31), agentId: id(32) },
    ],
    pendingGrants: [
      {
        workspaceId: W,
        grantId: id(40),
        agentId: id(41),
        taskId: id(42),
        capability: "staging.write",
        canDecide: true,
      },
      {
        workspaceId: W2,
        grantId: id(43),
        agentId: id(44),
        taskId: null,
        capability: "repo.pr",
        canDecide: false,
      },
    ],
    suggestions: [
      {
        workspaceId: W,
        suggestionId: id(50),
        kind: "split",
        taskId: id(51),
        agentId: id(41),
      },
    ],
    myTasks: [
      {
        workspaceId: W,
        taskId: id(60),
        projectId: id(10),
        status: "todo",
        dueDate: day(8),
      },
      {
        workspaceId: W,
        taskId: id(61),
        projectId: null,
        status: "in_progress",
        dueDate: day(14),
      },
      {
        workspaceId: W,
        taskId: id(62),
        projectId: null,
        status: "todo",
        dueDate: day(15),
      },
      {
        workspaceId: W2,
        taskId: id(63),
        projectId: null,
        status: "todo",
        dueDate: day(7),
      },
      {
        workspaceId: W2,
        taskId: id(64),
        projectId: null,
        status: "todo",
        dueDate: null,
      },
    ],
    agentRuns: [
      {
        workspaceId: W,
        agentId: id(41),
        runId: id(70),
        taskId: id(42),
        status: "running",
      },
      {
        workspaceId: W,
        agentId: id(41),
        runId: id(71),
        taskId: id(51),
        status: "running",
      },
      {
        workspaceId: W2,
        agentId: id(44),
        runId: id(72),
        taskId: id(73),
        status: "paused",
      },
    ],
    ...fields,
  };
}

describe("brief: Northwind on 2026-10-08", () => {
  const brief = buildBrief(source());
  const northwindRisk = brief.projects.find(
    (p) => p.projectId === id(10),
  )?.risk;
  it("equals the M12 plan-model fixture numbers for the same data", () => {
    // The acceptance numbers recorded in docs/milestones/12 and
    // plan-model.test.ts: medium, blocked by NW-144, 69% delivered, 40%
    // collected, no slip, the v2.4 release on Oct 15.
    expect(northwindRisk).toEqual(buildPlanModel(northwind()).risk);
    expect(northwindRisk).toMatchObject({
      level: "medium",
      reasons: ["blocked"],
      slipDays: 0,
      deliveryPercent: 69,
      blockedTaskId: "NW-144",
      plannedEnd: "2026-10-15",
      forecastEnd: "2026-10-15",
      finance: { collectedPercent: 40, currency: "HKD" },
    });
  });
  it("matches the shared schema, with codes and numbers only", () => {
    // The fixture uses readable ids; the schema wants uuids, so swap them.
    const parsed = briefSchema.safeParse(
      JSON.parse(
        JSON.stringify(brief).replace(/"(NW-\d+|ms-v24|site)"/g, `"${id(99)}"`),
      ),
    );
    expect(parsed.success).toBe(true);
  });
  it("orders projects by risk, then slip and name", () => {
    expect(brief.projects.map((p) => [p.name, p.risk.level])).toEqual([
      ["Checkout v2", "medium"],
      ["Website", "low"],
    ]);
  });
  it("counts what waits for the reader", () => {
    expect(brief.counts).toEqual({
      projects: 2,
      onTrack: 1,
      atRisk: 1,
      reviewsWaiting: 1,
      pendingGrants: 1,
      pendingSuggestions: 1,
      blockedAgents: 2,
      dueToday: 1,
      agentsWorking: 1,
    });
  });
  it("routes actions to existing records, never a one-tap decision", () => {
    expect(brief.actions).toEqual([
      {
        kind: "review",
        workspaceId: W,
        taskId: id(30),
        runId: id(31),
        agentId: id(32),
      },
      {
        kind: "grant",
        workspaceId: W,
        grantId: id(40),
        agentId: id(41),
        taskId: id(42),
        capability: "staging.write",
      },
      {
        kind: "suggestion",
        workspaceId: W,
        suggestionId: id(50),
        suggestionKind: "split",
        taskId: id(51),
        agentId: id(41),
      },
    ]);
  });
  it("hides finance when the reader may not read it", () => {
    const plan = { ...northwind(), finance: null };
    const hidden = buildBrief(
      source({
        projects: [
          { workspaceId: W, projectId: id(10), name: "Checkout v2", plan },
        ],
      }),
    );
    expect(hidden.projects[0].risk.finance).toBeNull();
    expect(hidden.projects[0].risk.deliveryPercent).toBe(69);
  });
  it("is empty without memberships", () => {
    expect(
      buildBrief(
        source({
          workspaceIds: [],
          projects: [],
          reviews: [],
          pendingGrants: [],
          suggestions: [],
          myTasks: [],
          agentRuns: [],
        }),
      ),
    ).toMatchObject({
      projects: [],
      actions: [],
      counts: { projects: 0, onTrack: 0, atRisk: 0, agentsWorking: 0 },
    });
  });
});

describe("Ask taff rules fallback", () => {
  it.each([
    ["What's at risk?", "at_risk"],
    ["Will the v2.4 release slip?", "at_risk"],
    ["邊個項目有風險？", "at_risk"],
    ["哪个项目有风险？", "at_risk"],
    ["What's blocked?", "blocked"],
    ["有甚麼被阻礙？", "blocked"],
    ["What needs me?", "needs_me"],
    ["有甚麼需要我確認？", "needs_me"],
    ["What's due this week?", "due_this_week"],
    ["本週有甚麼到期？", "due_this_week"],
    ["本周有什么到期？", "due_this_week"],
    ["What are the agents working on?", "agent_status"],
    ["智能體在做甚麼？", "agent_status"],
    ["Tell me a joke", "unknown"],
  ])("%s → %s", (question, intent) => {
    expect(askIntent(question)).toBe(intent);
  });
  const data = source();
  const brief = buildBrief(data);
  it("answers at-risk with project codes and numbers", () => {
    expect(answerAsk("what's at risk", data, brief)).toEqual({
      intent: "at_risk",
      items: [
        {
          kind: "project",
          workspaceId: W,
          id: id(10),
          projectId: id(10),
          level: "medium",
          reasons: ["blocked"],
          slipDays: 0,
          forecastEnd: "2026-10-15",
        },
      ],
    });
  });
  it("answers blocked with every pending grant", () => {
    expect(
      answerAsk("what's blocked", data, brief).items.map((item) => item.id),
    ).toEqual([id(40), id(43)]);
  });
  it("answers needs-me with the brief's actions", () => {
    expect(
      answerAsk("what needs me", data, brief).items.map((item) => [
        item.kind,
        item.id,
      ]),
    ).toEqual([
      ["review", id(31)],
      ["grant", id(40)],
      ["suggestion", id(50)],
    ]);
  });
  it("answers due this week from today through six days on, by date", () => {
    expect(
      answerAsk("due this week?", data, brief).items.map((item) => [
        item.id,
        item.dueDate,
      ]),
    ).toEqual([
      [id(60), day(8)],
      [id(61), day(14)],
    ]);
  });
  it("answers agent status with running and paused runs", () => {
    expect(
      answerAsk("agent status", data, brief).items.map((item) => [
        item.agentId,
        item.runId,
        item.status,
      ]),
    ).toEqual([
      [id(41), id(70), "running"],
      [id(41), id(71), "running"],
      [id(44), id(72), "paused"],
    ]);
  });
  it("says unknown instead of inventing an answer", () => {
    expect(answerAsk("write me a poem", data, brief)).toEqual({
      intent: "unknown",
      items: [],
    });
  });
});
