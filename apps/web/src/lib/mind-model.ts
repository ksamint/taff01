// Mind map (M18) view model: pure geometry, lineage, overview lists and the
// optimistic cache edits the mutation hooks apply. Prototype v2 Module Plan
// 552–599 (`buildMind`): rings at 80 + 85 × layer, angles clockwise from
// the top, curved links through the mid-radius, labels outside the dot.
import type {
  MindEdge,
  MindMap,
  MindNode,
  MindNodeSource,
  MindSource,
} from "@taff/schemas/mind";

export type Point = { x: number; y: number };

export const RING_BASE = 80;
export const RING_STEP = 85;
/** The prototype's four named rings; more rings appear when nodes use them. */
export const MIN_RINGS = 4;
export const MAX_LAYER = 9;
export const NAMED_LAYERS = 4;
/** Room around the outer ring for labels. */
const LABEL_MARGIN = 135;

export const ringRadius = (layer: number) => RING_BASE + RING_STEP * layer;
export const ringCount = (nodes: Pick<MindNode, "layer">[]) =>
  Math.max(MIN_RINGS, ...nodes.map((node) => node.layer + 1));
/** A strength of 1–5 as a dot radius (prototype: 6 + score / 11). */
export const nodeRadius = (strength: number) => 7 + strength * 1.4;

/** Degrees clockwise from the top. */
export function polar(radius: number, degrees: number): Point {
  const a = (degrees * Math.PI) / 180;
  // Rounded to 0.01; `+ 0` turns -0 into 0.
  const round = (v: number) => Math.round(v * 100) / 100 + 0;
  return { x: round(radius * Math.sin(a)), y: round(-radius * Math.cos(a)) };
}

export const nodePoint = (node: Pick<MindNode, "layer" | "angle">) =>
  polar(ringRadius(node.layer), node.angle);

/** Where a node's label sits, and how it anchors (prototype `lp`). */
export function labelPlacement(node: MindNode) {
  const r = nodeRadius(node.strength);
  const p = polar(ringRadius(node.layer) + r + 8, node.angle);
  const anchor: "start" | "end" | "middle" =
    p.x > 12 ? "start" : p.x < -12 ? "end" : "middle";
  const y = Math.abs(p.x) <= 12 ? (p.y < 0 ? p.y - 3 : p.y + 14) : p.y + 5;
  return { x: p.x, y, anchor };
}

