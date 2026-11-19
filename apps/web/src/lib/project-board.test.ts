import type { Member, Task } from "@taff/schemas/base";
import { GENERIC_OPERATION_SECTORS } from "@taff/schemas/operation-templates";
import { describe, expect, it } from "vitest";
import {
  agentShortName,
  filterProjectTasks,
  memberInitials,
  nestByParent,
  parseProjectView,
  sortProjectTasks,
} from "./project-board";

import { orderXidingSetupTasks } from "./xiding-setup-order";

const workspaceId = crypto.randomUUID();
const project = crypto.randomUUID();
const me = crypto.randomUUID();
const agent = crypto.randomUUID();
const other = crypto.randomUUID();
const members: Member[] = [
  {
    id: me,
    workspaceId,
    userId: "u",
    name: "Lin Xiao",
    kind: "person",
    role: "admin",
  },
  {
    id: agent,
    workspaceId,
    userId: null,
    name: "Research Agent",
    kind: "agent",
    role: "member",
  },
  {
    id: other,
    workspaceId,
    userId: "o",
    name: "Chen Mo",
    kind: "person",
    role: "member",
  },
];
let number = 0;
const task = (extra: Partial<Task> = {}): Task => ({
  id: crypto.randomUUID(),
  workspaceId,
  number: ++number,
  title: `Task ${number}`,
  description: "",
  priority: 3,
  projectId: project,
  labels: [],
  parentId: null,
  version: 1,
  ownerId: me,
  workerId: null,
  status: "todo",
  dueAt: null,
  createdAt: new Date(2026, 9, number).toISOString(),
  updatedAt: new Date(2026, 9, number).toISOString(),
  ...extra,
});
const query = {
  projectId: project,
  filter: "all" as const,
  agentId: null,
  label: "",
  memberId: me,
  members,
};

describe("project views", () => {
  it("reads ?view= and falls back to the board", () => {
    expect(parseProjectView("list")).toBe("list");
    expect(parseProjectView("mind")).toBe("mind");
    expect(parseProjectView("gantt")).toBe("board");
    expect(parseProjectView(null)).toBe("board");
  });
});

describe("project filters", () => {
  const mine = task({ labels: ["Launch"] });
  const agentWork = task({ workerId: agent, ownerId: other });
  const theirs = task({ ownerId: other, workerId: other });
  const elsewhere = task({ projectId: crypto.randomUUID() });
  const tasks = [mine, agentWork, theirs, elsewhere];

  it("keeps the selected project, or every project without one", () => {
    expect(filterProjectTasks(tasks, query)).toHaveLength(3);
    expect(filterProjectTasks(tasks, { ...query, projectId: "" })).toHaveLength(
      4,
    );
  });
  it("filters mine, agent work, one agent and labels", () => {
    expect(filterProjectTasks(tasks, { ...query, filter: "mine" })).toEqual([
      mine,
    ]);
    expect(filterProjectTasks(tasks, { ...query, filter: "agents" })).toEqual([
      agentWork,
    ]);
    expect(
      filterProjectTasks(tasks, { ...query, filter: "mine", agentId: agent }),
    ).toEqual([agentWork]);
    expect(filterProjectTasks(tasks, { ...query, label: " laun" })).toEqual([
      mine,
    ]);
  });
  it("sorts by priority, due date, title or newest", () => {
    const urgent = task({
      priority: 1,
      dueAt: "2026-10-20T00:00:00Z",
      title: "b",
    });
    const later = task({
      priority: 2,
      dueAt: "2026-10-10T00:00:00Z",
      title: "a",
    });
    expect(sortProjectTasks([later, urgent], "priority", "en")).toEqual([
      urgent,
      later,
    ]);
    expect(sortProjectTasks([urgent, later], "due", "en")).toEqual([
      later,
      urgent,
    ]);
    expect(sortProjectTasks([urgent, later], "title", "en")).toEqual([
      later,
      urgent,
    ]);
    expect(sortProjectTasks([urgent, later], "created", "en")).toEqual([
      later,
      urgent,
    ]);
  });
});

describe("parent ordering", () => {
  it("puts descendants under their parent and keeps orphans as roots", () => {
    const parent = task();
    const loose = task({ parentId: crypto.randomUUID() });
    const child = task({ parentId: parent.id });
    const grandchild = task({ parentId: child.id });
    const rows = nestByParent([grandchild, loose, child, parent]);
    expect(rows.map((row) => [row.task.id, row.nested])).toEqual([
      [loose.id, false],
      [parent.id, false],
      [child.id, true],
      [grandchild.id, true],
    ]);
  });
  it("never drops tasks in a parent cycle", () => {
    const a = task();
    const b = task({ parentId: a.id });
    a.parentId = b.id;
    expect(nestByParent([a, b])).toHaveLength(2);
  });
});

describe("names", () => {
  it("shortens agent names and builds initials", () => {
    expect(agentShortName("Research Agent")).toBe("Research");
    expect(agentShortName("調研智能體")).toBe("調研");
    expect(agentShortName("Agent")).toBe("Agent");
    expect(memberInitials("Lin Xiao")).toBe("LX");
    expect(memberInitials("林曉")).toBe("林");
    expect(memberInitials(" ")).toBe("?");
  });
});

it("orders only exact XIDING setup rows in their existing slots", () => {
  const setup = GENERIC_OPERATION_SECTORS.map(({ label }) =>
    task({ title: `設定指標目標 · ${label}`, labels: [label] }),
  );
  const wrongLabel = { ...task(), title: setup[0].title };
  const wrongTitle = task({ labels: setup[1].labels });
  const newestFirst = [
    setup[5],
    wrongLabel,
    setup[4],
    setup[3],
    wrongTitle,
    setup[2],
    setup[1],
    setup[0],
  ];
  expect(orderXidingSetupTasks(newestFirst, "Northwind")).toBe(newestFirst);
  expect(orderXidingSetupTasks(newestFirst, "XIDING")).toEqual([
    setup[0],
    wrongLabel,
    setup[1],
    setup[2],
    wrongTitle,
    setup[3],
    setup[4],
    setup[5],
  ]);
});
