import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import {
  CHECK_STEPS,
  type CheckReport,
  checkMarkdown,
  checkResult,
  leftOut,
  parseCheckArgs,
  remoteDatabases,
  type StepResult,
} from "./check-plan.ts";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const step = (status: StepResult["status"], id = "lint"): StepResult => ({
  id,
  command: `pnpm ${id}`,
  status,
  seconds: 1,
});

test("the gate covers every command the release closeout names", () => {
  // One paragraph in the closeout is the list; keep the two from drifting.
  const closeout = read("docs/release-closeout.md").replace(/\s+/g, " ");
  for (const command of [
    "pnpm lint",
    "pnpm typecheck",
    "pnpm licence:check",
    "pnpm test",
    "pnpm build",
    "pnpm build:server",
    "pnpm perf:budget",
    "pnpm e2e",
    'SSR_PRODUCTION=1 pnpm e2e e2e/ssr-session.spec.ts --grep "production SSR HTML is private"',
    "pnpm mcp:smoke",
    "pnpm rust:gate",
  ]) {
    expect(closeout, command).toContain(command);
    expect(
      CHECK_STEPS.map((item) => item.command),
      command,
    ).toContain(command);
  }
  expect(closeout).toContain("`release:checklist`");
  expect(CHECK_STEPS.map((item) => item.command)).toContain(
    "pnpm release:checklist",
  );
  expect(
    CHECK_STEPS.filter((item) => item.argv[0] === "docker").map((item) =>
      item.argv.slice(3, -3).join(" "),
    ),
  ).toEqual([
    "deploy/Dockerfile.server --build-arg TARGET=api",
    "deploy/Dockerfile.server --build-arg TARGET=worker",
    "deploy/Dockerfile.web",
    "deploy/Dockerfile.render",
    "deploy/Dockerfile.api-rs",
  ]);
});

test("every pnpm step is a script that exists, and ids are unique", () => {
  const scripts = JSON.parse(read("package.json")).scripts as Record<
    string,
    string
  >;
  for (const item of CHECK_STEPS)
    if (item.argv[0] === "pnpm")
      expect(scripts, item.id).toHaveProperty(item.argv[1]);
  expect(scripts.check).toContain("scripts/check.mts");
  expect(new Set(CHECK_STEPS.map((item) => item.id)).size).toBe(
    CHECK_STEPS.length,
  );
});

test("stack steps are contiguous, after the builds and the dev browser run", () => {
  const ids = CHECK_STEPS.map((item) => item.id);
  const stack = CHECK_STEPS.filter((item) => item.needsStack).map(
    (item) => item.id,
  );
  expect(stack).toEqual(["ssr", "checklist", "mcp"]);
  expect(CHECK_STEPS.find((item) => item.id === "ssr")?.env).toEqual({
    SSR_PRODUCTION: "1",
    CI: "",
  });
  expect(ids.slice(ids.indexOf("ssr"), ids.indexOf("mcp") + 1)).toEqual(stack);
  for (const before of [
    "db-migrate",
    "db-seed",
    "build",
    "build-server",
    "e2e",
  ])
    expect(ids.indexOf(before)).toBeLessThan(ids.indexOf("ssr"));
});

test("AGENTS.md declares the baseline, the check command and the stop list", () => {
  const rules = read("AGENTS.md");
  expect(rules).toMatch(/^Baseline: tda01 start@[0-9]+$/m);
  expect(rules).toMatch(/^Check: `pnpm check`$/m);
  expect(rules).toMatch(/Stop and report/);
  expect(rules.split("\n").length).toBeLessThanOrEqual(200);
});

