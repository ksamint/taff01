// Pure layouts for the M16 relations graph: a layered (structured) layout
// and a deterministic, seeded force simulation. Hand-rolled on purpose: no
// graph library and no d3-force (plan §3).
import type {
  GraphEdge,
  GraphLayer,
  GraphNode,
  GraphNodeKind,
  RelationGraph,
} from "@taff/schemas/graph";

export type Point = { x: number; y: number };
export type Positions = Record<string, Point>;
export type View = { k: number; x: number; y: number };

/** Kinds that stay on the canvas whatever layers are on. */
const STRUCTURAL: GraphNodeKind[] = ["workspace", "project", "task"];

/**
 * The nodes and edges for the chosen layers. Structural nodes always show;
 * people, agents and CRM records only through a visible edge.
 */
export function visibleGraph(graph: RelationGraph, layers: GraphLayer[]) {
  const on = new Set(layers);
  const edges = graph.edges.filter((edge) => on.has(edge.layer));
  const linked = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
  const nodes = graph.nodes.filter(
    (node) => STRUCTURAL.includes(node.kind) || linked.has(node.key),
  );
  const keys = new Set(nodes.map((node) => node.key));
  return {
    nodes,
    edges: edges.filter((edge) => keys.has(edge.from) && keys.has(edge.to)),
  };
}

/** Column of each kind in the layered layout, left to right. */
export const COLUMN: Record<GraphNodeKind, number> = {
  contact: 0,
  company: 1,
  workspace: 2,
  project: 3,
  task: 4,
  person: 5,
  agent: 5,
};
export const COLUMN_WIDTH = 170;
/** Left edge of each column; tasks get a wider column for their titles. */
export function columnX(kind: GraphNodeKind) {
  const column = COLUMN[kind];
  return column * COLUMN_WIDTH + (column > COLUMN.task ? 110 : 0);
}
const ROW = 32;

/**
 * Tasks in reading order: by project, each parent followed by its subtasks.
 * The list order is also the keyboard order of the inspector and "as list".
 */
