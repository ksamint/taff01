import type { AskAnswer, BriefLabels } from "@taff/schemas/assistant";
import { describe, expect, it } from "vitest";
// The acceptance fixtures: the same pure functions and data the server uses.
import {
  type BriefSource,
  buildBrief,
} from "../../../../packages/core/src/brief";
import { buildPlanModel } from "../../../../packages/core/src/plan-model";
import {
  day,
  northwind,
  task,
} from "../../../../packages/core/src/plan-model.fixture";
import {
  actionViews,
  answerView,
  briefStats,
  briefSummary,
  greetingPart,
  labelIndex,
  portfolioTotals,
  reasonPhrases,
  sentences,
} from "./brief-model";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const W = id(1);
const NORTHWIND = id(10);

function source(fields: Partial<BriefSource> = {}): BriefSource {
  return {
    today: day(8),
    timeZone: "Asia/Hong_Kong",
    scope: "all",
    workspaceIds: [W],
    projects: [
      {
        workspaceId: W,
        projectId: id(20),
        name: "Website",
        plan: {
          today: day(8),
          tasks: [task("site", 12, 2, "todo")],
          milestones: [],
          dependencies: [],
          finance: {
            contractAmount: "360000.00",
            currency: "HKD",
            collected: "180000.00",
          },
        },
      },
      {
        workspaceId: W,
        projectId: NORTHWIND,
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
        agentId: id(32),
        taskId: "NW-144",
        capability: "staging.write",
        canDecide: true,
      },
    ],
    suggestions: [
      {
        workspaceId: W,
        suggestionId: id(50),
        kind: "split",
        taskId: id(30),
        agentId: id(32),
      },
    ],
    myTasks: [
      {
        workspaceId: W,
        taskId: id(60),
        projectId: NORTHWIND,
        status: "todo",
        dueDate: day(8),
      },
    ],
    agentRuns: [
      {
        workspaceId: W,
        agentId: id(32),
        runId: id(70),
        taskId: id(30),
        status: "running",
      },
    ],
    ...fields,
  };
}
const labels: BriefLabels = {
  workspaces: [{ id: W, name: "Northwind", key: "NW" }],
  projects: [
    { id: NORTHWIND, workspaceId: W, name: "Checkout v2" },
    { id: id(20), workspaceId: W, name: "Website" },
  ],
  tasks: [
    {
      id: "NW-144",
      workspaceId: W,
      number: 144,
      title: "Staging database migration",
      projectId: NORTHWIND,
    },
    {
      id: id(30),
      workspaceId: W,
      number: 141,
      title: "Payment form",
      projectId: NORTHWIND,
    },
  ],
  milestones: [{ id: "ms-v24", projectId: NORTHWIND, name: "v2.4 release" }],
  agents: [{ id: id(32), workspaceId: W, name: "Ops Agent" }],
};

