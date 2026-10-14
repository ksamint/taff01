import { relationGraphSchema } from "@taff/schemas";
import { describe, expect, it } from "vitest";
import { type RelationGraphInput, relationGraph } from "./relation-graph";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const W = id(1);
const P1 = id(10);
const P2 = id(11);
const ARCHIVED = id(12);
const LIN = id(20);
const CHEN = id(21);
const AGENT = id(22);
const IDLE = id(23);
const CO = id(30);
const OTHER_CO = id(31);
const WONG = id(40);
const LEE = id(41);
const T = (n: number) => id(100 + n);
const task = (
  n: number,
  fields: Partial<RelationGraphInput["tasks"][number]> = {},
): RelationGraphInput["tasks"][number] => ({
  id: T(n),
  number: n,
  title: `Task ${n}`,
  projectId: P1,
  parentId: null,
  status: "todo",
  ownerId: LIN,
  workerId: null,
  ...fields,
});
function input(fields: Partial<RelationGraphInput> = {}): RelationGraphInput {
  return {
    workspace: { id: W, name: "Northwind", key: "NW" },
    projectId: null,
    layers: ["people", "dependencies", "org", "crm"],
    crmVisible: true,
    projects: [
      { id: P1, name: "Checkout v2", archived: false, clientCompanyId: CO },
      { id: P2, name: "Analytics", archived: false, clientCompanyId: null },
      { id: ARCHIVED, name: "Old", archived: true, clientCompanyId: null },
    ],
    // Deliberately out of order: the model sorts.
    tasks: [
      task(3, { parentId: T(1), workerId: AGENT, status: "in_progress" }),
      task(1),
      task(2, { ownerId: CHEN }),
      task(5, { projectId: P2, ownerId: CHEN }),
      task(6, { projectId: null }),
      task(7, { projectId: ARCHIVED }),
    ],
    members: [
      { id: LIN, name: "Lin Xiao", kind: "person", role: "admin" },
      { id: CHEN, name: "Chen Mo", kind: "person", role: "member" },
      { id: AGENT, name: "Ops Agent", kind: "agent", role: "member" },
      { id: IDLE, name: "Idle", kind: "person", role: "guest" },
    ],
    supervisors: [{ agentId: AGENT, supervisorId: LIN }],
    dependencies: [
      { predecessorTaskId: T(1), successorTaskId: T(2) },
      { predecessorTaskId: T(5), successorTaskId: T(2) },
    ],
    companies: [
      { id: CO, name: "Northwind Retail", industry: "Retail" },
      { id: OTHER_CO, name: "HuiTong Pay", industry: "Payments" },
    ],
    contacts: [
      { id: WONG, name: "Wong", title: "Chairman", companyId: CO },
      { id: LEE, name: "Lee", title: "Ops", companyId: OTHER_CO },
    ],
    projectContacts: [
      { projectId: P1, contactId: WONG },
      { projectId: P1, contactId: LEE },
    ],
    taskContacts: [{ taskId: T(2), contactId: LEE }],
    ...fields,
  };
}
const edge = (kind: string, from: string, to: string) =>
  expect.objectContaining({ kind, from, to });