/** Task number from a reference such as NW-141, for reading order. */
function refNumber(node: GraphNode) {
  const match = node.ref?.match(/(\d+)$/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}
/** A stable order independent of the input order: reference, label, key. */
function byReading(a: GraphNode, b: GraphNode) {
  return (
    refNumber(a) - refNumber(b) ||
    (a.label < b.label ? -1 : a.label > b.label ? 1 : 0) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

export function nodeOrder(input: GraphNode[]) {
  const nodes = [...input].sort(byReading);
  const rank = (node: GraphNode) => COLUMN[node.kind];
  const tasks = nodes.filter((node) => node.kind === "task");
  const taskIds = new Set(tasks.map((node) => node.id));
  const children = new Map<string, GraphNode[]>();
  for (const task of tasks)
    if (task.parentId && taskIds.has(task.parentId))
      children.set(task.parentId, [
        ...(children.get(task.parentId) ?? []),
        task,
      ]);
  const orderedTasks: GraphNode[] = [];
  const visit = (task: GraphNode) => {
    orderedTasks.push(task);
    for (const child of children.get(task.id) ?? []) visit(child);
  };
  for (const task of tasks)
    if (!task.parentId || !taskIds.has(task.parentId)) visit(task);
  const projectOf = (task: GraphNode) => task.projectId ?? "";
  const projectRank = new Map<string, number>();
  for (const node of nodes)
    if (node.kind === "project") projectRank.set(node.id, projectRank.size);
  orderedTasks.sort(
    (a, b) =>
      (projectRank.get(projectOf(a)) ?? 1e6) -
      (projectRank.get(projectOf(b)) ?? 1e6),
  );
  const rest = nodes.filter((node) => node.kind !== "task");
  return [...rest, ...orderedTasks].sort((a, b) => rank(a) - rank(b));
}

function adjacency(edges: GraphEdge[]) {
  const adj = new Map<string, string[]>();
  const sorted = [...edges].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
  for (const edge of sorted) {
    adj.set(edge.from, [...(adj.get(edge.from) ?? []), edge.to]);
    adj.set(edge.to, [...(adj.get(edge.to) ?? []), edge.from]);
  }
  return adj;
}

/**
 * Columns by kind; tasks in reading order with subtasks indented; every
 * other column placed at the mean height of its placed neighbours, then
 * spread so labels do not overlap.
 */
export function layeredLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Positions {
  const out: Positions = {};
  const adj = adjacency(edges);
  const ordered = nodeOrder(nodes);
  const tasks = ordered.filter((node) => node.kind === "task");
  const taskIds = new Set(tasks.map((node) => node.id));
  let y = 0;
  let lastProject: string | null | undefined;
  for (const task of tasks) {
    if (lastProject !== undefined && task.projectId !== lastProject) y += 16;
    lastProject = task.projectId;
    const indent = task.parentId && taskIds.has(task.parentId) ? 16 : 0;
    out[task.key] = { x: columnX("task") + indent, y };
    y += ROW;
  }
  const offset = tasks.length ? (y - ROW) / 2 : 0;
  for (const task of tasks) (out[task.key] as Point).y -= offset;
  const meanY = (key: string, fallback: number) => {
    const ys = (adj.get(key) ?? [])
      .map((other) => out[other]?.y)
      .filter((value): value is number => value !== undefined);
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : fallback;
  };
  const place = (kinds: GraphNodeKind[], gap: number) => {
    const list = ordered
      .filter((node) => kinds.includes(node.kind))
      .map((node, index) => ({
        node,
        index,
        y: meanY(node.key, index * gap),
      }))
      .sort((a, b) => a.y - b.y || a.index - b.index);
    if (!list.length) return;
    const want = list.reduce((sum, entry) => sum + entry.y, 0) / list.length;
    for (let i = 1; i < list.length; i++)
      (list[i] as { y: number }).y = Math.max(
        (list[i] as { y: number }).y,
        (list[i - 1] as { y: number }).y + gap,
      );
    const got = list.reduce((sum, entry) => sum + entry.y, 0) / list.length;
    for (const entry of list)
      out[entry.node.key] = {
        x: columnX(entry.node.kind),
        y: entry.y - got + want,
      };
  };
  place(["project"], 56);
  place(["workspace"], 56);
  place(["person", "agent"], ROW);
  place(["company"], 56);
  place(["contact"], ROW);
  return out;
}

/** FNV-1a: a stable 32-bit hash of a string. */
export function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
/** mulberry32: a small seeded generator in [0, 1). */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * A deterministic force layout: seeded start positions, pairwise repulsion,
 * springs along edges and a pull to the centre, for a fixed number of
 * cooling steps. The same graph and seed always give the same positions.
 */
export function forceLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  seed = 1,
  iterations = 260,
): Positions {
  const keys = nodes.map((node) => node.key).sort();
  const index = new Map(keys.map((key, i) => [key, i]));
  const n = keys.length;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const random = seededRandom(hash(keys[i] as string) ^ seed);
    const angle = random() * Math.PI * 2;
    const radius = 40 + random() * 220;
    x[i] = Math.cos(angle) * radius;
    y[i] = Math.sin(angle) * radius;
  }
  const springs = edges
    .map((edge) => [index.get(edge.from), index.get(edge.to)])
    .filter((pair): pair is [number, number] =>
      pair.every((value) => value !== undefined),
    );
  // Big graphs get fewer steps so the main thread stays responsive.
  const steps = n > 400 ? Math.min(iterations, 80) : iterations;
  let alpha = 1;
  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = (x[j] as number) - (x[i] as number);
        let dy = (y[j] as number) - (y[i] as number);
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = 0.5;
          dy = 0.3;
          d2 = 0.34;
        }
        if (d2 > 250_000) continue;
        const d = Math.sqrt(d2);
        const f = (900 * alpha) / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        vx[i] = (vx[i] as number) - fx;
        vy[i] = (vy[i] as number) - fy;
        vx[j] = (vx[j] as number) + fx;
        vy[j] = (vy[j] as number) + fy;
      }
    }
    for (const [a, b] of springs) {
      const dx = (x[b] as number) - (x[a] as number);
      const dy = (y[b] as number) - (y[a] as number);
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = ((d - 90) / d) * 0.12 * alpha;
      vx[a] = (vx[a] as number) + dx * k;
      vy[a] = (vy[a] as number) + dy * k;
      vx[b] = (vx[b] as number) - dx * k;
      vy[b] = (vy[b] as number) - dy * k;
    }
    for (let i = 0; i < n; i++) {
      vx[i] = ((vx[i] as number) - (x[i] as number) * 0.01 * alpha) * 0.6;
      vy[i] = ((vy[i] as number) - (y[i] as number) * 0.01 * alpha) * 0.6;
      x[i] = (x[i] as number) + Math.max(-30, Math.min(30, vx[i] as number));
      y[i] = (y[i] as number) + Math.max(-30, Math.min(30, vy[i] as number));
    }
    alpha *= 0.985;
  }
  const out: Positions = {};
  for (let i = 0; i < n; i++)
    out[keys[i] as string] = {
      x: Math.round((x[i] as number) * 10) / 10,
      y: Math.round((y[i] as number) * 10) / 10,
    };
  return out;
}

/** The view that fits every position into a viewport with padding. */
export function fitView(
  positions: Point[],
  width: number,
  height: number,
  padding = 48,
): View {
  if (!positions.length || width <= 0 || height <= 0)
    return { k: 1, x: width / 2, y: height / 2 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of positions) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  // Labels sit to the right of their node.
  x1 += 120;
  const k = clampZoom(
    Math.min(
      (width - padding * 2) / Math.max(1, x1 - x0),
      (height - padding * 2) / Math.max(1, y1 - y0),
    ),
  );
  return {
    k,
    x: width / 2 - ((x0 + x1) / 2) * k,
    y: height / 2 - ((y0 + y1) / 2) * k,
  };
}
export function clampZoom(k: number) {
  return Math.max(0.25, Math.min(3, k));
}
/** Zooms by `factor` keeping the screen point (px, py) fixed. */
export function zoomAt(view: View, factor: number, px: number, py: number) {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}