describe("brief display model: Northwind on 2026-10-08", () => {
  const brief = buildBrief(source());
  const index = labelIndex(labels);
  const checkout = brief.projects.find((p) => p.projectId === NORTHWIND);

  it("shows exactly the plan-model fixture numbers", () => {
    // M17 acceptance: what the brief renders equals buildPlanModel() on the
    // M12 fixture (medium, blocked by NW-144, 69 % delivered, 40 % collected,
    // the v2.4 release forecast on Oct 15 with no slip).
    const model = buildPlanModel(northwind());
    expect(checkout?.risk).toEqual(model.risk);
    expect(checkout?.risk).toMatchObject({
      level: "medium",
      reasons: ["blocked"],
      deliveryPercent: 69,
      slipDays: 0,
      forecastEnd: "2026-10-15",
      finance: {
        contractAmount: "1280000.00",
        collectedAmount: "512000.00",
        collectedPercent: 40,
        currency: "HKD",
      },
    });
    expect(reasonPhrases(checkout!, index)).toEqual([
      {
        key: "brief.reason.blockedTask",
        values: { task: "Staging database migration" },
      },
    ]);
  });

  it("writes the summary from codes: on-track share, worst project, agents, reviews", () => {
    expect(briefSummary(brief, index)).toEqual([
      { key: "brief.summary.onTrack", values: { count: 1, total: 2 } },
      {
        key: "brief.summary.worst",
        values: {
          project: "Checkout v2",
          reason: {
            key: "brief.reason.blockedTask",
            values: { task: "Staging database migration" },
          },
        },
      },
      { key: "brief.summary.agents", values: { count: 1 } },
      { key: "brief.summary.reviews", values: { count: 1 } },
    ]);
  });

  it("fills the tiles from the brief counts", () => {
    expect(briefStats(brief)).toEqual([
      { key: "brief.stat.dueToday", value: 1 },
      { key: "brief.stat.agents", value: 1 },
      { key: "brief.stat.toConfirm", value: 3 },
    ]);
  });

  it("totals finance per currency, weighting delivery by amount", () => {
    const website = brief.projects.find((p) => p.projectId === id(20));
    expect(website?.risk.deliveryPercent).toBe(0);
    expect(portfolioTotals(brief)).toEqual([
      {
        currency: "HKD",
        projects: 2,
        amount: 1_640_000,
        collected: 692_000,
        collectedPercent: 42,
        // (1,280,000 × 69 + 360,000 × 0) / 1,640,000 = 53.85
        deliveryPercent: 54,
      },
    ]);
  });

  it("shows no totals when finance is hidden (ADR 0021)", () => {
    const hidden = buildBrief(
      source({
        projects: source().projects.map((project) => ({
          ...project,
          plan: { ...project.plan, finance: null },
        })),
      }),
    );
    expect(portfolioTotals(hidden)).toEqual([]);
    expect(
      hidden.projects.find((p) => p.projectId === NORTHWIND)?.risk
        .deliveryPercent,
    ).toBe(69);
  });

  it("routes every action to where a person decides, never a one-tap approve", () => {
    const views = actionViews(brief, index, new Map());
    expect(views.map((view) => [view.key, view.href, view.linkKey])).toEqual([
      [
        `review:${id(31)}`,
        `/tasks/${id(30)}/review`,
        "brief.action.openReview",
      ],
      [`grant:${id(40)}`, "/tasks/NW-144", "brief.action.openGrant"],
      [`suggestion:${id(50)}`, null, "brief.action.openProposal"],
    ]);
    expect(views[1]?.title).toEqual({
      key: "brief.action.grantTask",
      values: {
        agent: "Ops Agent",
        task: "Staging database migration",
        capability: { key: "agentProfile.capability.staging.write" },
      },
    });
  });

  it("describes a split proposal from its payload", () => {
    const views = actionViews(
      brief,
      index,
      new Map([
        [
          id(50),
          {
            id: id(50),
            workspaceId: W,
            taskId: id(30),
            createdBy: id(32),
            status: "pending",
            decidedBy: null,
            decidedAt: null,
            version: 1,
            createdAt: "2026-10-08T01:00:00.000Z",
            updatedAt: "2026-10-08T01:00:00.000Z",
            kind: "split",
            payload: { subtasks: [{ title: "A" }, { title: "B" }] },
          },
        ],
      ]),
    );
    expect(views[2]?.title).toEqual({
      key: "brief.action.split",
      values: { agent: "Ops Agent", task: "Payment form", count: 2 },
    });
  });
});

describe("slip and on-track sentences", () => {
  it("names the milestone that slips", () => {
    const plan = northwind(day(12));
    const late = {
      ...plan,
      tasks: plan.tasks.map((item) =>
        item.id === "NW-147"
          ? {
              ...item,
              plan: { startDate: "2026-10-11", durationDays: 5, version: 1 },
            }
          : item,
      ),
    };
    const brief = buildBrief(
      source({
        today: day(12),
        projects: [
          {
            workspaceId: W,
            projectId: NORTHWIND,
            name: "Checkout v2",
            plan: late,
          },
        ],
      }),
    );
    expect(brief.projects[0]?.risk).toMatchObject({
      reasons: ["slip", "blocked", "behind"],
      slipDays: 2,
    });
    expect(reasonPhrases(brief.projects[0]!, labelIndex(labels))[0]).toEqual({
      key: "brief.reason.slipMilestone",
      values: { milestone: "v2.4 release", count: 2 },
    });
  });
  it("says when an on-track project finishes, and handles no projects", () => {
    const brief = buildBrief(source());
    const website = brief.projects.find((p) => p.projectId === id(20))!;
    expect(reasonPhrases(website, labelIndex(labels))).toEqual([
      { key: "brief.reason.onTrackFor", values: { date: { date: day(12) } } },
    ]);
    expect(
      briefSummary(buildBrief(source({ projects: [] })), labelIndex(labels)),
    ).toEqual([{ key: "brief.summary.noProjects" }]);
  });
  it("joins sentences by script", () => {
    expect(sentences(["A.", "B."], "en")).toBe("A. B.");
    expect(sentences(["甲。", "乙。"], "zh-HK")).toBe("甲。乙。");
    expect(sentences(["甲。", "乙。"], "zh-CN")).toBe("甲。乙。");
  });
  it("greets by the hour", () => {
    expect([0, 11, 12, 17, 18, 23].map(greetingPart)).toEqual([
      "morning",
      "morning",
      "afternoon",
      "afternoon",
      "evening",
      "evening",
    ]);
  });
});