test("arguments: defaults, lists, and refusals", () => {
  expect(parseCheckArgs([])).toEqual({
    only: [],
    skip: [],
    allowDirty: false,
    list: false,
  });
  expect(parseCheckArgs(["--only", "lint,test", "--allow-dirty"])).toEqual({
    only: ["lint", "test"],
    skip: [],
    allowDirty: true,
    list: false,
  });
  expect(parseCheckArgs(["--skip", "e2e"]).skip).toEqual(["e2e"]);
  expect(parseCheckArgs(["--list"]).list).toBe(true);
  expect(() => parseCheckArgs(["--only", "nope"])).toThrow("Unknown step");
  expect(() => parseCheckArgs(["--only"])).toThrow("needs a comma-separated");
  expect(() => parseCheckArgs(["--only", "lint", "--skip", "e2e"])).toThrow(
    "not both",
  );
  expect(() => parseCheckArgs(["--fast"])).toThrow("Unknown option");
});

test("left-out steps: everything else for --only, the named ones for --skip", () => {
  const only = leftOut(parseCheckArgs(["--only", "lint"]));
  expect(only.has("lint")).toBe(false);
  expect(only.size).toBe(CHECK_STEPS.length - 1);
  expect([...leftOut(parseCheckArgs(["--skip", "e2e,mcp"]))]).toEqual([
    "e2e",
    "mcp",
  ]);
  expect(leftOut(parseCheckArgs([])).size).toBe(0);
});

test("database URLs must be loopback; names are returned, never values", () => {
  expect(
    remoteDatabases({
      DATABASE_URL: "postgres://taff:pw@127.0.0.1:55432/taff",
      TEST_DATABASE_URL: "postgres://taff:pw@localhost:55432/taff_test",
    }),
  ).toEqual([]);
  expect(
    remoteDatabases({ DATABASE_URL: "postgres://u:pw@[::1]/taff" }),
  ).toEqual([]);
  expect(
    remoteDatabases({
      DATABASE_URL: "postgres://taff:pw@db.example.com:5432/taff",
      TEST_DATABASE_URL: "postgres://taff:pw@10.0.0.8/taff_test",
    }),
  ).toEqual(["DATABASE_URL", "TEST_DATABASE_URL"]);
  expect(remoteDatabases({ DATABASE_URL: "not a url" })).toEqual([
    "DATABASE_URL",
  ]);
  expect(remoteDatabases({})).toEqual([]);
});

test("only a clean run of every step passes", () => {
  expect(checkResult([step("passed"), step("passed", "test")], true)).toBe(
    "passed",
  );
  expect(checkResult([step("passed"), step("not run", "test")], true)).toBe(
    "partial",
  );
  expect(checkResult([step("passed")], false)).toBe("partial");
  expect(checkResult([step("failed"), step("not run", "test")], true)).toBe(
    "failed",
  );
  expect(checkResult([step("failed")], false)).toBe("failed");
});

test("the report table names the tree, each command and why a step did not run", () => {
  const report: CheckReport = {
    tree: "735ca43734c1bec3f7adc6e04c67113ea9c1db8b",
    commit: "455c5497bae82ebc152904327fbccd556d6fb41d",
    clean: true,
    startedAt: "2026-11-15T00:00:00.000Z",
    node: "v26.0.0",
    result: "failed",
    steps: [
      step("passed"),
      { ...step("failed", "test"), seconds: 61.4 },
      {
        ...step("not run", "e2e"),
        seconds: 0,
        reason: "an earlier step failed",
      },
    ],
  };
  expect(checkMarkdown(report)).toBe(
    [
      "Tree: `735ca43734c1bec3f7adc6e04c67113ea9c1db8b` (commit `455c5497bae82ebc152904327fbccd556d6fb41d`, clean checkout), Node v26.0.0. Result: **failed**.",
      "",
      "| Command | Result | Time |",
      "| --- | --- | --- |",
      "| `pnpm lint` | passed | 1 s |",
      "| `pnpm test` | failed | 61 s |",
      "| `pnpm e2e` | not run (an earlier step failed) |  |",
    ].join("\n"),
  );
  expect(checkMarkdown({ ...report, clean: false })).toContain(
    "working tree had changes",
  );
});
