import type {
  MindEdge,
  MindMap,
  MindNode,
  MindSource,
} from "@taff/schemas/mind";
import { describe, expect, it } from "vitest";
import {
  canvasExtent,
  civilDateAfter,
  coverage,
  edgePath,
  freeAngle,
  hasEdge,
  labelPlacement,
  lineage,
  linksOf,
  nodePoint,
  nodeRadius,
  nodesCiting,
  onPath,
  polar,
  readingOrder,
  ringCount,
  ringRadius,
  sourceHost,
  sourcesOf,
  trends,
  withEdge,
  withLink,
  withNode,
  withoutEdge,
  withoutLink,
  withSource,
} from "./mind-model";

const W = "00000000-0000-4000-8000-000000000000";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = "2026-10-14T00:00:00.000Z";
const node = (n: number, extra: Partial<MindNode> = {}): MindNode => ({
  id: id(n),
  workspaceId: W,
  title: `Node ${n}`,
  layer: 0,
  angle: 0,
  strength: 3,
  momentum: 0,
  note: "",
  taskId: null,
  archivedAt: null,
  version: 1,
  createdAt: at,
  updatedAt: at,
  ...extra,
});
const edge = (n: number, from: number, to: number): MindEdge => ({
  id: id(100 + n),
  workspaceId: W,
  fromNodeId: id(from),
  toNodeId: id(to),
  kind: "relates",
  version: 1,
  createdAt: at,
});
const source = (n: number, extra: Partial<MindSource> = {}): MindSource => ({
  id: id(200 + n),
  workspaceId: W,
  title: `Source ${n}`,
  url: null,
  note: "",
  archivedAt: null,
  version: 1,
  createdAt: at,
  updatedAt: at,
  ...extra,
});
const link = (nodeN: number, sourceN: number) => ({
  id: id(300 + nodeN * 10 + sourceN),
  workspaceId: W,
  nodeId: id(nodeN),
  sourceId: id(200 + sourceN),
  createdAt: at,
});
const map = (extra: Partial<MindMap> = {}): MindMap => ({
  workspaceId: W,
  nodes: [],
  edges: [],
  sources: [],
  nodeSources: [],
  canWrite: true,
  canArchive: true,
  ...extra,
});

describe("geometry", () => {
  it("places rings 85 apart from 80, angles clockwise from the top", () => {
    expect([0, 1, 2, 3].map(ringRadius)).toEqual([80, 165, 250, 335]);
    expect(polar(100, 0)).toEqual({ x: 0, y: -100 });
    expect(polar(100, 90)).toEqual({ x: 100, y: 0 });
    expect(polar(100, 180)).toEqual({ x: 0, y: 100 });
    expect(nodePoint(node(1, { layer: 1, angle: 270 }))).toEqual({
      x: -165,
      y: 0,
    });
  });
  it("keeps four rings and grows with the outermost node", () => {
    expect(ringCount([])).toBe(4);
    expect(ringCount([node(1, { layer: 2 })])).toBe(4);
    expect(ringCount([node(1, { layer: 6 })])).toBe(7);
    expect(canvasExtent(4)).toBe(470);
  });
  it("sizes dots by strength and anchors labels away from the centre", () => {
    expect(nodeRadius(1)).toBeCloseTo(8.4);
    expect(nodeRadius(5)).toBeCloseTo(14);
    expect(labelPlacement(node(1, { angle: 90 })).anchor).toBe("start");
    expect(labelPlacement(node(1, { angle: 270 })).anchor).toBe("end");
    const top = labelPlacement(node(1, { angle: 0 }));
    expect(top.anchor).toBe("middle");
    expect(top.y).toBeLessThan(-ringRadius(0));
    expect(labelPlacement(node(1, { angle: 180 })).y).toBeGreaterThan(
      ringRadius(0),
    );
  });
  it("draws links through the mid radius", () => {
    expect(
      edgePath(node(1, { layer: 0, angle: 0 }), node(2, { layer: 1 })),
    ).toBe("M0,-80 C0,-122.5 0,-122.5 0,-165");
  });
});

describe("lineage and lists", () => {
  // 1 → 2 → 3, 4 → 2, 3 → 5; 6 alone.
  const nodes = [1, 2, 3, 4, 5, 6].map((n) => node(n));
  const edges = [edge(1, 1, 2), edge(2, 2, 3), edge(3, 4, 2), edge(4, 3, 5)];
  it("follows links backwards and forwards", () => {
    const family = lineage(edges, id(2));
    expect([...family.ancestors].sort()).toEqual([id(1), id(4)]);
    expect([...family.descendants].sort()).toEqual([id(3), id(5)]);
    expect(onPath(edges[0] as MindEdge, id(2), family)).toBe(true);
    expect(onPath(edges[3] as MindEdge, id(2), family)).toBe(true);
    const leaf = lineage(edges, id(6));
    expect(leaf.ancestors.size + leaf.descendants.size).toBe(0);
  });
  it("survives a cycle", () => {
    const family = lineage([edge(1, 1, 2), edge(2, 2, 1)], id(1));
    expect([...family.ancestors]).toEqual([id(2)]);
    expect([...family.descendants]).toEqual([id(2)]);
  });
  it("lists direct links with direction", () => {
    const links = linksOf(map({ nodes, edges }), id(2));
    expect(links.map((item) => [item.other.id, item.outgoing]).sort()).toEqual([
      [id(1), false],
      [id(3), true],
      [id(4), false],
    ]);
    expect(hasEdge(map({ edges }), id(2), id(1))).toBe(true);
    expect(hasEdge(map({ edges }), id(1), id(3))).toBe(false);
  });
  it("orders by ring, angle and title", () => {
    const order = readingOrder([
      node(1, { layer: 1, angle: 10 }),
      node(2, { layer: 0, angle: 200 }),
      node(3, { layer: 0, angle: 20 }),
    ]);
    expect(order.map((item) => item.id)).toEqual([id(3), id(2), id(1)]);
  });
  it("lists the six strongest rising nodes and every cooling one", () => {
    const many = [
      ...[1, 2, 3, 4, 5, 6, 7].map((n) =>
        node(n, { momentum: 1, strength: (n % 5) + 1 }),
      ),
      node(8, { momentum: 2, strength: 5 }),
      node(9, { momentum: -1 }),
      node(10, { momentum: -2, archivedAt: at }),
    ];
    const { rising, cooling } = trends(many);
    expect(rising).toHaveLength(6);
    expect(rising[0]?.id).toBe(id(8));
    expect(rising.every((item) => item.momentum > 0)).toBe(true);
    expect(cooling.map((item) => item.id)).toEqual([id(9)]);
  });
});