describe("Ask taff answers", () => {
  const base = { text: null, source: "rules", labels } as const;
  it("explains what it can answer instead of inventing", () => {
    expect(answerView({ ...base, intent: "unknown", items: [] })).toEqual({
      heading: { key: "ask.answer.unknown" },
      items: [],
    });
  });
  it("says so when nothing matches", () => {
    expect(
      answerView({ ...base, intent: "blocked", items: [] }).heading,
    ).toEqual({ key: "ask.answer.none.blocked" });
  });
  it("links blocked work to the task with the grant", () => {
    const answer: AskAnswer = {
      ...base,
      intent: "blocked",
      items: [
        {
          kind: "grant",
          workspaceId: W,
          id: id(40),
          taskId: "NW-144",
          agentId: id(32),
        },
      ],
    };
    expect(answerView(answer)).toEqual({
      heading: { key: "ask.answer.blocked", values: { count: 1 } },
      items: [
        {
          key: `grant:${id(40)}:0`,
          item: answer.items[0],
          title: {
            key: "ask.item.blockedTask",
            values: { agent: "Ops Agent", task: "Staging database migration" },
          },
          detail: null,
          href: "/tasks/NW-144",
        },
      ],
    });
  });
  it("gives projects their level and forecast", () => {
    const view = answerView({
      ...base,
      intent: "at_risk",
      items: [
        {
          kind: "project",
          workspaceId: W,
          id: NORTHWIND,
          projectId: NORTHWIND,
          level: "medium",
          reasons: ["blocked"],
          slipDays: 2,
          forecastEnd: "2026-10-17",
        },
      ],
    });
    expect(view.items[0]).toMatchObject({
      title: {
        key: "ask.item.project",
        values: {
          project: "Checkout v2",
          level: { key: "timeline.risk.level.medium" },
        },
      },
      detail: {
        key: "ask.item.forecastLate",
        values: { date: { date: "2026-10-17" }, count: 2 },
      },
      href: `/projects/${NORTHWIND}?view=timeline`,
    });
  });
});

describe("human proposal attribution", () => {
  const proposerId = id(90);
  const humanLabels = {
    ...labels,
    members: [{ id: proposerId, workspaceId: W, name: "Bob Lee" }],
  };
  const humanBrief = buildBrief(
    source({
      reviews: [],
      pendingGrants: [],
      suggestions: [
        {
          workspaceId: W,
          suggestionId: id(91),
          kind: "split",
          taskId: id(30),
          proposerId,
        },
      ],
    }),
  );
  it("renders a person by member name without inventing an agent identity", () => {
    const views = actionViews(humanBrief, labelIndex(humanLabels), new Map());
    expect(views[0].title).toEqual({
      key: "brief.action.proposal",
      values: { agent: "Bob Lee", task: "Payment form" },
    });
    expect(humanBrief.actions[0]).not.toHaveProperty(
      "agentId",
      expect.any(String),
    );
    const answer = answerView({
      intent: "needs_me",
      source: "rules",
      text: null,
      labels: humanLabels,
      items: [
        {
          kind: "suggestion",
          workspaceId: W,
          id: id(91),
          taskId: id(30),
          proposerId,
        },
      ],
    });
    expect(answer.items[0].title.values?.agent).toBe("Bob Lee");
    expect(answer.items[0].href).toBe(`/tasks/${id(30)}`);
  });
  it("uses a neutral translated fallback when a proposer label is unavailable", () => {
    const view = actionViews(humanBrief, labelIndex(undefined), new Map())[0];
    expect(view.title.values?.agent).toEqual({ key: "brief.proposal.someone" });
  });
});
