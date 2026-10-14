import type { GraphEdge, GraphNode, RelationGraph } from "@taff/schemas/graph";
import { describe, expect, it } from "vitest";
import {
  COLUMN,
  COLUMN_WIDTH,
  columnX,
  fitView,
  forceLayout,
  hash,
  layeredLayout,
  nodeOrder,
  seededRandom,
  visibleGraph,
  zoomAt,
} from "./graph-layout";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const node = (
  kind: GraphNode["kind"],
  n: number,
  extra: Partial<GraphNode> = {},
): GraphNode => ({
  key: `${kind}:${id(n)}`,
  kind,
  id: id(n),
  label: `${kind} ${n}`,
  ...extra,
});
const edge = (
  kind: GraphEdge["kind"],
  layer: GraphEdge["layer"],
  from: GraphNode,
  to: GraphNode,
): GraphEdge => ({
  key: `${kind}:${from.key}>${to.key}`,
  kind,
  layer,
  from: from.key,
  to: to.key,
});

const workspace = node("workspace", 1);
const project = node("project", 2);
const parent = node("task", 3, { projectId: id(2), parentId: null });
const child = node("task", 4, { projectId: id(2), parentId: id(3) });
const sibling = node("task", 5, { projectId: id(2), parentId: null });
const person = node("person", 6);
const agent = node("agent", 7);
const company = node("company", 8);
const contact = node("contact", 9);
const nodes = [
  contact,
  sibling,
  agent,
  child,
  person,
  company,
  parent,
  project,
  workspace,
];
const edges = [
  edge("contains", "org", workspace, project),
  edge("contains", "org", project, parent),
  edge("contains", "org", parent, child),
  edge("contains", "org", project, sibling),
  edge("owns", "people", person, parent),
  edge("works_on", "people", agent, child),
  edge("depends_on", "dependencies", sibling, parent),
  edge("client_of", "org", company, project),
  edge("contact_of", "crm", contact, company),
];
const graph: RelationGraph = {
  workspaceId: id(1),
  projectId: null,
  layers: ["people", "dependencies", "org", "crm"],
  crmVisible: true,
  nodes,
  edges,
};

describe("layers", () => {
  it("keeps structural nodes and drops people without a visible edge", () => {
    const visible = visibleGraph(graph, ["dependencies"]);
    expect(visible.nodes.map((entry) => entry.kind).sort()).toEqual([
      "project",
      "task",
      "task",
      "task",
      "workspace",
    ]);
    expect(visible.edges.map((entry) => entry.kind)).toEqual(["depends_on"]);
  });
  it("shows every node with every layer on", () => {
    expect(visibleGraph(graph, graph.layers).nodes).toHaveLength(9);
  });
});

describe("node order", () => {
  it("goes column by column with subtasks after their parent", () => {
    expect(nodeOrder(nodes).map((entry) => entry.key)).toEqual([
      contact.key,
      company.key,
      workspace.key,
      project.key,
      parent.key,
      child.key,
      sibling.key,
      agent.key,
      person.key,
    ]);
  });
});

describe("layered layout", () => {
  const positions = layeredLayout(nodes, edges);
  it("puts each kind in its column and indents subtasks", () => {
    expect(positions[project.key]?.x).toBe(COLUMN.project * COLUMN_WIDTH);
    expect(positions[parent.key]?.x).toBe(COLUMN.task * COLUMN_WIDTH);
    expect(positions[child.key]?.x).toBe(COLUMN.task * COLUMN_WIDTH + 16);
    expect(positions[agent.key]?.x).toBe(positions[person.key]?.x);
    expect(positions[person.key]?.x).toBe(columnX("person"));
    expect(columnX("person") - columnX("task")).toBeGreaterThan(COLUMN_WIDTH);
  });
  it("keeps nodes in a column apart", () => {
    const ys = [parent, child, sibling].map(
      (entry) => positions[entry.key]?.y ?? 0,
    );
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(32);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(32);
  });
  it("is deterministic whatever the input order", () => {
    expect(layeredLayout([...nodes].reverse(), [...edges].reverse())).toEqual(
      positions,
    );
  });
});

describe("force layout", () => {
  it("is deterministic for a seed, whatever the input order", () => {
    const a = forceLayout(nodes, edges, 7);
    const b = forceLayout([...nodes].reverse(), edges, 7);
    expect(b).toEqual(a);
    expect(Object.keys(a)).toHaveLength(nodes.length);
  });
  it("changes with the seed and keeps nodes apart", () => {
    const a = forceLayout(nodes, edges, 7);
    expect(forceLayout(nodes, edges, 8)).not.toEqual(a);
    const points = Object.values(a);
    for (let i = 0; i < points.length; i++)
      for (let j = i + 1; j < points.length; j++)
        expect(
          Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y),
        ).toBeGreaterThan(5);
  });
  it("uses a stable hash and generator", () => {
    expect(hash("task:a")).toBe(hash("task:a"));
    expect(hash("task:a")).not.toBe(hash("task:b"));
    const random = seededRandom(42);
    const again = seededRandom(42);
    const values = [random(), random(), random()];
    expect([again(), again(), again()]).toEqual(values);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("view", () => {
  it("fits every point inside the viewport", () => {
    const points = [
      { x: -100, y: -50 },
      { x: 300, y: 200 },
    ];
    const view = fitView(points, 800, 600);
    for (const p of points) {
      const sx = p.x * view.k + view.x;
      const sy = p.y * view.k + view.y;
      expect(sx).toBeGreaterThanOrEqual(0);
      expect(sx).toBeLessThanOrEqual(800);
      expect(sy).toBeGreaterThanOrEqual(0);
      expect(sy).toBeLessThanOrEqual(600);
    }
  });
  it("zooms around a fixed screen point and clamps", () => {
    const view = { k: 1, x: 10, y: 20 };
    const zoomed = zoomAt(view, 2, 100, 100);
    expect(zoomed.k).toBe(2);
    // The world point under (100, 100) stays under it.
    expect((100 - zoomed.x) / zoomed.k).toBeCloseTo((100 - view.x) / view.k);
    expect(zoomAt(view, 100, 0, 0).k).toBe(3);
    expect(zoomAt(view, 0.001, 0, 0).k).toBe(0.25);
  });
});