/** A cubic link from one node to another through the mid radius. */
export function edgePath(
  from: Pick<MindNode, "layer" | "angle">,
  to: Pick<MindNode, "layer" | "angle">,
) {
  const r1 = ringRadius(from.layer);
  const r2 = ringRadius(to.layer);
  const rm = (r1 + r2) / 2;
  const p1 = polar(r1, from.angle);
  const c1 = polar(rm, from.angle);
  const c2 = polar(rm, to.angle);
  const p2 = polar(r2, to.angle);
  return `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
}

/** Half the side of the square that holds every ring and its labels. */
export const canvasExtent = (rings: number) =>
  ringRadius(rings - 1) + LABEL_MARGIN;

/**
 * Everything a node comes from (following links backwards) and everything
 * it leads to (forwards), as the prototype's `anc` and `desc` sets.
 */
export function lineage(edges: MindEdge[], id: string) {
  const up = new Map<string, string[]>();
  const down = new Map<string, string[]>();
  for (const edge of edges) {
    down.set(edge.fromNodeId, [
      ...(down.get(edge.fromNodeId) ?? []),
      edge.toNodeId,
    ]);
    up.set(edge.toNodeId, [...(up.get(edge.toNodeId) ?? []), edge.fromNodeId]);
  }
  const walk = (start: string, map: Map<string, string[]>) => {
    const seen = new Set<string>();
    const queue = [start];
    while (queue.length) {
      for (const next of map.get(queue.shift() as string) ?? [])
        if (next !== id && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
    }
    return seen;
  };
  return { ancestors: walk(id, up), descendants: walk(id, down) };
}

/** True when an edge lies on the selected node's upstream or downstream path. */
export function onPath(
  edge: MindEdge,
  selected: string,
  family: ReturnType<typeof lineage>,
) {
  const up = (key: string) => key === selected || family.ancestors.has(key);
  const down = (key: string) => key === selected || family.descendants.has(key);
  return (
    (up(edge.fromNodeId) && up(edge.toNodeId)) ||
    (down(edge.fromNodeId) && down(edge.toNodeId))
  );
}

/** Ring, then clockwise angle, then title: the order lists read in. */
export function readingOrder<T extends MindNode>(nodes: T[]): T[] {
  return [...nodes].sort(
    (a, b) =>
      a.layer - b.layer ||
      a.angle - b.angle ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  );
}

/** Rising (momentum > 0, strongest first, at most six) and cooling nodes. */
export function trends(nodes: MindNode[]) {
  const active = nodes.filter((node) => !node.archivedAt);
  const byStrength = (a: MindNode, b: MindNode) =>
    b.strength - a.strength ||
    b.momentum - a.momentum ||
    a.layer - b.layer ||
    a.angle - b.angle;
  return {
    rising: active
      .filter((node) => node.momentum > 0)
      .sort(byStrength)
      .slice(0, 6),
    cooling: readingOrder(active.filter((node) => node.momentum < 0)),
  };
}

/** Active sources linked to a node, in the map's (title) order. */
export function sourcesOf(map: MindMap, nodeId: string): MindSource[] {
  const linked = new Set(
    map.nodeSources
      .filter((link) => link.nodeId === nodeId)
      .map((link) => link.sourceId),
  );
  return map.sources.filter(
    (source) => linked.has(source.id) && !source.archivedAt,
  );
}

/** Active nodes that cite a source. */
export function nodesCiting(map: MindMap, sourceId: string): MindNode[] {
  const cited = new Set(
    map.nodeSources
      .filter((link) => link.sourceId === sourceId)
      .map((link) => link.nodeId),
  );
  return readingOrder(
    map.nodes.filter((node) => cited.has(node.id) && !node.archivedAt),
  );
}

/** How many active nodes cite at least one active source. */
export function coverage(map: MindMap) {
  const nodes = map.nodes.filter((node) => !node.archivedAt);
  const sources = new Set(
    map.sources.filter((source) => !source.archivedAt).map((s) => s.id),
  );
  const cited = new Set(
    map.nodeSources
      .filter((link) => sources.has(link.sourceId))
      .map((link) => link.nodeId),
  );
  return {
    cited: nodes.filter((node) => cited.has(node.id)).length,
    total: nodes.length,
  };
}

/** Direct links of a node, with the node at the other end. */
export function linksOf(map: MindMap, nodeId: string) {
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  return map.edges.flatMap((edge) => {
    const outgoing = edge.fromNodeId === nodeId;
    if (!outgoing && edge.toNodeId !== nodeId) return [];
    const other = byId.get(outgoing ? edge.toNodeId : edge.fromNodeId);
    return other ? [{ edge, other, outgoing }] : [];
  });
}

/** True when the pair is already linked, whichever way (one row per pair). */
export const hasEdge = (map: MindMap | undefined, a: string, b: string) =>
  !!map?.edges.some(
    (edge) =>
      (edge.fromNodeId === a && edge.toNodeId === b) ||
      (edge.fromNodeId === b && edge.toNodeId === a),
  );

/**
 * An angle for a new node on a ring: the middle of the widest gap between
 * the ring's nodes (0 on an empty ring), with at most two decimals.
 */
export function freeAngle(nodes: MindNode[], layer: number) {
  const angles = nodes
    .filter((node) => node.layer === layer && !node.archivedAt)
    .map((node) => node.angle)
    .sort((a, b) => a - b);
  if (!angles.length) return 0;
  let best = { start: angles[angles.length - 1] as number, size: 0 };
  for (let i = 0; i < angles.length; i++) {
    const start = angles[i] as number;
    const end =
      i + 1 < angles.length
        ? (angles[i + 1] as number)
        : (angles[0] as number) + 360;
    if (end - start > best.size) best = { start, size: end - start };
  }
  const angle = (best.start + best.size / 2) % 360;
  return Math.round(angle * 100) / 100;
}

/** Host name of a source URL for its tag, or null. */
export function sourceHost(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** The civil date `days` after today in `timeZone`, as YYYY-MM-DD. */
export function civilDateAfter(
  days: number,
  timeZone: string,
  now = new Date(),
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Optimistic cache edits. Each returns a new map; archived rows leave the
// active map and stay (marked) in the map that includes archived rows.

/** Replaces or adds a node; an archived node leaves an active-only map. */
export function withNode(
  map: MindMap,
  node: MindNode,
  includeArchived: boolean,
): MindMap {
  const others = map.nodes.filter((item) => item.id !== node.id);
  const keep = includeArchived || !node.archivedAt;
  const exists = others.length !== map.nodes.length;
  const nodes = !keep
    ? others
    : exists
      ? map.nodes.map((item) => (item.id === node.id ? node : item))
      : [...map.nodes, node];
  const ids = new Set(nodes.map((item) => item.id));
  return {
    ...map,
    nodes,
    // Links to a node that left the map are hidden with it (core does too).
    edges: map.edges.filter(
      (edge) => ids.has(edge.fromNodeId) && ids.has(edge.toNodeId),
    ),
    nodeSources: map.nodeSources.filter((link) => ids.has(link.nodeId)),
  };
}

export function withEdge(map: MindMap, edge: MindEdge): MindMap {
  return map.edges.some((item) => item.id === edge.id)
    ? {
        ...map,
        edges: map.edges.map((item) => (item.id === edge.id ? edge : item)),
      }
    : { ...map, edges: [...map.edges, edge] };
}

export const withoutEdge = (map: MindMap, id: string): MindMap => ({
  ...map,
  edges: map.edges.filter((edge) => edge.id !== id),
});

export function withSource(
  map: MindMap,
  source: MindSource,
  includeArchived: boolean,
): MindMap {
  const keep = includeArchived || !source.archivedAt;
  const others = map.sources.filter((item) => item.id !== source.id);
  const exists = others.length !== map.sources.length;
  const sources = !keep
    ? others
    : exists
      ? map.sources.map((item) => (item.id === source.id ? source : item))
      : [...map.sources, source].sort(
          (a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
        );
  const ids = new Set(sources.map((item) => item.id));
  return {
    ...map,
    sources,
    nodeSources: map.nodeSources.filter((link) => ids.has(link.sourceId)),
  };
}

export function withLink(map: MindMap, link: MindNodeSource): MindMap {
  return map.nodeSources.some(
    (item) => item.nodeId === link.nodeId && item.sourceId === link.sourceId,
  )
    ? map
    : { ...map, nodeSources: [...map.nodeSources, link] };
}

export const withoutLink = (
  map: MindMap,
  nodeId: string,
  sourceId: string,
): MindMap => ({
  ...map,
  nodeSources: map.nodeSources.filter(
    (link) => !(link.nodeId === nodeId && link.sourceId === sourceId),
  ),
});
