import { expect, test } from "vitest";
import {
  GENERIC_OPERATION_SECTORS,
  groupBySector,
} from "./operation-templates";
import { labelsSchema } from "./primitives";

const task = (id: string, labels: string[], projectId: string | null) => ({
  id,
  labels,
  projectId,
});

test("OT-1.1 the generic operation template has the six sectors in order, each a valid task label", () => {
  expect(GENERIC_OPERATION_SECTORS.map((s) => s.label)).toEqual([
    "財務與現金",
    "客戶與市場",
    "營運與交付",
    "人才與組織",
    "風險與安全",
    "未來",
  ]);
  expect(
    labelsSchema.safeParse(GENERIC_OPERATION_SECTORS.map((s) => s.label))
      .success,
  ).toBe(true);
  for (const s of GENERIC_OPERATION_SECTORS) {
    expect(s.leading.length).toBeGreaterThan(0);
    expect(s.result.length).toBeGreaterThan(0);
  }
});

test("OT-1.2–1.4 tagged tasks regroup by sector and project; untagged tasks are left out", () => {
  const groups = groupBySector([
    task("a", ["財務與現金"], "p1"),
    task("b", ["urgent"], "p1"),
    task("c", ["財務與現金", "未來"], "p2"),
    task("d", ["財務與現金"], "p1"),
    task("e", [], null),
    task("f", ["客戶與市場"], null),
    task("g", ["財務與現金 "], "p1"),
  ]);
  expect(groups.map((g) => g.count)).toEqual([3, 1, 0, 0, 0, 1]);
  expect(groups[0].projects).toEqual([
    {
      projectId: "p1",
      tasks: [task("a", ["財務與現金"], "p1"), task("d", ["財務與現金"], "p1")],
    },
    { projectId: "p2", tasks: [task("c", ["財務與現金", "未來"], "p2")] },
  ]);
  expect(groups[1].projects).toEqual([
    { projectId: null, tasks: [task("f", ["客戶與市場"], null)] },
  ]);
  expect(groups[5].projects[0].tasks.map((t) => t.id)).toEqual(["c"]);
  const ids = groups.flatMap((g) =>
    g.projects.flatMap((p) => p.tasks.map((t) => t.id)),
  );
  expect(ids).not.toContain("b");
  expect(ids).not.toContain("e");
  expect(ids).not.toContain("g");
});

test("OT-1.3 project groups follow the workspace project order, no project last", () => {
  const [finance] = groupBySector(
    [
      task("x", ["財務與現金"], null),
      task("y", ["財務與現金"], "p2"),
      task("z", ["財務與現金"], "p9"),
      task("w", ["財務與現金"], "p1"),
    ],
    ["p1", "p2"],
  );
  expect(finance.projects.map((p) => p.projectId)).toEqual([
    "p1",
    "p2",
    "p9",
    null,
  ]);
});