describe("sources", () => {
  const data = map({
    nodes: [node(1), node(2), node(3)],
    sources: [source(1, { url: "https://www.example.org/a" }), source(2)],
    nodeSources: [link(1, 1), link(1, 2), link(2, 1)],
  });
  it("finds a node's sources and a source's nodes", () => {
    expect(sourcesOf(data, id(1)).map((s) => s.title)).toEqual([
      "Source 1",
      "Source 2",
    ]);
    expect(nodesCiting(data, id(201)).map((n) => n.id)).toEqual([id(1), id(2)]);
  });
  it("counts nodes with evidence", () => {
    expect(coverage(data)).toEqual({ cited: 2, total: 3 });
    expect(
      coverage({
        ...data,
        sources: [source(1, { archivedAt: at }), source(2)],
      }),
    ).toEqual({ cited: 1, total: 3 });
  });
  it("shows a host for http(s) URLs only", () => {
    expect(sourceHost("https://www.example.org/a")).toBe("example.org");
    expect(sourceHost("https://doi.org/10.1/x")).toBe("doi.org");
    expect(sourceHost(null)).toBeNull();
    expect(sourceHost("not a url")).toBeNull();
  });
});

describe("new node angle and due date", () => {
  it("picks the middle of the widest gap on the ring", () => {
    expect(freeAngle([], 2)).toBe(0);
    expect(freeAngle([node(1, { layer: 0, angle: 90 })], 0)).toBe(270);
    expect(
      freeAngle(
        [
          node(1, { angle: 0 }),
          node(2, { angle: 90 }),
          node(3, { angle: 180 }),
          node(4, { angle: 300 }),
        ],
        0,
      ),
    ).toBe(240);
    // Other rings and archived nodes do not count.
    expect(
      freeAngle(
        [
          node(1, { angle: 10, layer: 1 }),
          node(2, { angle: 0, archivedAt: at }),
        ],
        0,
      ),
    ).toBe(0);
  });
  it("counts days from today in the person's zone", () => {
    const now = new Date("2026-10-14T20:00:00Z");
    expect(civilDateAfter(5, "UTC", now)).toBe("2026-10-19");
    // Already 15 October in Hong Kong.
    expect(civilDateAfter(5, "Asia/Hong_Kong", now)).toBe("2026-10-20");
    expect(civilDateAfter(20, "UTC", now)).toBe("2026-11-03");
  });
});

describe("optimistic cache edits", () => {
  const base = map({
    nodes: [node(1), node(2)],
    edges: [edge(1, 1, 2)],
    sources: [source(1)],
    nodeSources: [link(1, 1)],
  });
  it("adds, replaces and archives nodes with their links", () => {
    const added = withNode(base, node(3), false);
    expect(added.nodes).toHaveLength(3);
    const renamed = withNode(
      base,
      node(1, { title: "New", version: 2 }),
      false,
    );
    expect(renamed.nodes[0]?.title).toBe("New");
    const archived = withNode(base, node(1, { archivedAt: at }), false);
    expect(archived.nodes.map((n) => n.id)).toEqual([id(2)]);
    expect(archived.edges).toEqual([]);
    expect(archived.nodeSources).toEqual([]);
    const kept = withNode(base, node(1, { archivedAt: at }), true);
    expect(kept.nodes[0]?.archivedAt).toBe(at);
    expect(kept.edges).toHaveLength(1);
  });
  it("adds, edits and removes edges", () => {
    const more = withEdge(base, edge(2, 2, 1));
    expect(more.edges).toHaveLength(2);
    const edited = withEdge(base, { ...edge(1, 1, 2), kind: "supports" });
    expect(edited.edges.map((e) => e.kind)).toEqual(["supports"]);
    expect(withoutEdge(base, id(101)).edges).toEqual([]);
  });
  it("adds and archives sources, and links them once", () => {
    const added = withSource(base, source(0, { title: "A first" }), false);
    expect(added.sources.map((s) => s.title)).toEqual(["A first", "Source 1"]);
    const archived = withSource(base, source(1, { archivedAt: at }), false);
    expect(archived.sources).toEqual([]);
    expect(archived.nodeSources).toEqual([]);
    expect(withLink(base, link(1, 1))).toBe(base);
    expect(withLink(base, link(2, 1)).nodeSources).toHaveLength(2);
    expect(withoutLink(base, id(1), id(201)).nodeSources).toEqual([]);
  });
});