describe("relation graph", () => {
  const graph = relationGraph(input());
  it("matches the shared schema and never carries phone or email", () => {
    expect(relationGraphSchema.parse(graph)).toEqual(graph);
    expect(JSON.stringify(graph)).not.toMatch(/phone|email|@/);
  });
  it("roots the workspace and orders nodes by kind, then name or number", () => {
    expect(graph.nodes.map((node) => node.key)).toEqual([
      `workspace:${W}`,
      `project:${P2}`,
      `project:${P1}`,
      `task:${T(1)}`,
      `task:${T(2)}`,
      `task:${T(3)}`,
      `task:${T(5)}`,
      `task:${T(6)}`,
      `person:${CHEN}`,
      `person:${LIN}`,
      `agent:${AGENT}`,
      `company:${OTHER_CO}`,
      `company:${CO}`,
      `contact:${LEE}`,
      `contact:${WONG}`,
    ]);
    expect(graph.nodes.find((node) => node.id === T(3))).toMatchObject({
      ref: "NW-3",
      parentId: T(1),
      projectId: P1,
      status: "in_progress",
    });
  });
  it("leaves out archived projects with their tasks and unlinked members", () => {
    const ids = graph.nodes.map((node) => node.id);
    expect(ids).not.toContain(ARCHIVED);
    expect(ids).not.toContain(T(7));
    expect(ids).not.toContain(IDLE);
  });
  it("types every edge into its layer", () => {
    expect(graph.edges).toEqual([
      edge("owns", `person:${LIN}`, `task:${T(1)}`),
      edge("owns", `person:${LIN}`, `task:${T(3)}`),
      edge("owns", `person:${LIN}`, `task:${T(6)}`),
      edge("owns", `person:${CHEN}`, `task:${T(2)}`),
      edge("owns", `person:${CHEN}`, `task:${T(5)}`),
      edge("works_on", `agent:${AGENT}`, `task:${T(3)}`),
      edge("supervises", `person:${LIN}`, `agent:${AGENT}`),
      edge("depends_on", `task:${T(2)}`, `task:${T(1)}`),
      edge("depends_on", `task:${T(2)}`, `task:${T(5)}`),
      edge("contains", `project:${P1}`, `task:${T(1)}`),
      edge("contains", `project:${P1}`, `task:${T(2)}`),
      edge("contains", `project:${P2}`, `task:${T(5)}`),
      edge("contains", `task:${T(1)}`, `task:${T(3)}`),
      edge("contains", `workspace:${W}`, `project:${P1}`),
      edge("contains", `workspace:${W}`, `project:${P2}`),
      edge("contains", `workspace:${W}`, `task:${T(6)}`),
      edge("client_of", `company:${CO}`, `project:${P1}`),
      edge("stakeholder_of", `contact:${WONG}`, `project:${P1}`),
      edge("stakeholder_of", `contact:${LEE}`, `project:${P1}`),
      edge("stakeholder_of", `contact:${LEE}`, `task:${T(2)}`),
      edge("contact_of", `contact:${WONG}`, `company:${CO}`),
      edge("contact_of", `contact:${LEE}`, `company:${OTHER_CO}`),
    ]);
    const layerOf = Object.fromEntries(
      graph.edges.map((item) => [item.kind, item.layer]),
    );
    expect(layerOf).toEqual({
      contains: "org",
      client_of: "org",
      owns: "people",
      works_on: "people",
      supervises: "people",
      depends_on: "dependencies",
      stakeholder_of: "crm",
      contact_of: "crm",
    });
  });
  it("is deterministic whatever the input order", () => {
    const shuffled = input();
    shuffled.tasks.reverse();
    shuffled.members.reverse();
    shuffled.projects.reverse();
    shuffled.contacts.reverse();
    shuffled.dependencies.reverse();
    expect(relationGraph(shuffled)).toEqual(graph);
  });
  it("scopes to one project and brings dependency neighbours along", () => {
    const scoped = relationGraph(input({ projectId: P1 }));
    const keys = scoped.nodes.map((node) => node.key);
    expect(keys).toContain(`task:${T(5)}`);
    expect(keys).not.toContain(`project:${P2}`);
    expect(keys).not.toContain(`task:${T(6)}`);
    expect(scoped.edges).toContainEqual(
      edge("depends_on", `task:${T(2)}`, `task:${T(5)}`),
    );
    // The neighbour's project is out of scope, so it has no container.
    expect(
      scoped.edges.filter(
        (item) => item.to === `task:${T(5)}` && item.kind === "contains",
      ),
    ).toEqual([]);
    // An archived project is readable when asked for by id.
    const old = relationGraph(input({ projectId: ARCHIVED }));
    expect(old.nodes.map((node) => node.id)).toEqual([W, ARCHIVED, T(7), LIN]);
  });
  it("builds only the requested layers", () => {
    const deps = relationGraph(input({ layers: ["dependencies"] }));
    expect(deps.layers).toEqual(["dependencies"]);
    expect(new Set(deps.edges.map((item) => item.kind))).toEqual(
      new Set(["depends_on"]),
    );
    expect(deps.nodes.some((node) => node.kind === "person")).toBe(false);
    expect(deps.nodes.some((node) => node.kind === "contact")).toBe(false);
    const ordered = relationGraph(input({ layers: ["crm", "people"] }));
    expect(ordered.layers).toEqual(["people", "crm"]);
    expect(ordered.edges.some((item) => item.kind === "client_of")).toBe(false);
  });
  it("builds no CRM node without contact:read", () => {
    const hidden = relationGraph(input({ crmVisible: false }));
    expect(hidden.crmVisible).toBe(false);
    expect(
      hidden.nodes.filter(
        (node) => node.kind === "company" || node.kind === "contact",
      ),
    ).toEqual([]);
    expect(
      hidden.edges.filter(
        (item) => item.layer === "crm" || item.kind === "client_of",
      ),
    ).toEqual([]);
  });
  it("handles an empty workspace", () => {
    const empty = relationGraph(
      input({
        projects: [],
        tasks: [],
        dependencies: [],
        projectContacts: [],
        taskContacts: [],
      }),
    );
    expect(empty.nodes.map((node) => node.kind)).toEqual(["workspace"]);
    expect(empty.edges).toEqual([]);
  });
});
