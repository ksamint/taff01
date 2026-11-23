import { writeFileSync } from "node:fs";
import {
  buildPlanModel,
  type PlanModelInput,
} from "../packages/core/src/plan-model";
import { northwind, task } from "../packages/core/src/plan-model.fixture";

const sample = northwind();
const empty: PlanModelInput = {
  ...sample,
  tasks: [],
  milestones: [],
  dependencies: [],
  finance: null,
};
const messy: PlanModelInput = {
  ...empty,
  tasks: [
    task("parent", 8, null, "todo", { title: "交付", dueDate: null }),
    task("past", 8, null, "todo", {
      parentId: "parent",
      title: "準備",
      blocked: true,
    }),
    task("work", 14, 7, "needs_review", { title: "Handoff" }),
    task("child", 8, null, "done", { parentId: "parent" }),
    task("no-date", 8, null, "todo", { parentId: "parent", dueDate: null }),
  ],
  dependencies: [
    {
      id: "conflict",
      from: { kind: "task", id: "work" },
      to: { kind: "task", id: "past" },
    },
    {
      id: "hidden",
      from: { kind: "task", id: "no-date" },
      to: { kind: "task", id: "child" },
    },
  ],
};
const inputs = [
  ["northwind", sample],
  ["empty", empty],
  ["nested-blocker-and-conflict", messy],
  [
    "completed",
    {
      ...messy,
      tasks: messy.tasks.map((value) => ({
        ...value,
        blocked: false,
        status: "done" as const,
      })),
    },
  ],
  [
    "cycle",
    {
      ...messy,
      dependencies: [
        ...messy.dependencies,
        {
          id: "cycle",
          from: { kind: "task" as const, id: "past" },
          to: { kind: "task" as const, id: "work" },
        },
      ],
    },
  ],
  [
    "zero-contract",
    {
      ...empty,
      finance: { contractAmount: "0.00", currency: "SGD", collected: "12.50" },
    },
  ],
  ["milestone-only", { ...empty, milestones: sample.milestones }],
  ["later-today", { ...sample, today: "2026-10-23", finance: null }],
] satisfies Array<[string, PlanModelInput]>;
const fixtures = inputs.map(([name, input]) => ({
  name,
  input,
  expected: buildPlanModel(input),
}));
writeFileSync(
  new URL(
    "../backend/crates/taff-domain/tests/fixtures/plan-model-golden.json",
    import.meta.url,
  ),
  `${JSON.stringify(fixtures)}\n`,
);
console.log(`${fixtures.length} timeline read model fixtures`);
