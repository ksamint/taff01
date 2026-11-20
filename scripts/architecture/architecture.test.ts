import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { focusModel } from "./focus-model.ts";
import { inventory, repoRoot } from "./inventory.ts";
import { assign, render } from "./model.ts";
import { MODULES } from "./modules.ts";

// Spec docs/spec/tooling.md TT-9: the architecture model follows the code.
const found = inventory();
const assignment = assign(found);

test("the scan finds every kind of thing the model maps", () => {
  expect(found.tables.length).toBeGreaterThan(0);
  expect(found.routes.length).toBeGreaterThan(0);
  expect(found.tools.length).toBeGreaterThan(0);
  expect(found.core.length).toBeGreaterThan(0);
  expect(found.pages.length).toBeGreaterThan(0);
  // timeline.ts imports the three planning tables; a broken scan loses them.
  expect(
    found.core.find((file) => file.name === "timeline.ts")?.tables,
  ).toEqual(
    expect.arrayContaining(["milestones", "task_dependencies", "task_plans"]),
  );
});

test("every table, core file, route, tool and page belongs to one module", () => {
  expect(assignment.unmapped).toEqual([]);
  expect(assignment.conflicts).toEqual([]);
});

test("module ids are unique and every listed screen and source file exists", () => {
  expect(new Set(MODULES.map((module) => module.id)).size).toBe(MODULES.length);
  const missing: string[] = [];
  for (const module of MODULES)
    for (const file of [
      ...(module.components ?? []).map(
        (name) => `apps/web/src/components/${name}`,
      ),
      ...(module.sources ?? []),
    ])
      try {
        readFileSync(path.join(repoRoot, file));
      } catch {
        missing.push(`${module.id}: ${file}`);
      }
  expect(missing).toEqual([]);
});

test("the committed generated model is current", () => {
  expect(
    readFileSync(
      path.join(repoRoot, "architecture/generated/modules.c4"),
      "utf8",
    ),
  ).toBe(render(assignment));
});

test("the function map places every module, permission action, spec and flow step", () => {
  const map = focusModel(found);
  expect(map.problems).toEqual([]);
  expect(map.modules.map((module) => module.id).sort()).toEqual(
    MODULES.map((module) => module.id).sort(),
  );
  // Every action of the generated permissions matrix is some module's function.
  const actions = map.modules.flatMap((module) => module.functions);
  expect(actions.length).toBeGreaterThan(0);
  expect(new Set(actions.map((fn) => fn.action)).size).toBe(actions.length);
  expect(
    map.modules.find((module) => module.id === "tasks")?.functions,
  ).toContainEqual({
    action: "task:create",
    roles: { admin: true, member: true, guest: false, agent: true },
  });
  // Planning reads the tasks table, so it depends on the tasks module.
  expect(
    map.modules
      .find((module) => module.id === "planning")
      ?.uses.map((use) => use.id),
  ).toContain("tasks");
});
