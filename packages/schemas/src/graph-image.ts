// Display-only graph contract. Core must supply authorized data and localized labels.
import {
  array,
  boolean,
  type infer as Infer,
  int,
  literal,
  maximum,
  maxLength,
  minimum,
  nullable,
  number,
  refine,
  regex,
  strictObject,
  string,
  enum as zodEnum,
} from "zod/mini";
import {
  graphLayerSchema,
  type RelationGraph,
  relationGraphSchema,
} from "./graph";
import {
  forceLayout,
  layeredLayout,
  nodeOrder,
  type Point,
  relationEdgeGeometry,
  visibleGraph,
} from "./graph-layout";
import type { MindMap } from "./mind";
import {
  canvasExtent,
  edgeGeometry,
  labelPlacement,
  nodePoint,
  nodeRadius,
  readingOrder,
  ringCount,
  ringRadius,
} from "./mind-geometry";
import { idSchema, localeSchema } from "./primitives";

export const GRAPH_IMAGE_MAX_NODES = 150;
export const GRAPH_IMAGE_MAX_EDGES = 600;
const text = (max: number) => string().check(maxLength(max));
const bounded = (min: number, max: number) =>
  number().check(minimum(min), maximum(max));
const integer = (min: number, max: number) =>
  int().check(minimum(min), maximum(max));
const point = strictObject({
  x: bounded(-100000, 100000),
  y: bounded(-100000, 100000),
});
const hash = string().check(regex(/^[a-f0-9]{64}$/));
const tone = zodEnum(["neutral", "blue", "gold", "green", "red", "purple"]);
export const graphLayoutSchema = strictObject({
  kind: zodEnum(["mind", "relations"]),
  locale: localeSchema,
  width: literal(1080),
  height: integer(320, 4000),
  title: text(200),
  subtitle: text(300),
  empty: nullable(text(100)),
  more: nullable(text(100)),
  moreEdges: nullable(text(100)),
  view: strictObject({
    scale: bounded(0.000001, 3),
    x: bounded(-100000, 100000),
    y: bounded(-100000, 100000),
  }),
  nodes: array(
    strictObject({
      key: text(128),
      x: point.shape.x,
      y: point.shape.y,
      radius: bounded(1, 20),
      tone,
      shape: zodEnum(["circle", "square", "diamond"]),
      label: strictObject({
        text: text(120),
        x: point.shape.x,
        y: point.shape.y,
        width: bounded(0, 2048),
        fontSize: bounded(10, 20),
        anchor: zodEnum(["start", "middle", "end"]),
      }),
    }),
  ).check(maxLength(GRAPH_IMAGE_MAX_NODES)),
  edges: array(
    strictObject({
      from: integer(0, 149),
      to: integer(0, 149),
      c1: nullable(point),
      c2: nullable(point),
      tone,
      dashed: boolean(),
    }),
  ).check(maxLength(GRAPH_IMAGE_MAX_EDGES)),
  rings: array(
    strictObject({ radius: bounded(1, 1000), label: text(80) }),
  ).check(maxLength(10)),
  centre: nullable(text(80)),
  footer: strictObject({ text: text(300), hashFull: hash }),
});
export const graphImageInputSchema = strictObject({
  layout: graphLayoutSchema,
  watermark: strictObject({ text: text(500), contentHash: hash }),
  contentHash: hash,
});
export type GraphLayout = Infer<typeof graphLayoutSchema>;
export type GraphImageInput = Infer<typeof graphImageInputSchema>;
export type GraphImageLabels = {
  title: string;
  subtitle: string;
  footer: string;
  empty: string;
  more: (count: number) => string;
  moreEdges: (count: number) => string;
};
export type MindImageLabels = GraphImageLabels & {
  centre: string;
  ring: (layer: number) => string;
};
export const relationsImageOptionsSchema = strictObject({
  layout: zodEnum(["layered", "force"]),
  scope: zodEnum(["workspace", "project"]),
  projectId: nullable(idSchema),
  layers: array(graphLayerSchema).check(
    maxLength(4),
    refine((value) => new Set(value).size === value.length),
  ),
  forceSeed: integer(0, 4294967295),
}).check(
  refine((value) => (value.scope === "project") === (value.projectId !== null)),
);
export type RelationsImageOptions = Infer<typeof relationsImageOptionsSchema>;
export type MindImageOptions = { archived: "include" | "exclude" };
type ImageNode = GraphLayout["nodes"][number];
type ImageEdge = GraphLayout["edges"][number];

function uniqueEdges<T>(
  edges: T[],
  identity: (edge: T) => string,
  stableKey: (edge: T) => string,
): T[] {
  const distinct = new Map<string, T>();
  for (const edge of edges) {
    const key = identity(edge);
    const existing = distinct.get(key);
    if (existing === undefined || stableKey(edge) < stableKey(existing))
      distinct.set(key, edge);
  }
  return [...distinct.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, edge]) => edge);
}
function checkedText(value: string) {
  if (typeof value !== "string" || value.length > 4000)
    throw new Error("invalid_graph_text");
  return value;
}
function clipped(value: string, max: number) {
  const chars = Array.from(checkedText(value));
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : value;
}
function label(
  value: string,
  at: Point,
  anchor: ImageNode["label"]["anchor"],
  fontSize: number,
  max = 40,
): ImageNode["label"] {
  const display = clipped(value, max);
  // Conservative glyph width includes CJK and combining sequences; Rust validates it too.
  return {
    ...at,
    text: display,
    anchor,
    fontSize,
    width: Array.from(display).length * fontSize * 1.25,
  };
}
type Bounds = { left: number; top: number; right: number; bottom: number };
export function graphLabelBounds(value: ImageNode["label"]): Bounds {
  const left =
    value.x -
    (value.anchor === "end"
      ? value.width
      : value.anchor === "middle"
        ? value.width / 2
        : 0);
  return {
    left,
    right: left + value.width,
    top: value.y - value.fontSize * 1.1,
    bottom: value.y + value.fontSize * 0.3,
  };
}
/** Export fit uses complete label bounds and has no interactive minimum-zoom clamp. */
export function fitGraphExport(nodes: ImageNode[], extent: number | null) {
  const boxes: Bounds[] = nodes.flatMap((node) => [
    graphLabelBounds(node.label),
    {
      left: node.x - node.radius,
      top: node.y - node.radius,
      right: node.x + node.radius,
      bottom: node.y + node.radius,
    },
  ]);
  if (extent !== null)
    boxes.push({ left: -extent, top: -extent, right: extent, bottom: extent });
  if (!boxes.length)
    boxes.push({ left: -100, top: -100, right: 100, bottom: 100 });
  const left = Math.min(...boxes.map((box) => box.left)) - 16;
  const top = Math.min(...boxes.map((box) => box.top)) - 16;
  const width = Math.max(...boxes.map((box) => box.right)) + 16 - left;
  const height = Math.max(...boxes.map((box) => box.bottom)) + 16 - top;
  if (![left, top, width, height].every(Number.isFinite))
    throw new Error("invalid_graph_geometry");
  const body = Math.min(
    3720,
    Math.max(280, Math.ceil(height * Math.min(1.5, 984 / width))),
  );
  const scale = Math.min(1.5, 984 / width, body / height);
  return {
    height: body + 240,
    view: {
      scale,
      x: 48 + (984 - width * scale) / 2 - left * scale,
      y: 144 + (body - height * scale) / 2 - top * scale,
    },
  };
}
function finish(
  kind: GraphLayout["kind"],
  locale: GraphLayout["locale"],
  labels: GraphImageLabels,
  contentHash: string,
  nodes: ImageNode[],
  edges: ImageEdge[],
  omitted: number,
  omittedEdges: number,
  rings: GraphLayout["rings"] = [],
  centre: string | null = null,
  extent: number | null = null,
): GraphLayout {
  return graphLayoutSchema.parse({
    kind,
    locale,
    width: 1080,
    ...fitGraphExport(nodes, extent),
    title: labels.title,
    subtitle: labels.subtitle,
    empty: nodes.length ? null : labels.empty,
    more: omitted ? labels.more(omitted) : null,
    moreEdges: omittedEdges ? labels.moreEdges(omittedEdges) : null,
    nodes,
    edges,
    rings,
    centre,
    footer: { text: labels.footer, hashFull: contentHash },
  });
}

/** Already authorized/scoped source. Truncated relations are laid out on the retained subgraph. */
export function buildRelationsLayout(
  source: RelationGraph,
  options: RelationsImageOptions,
  locale: GraphLayout["locale"],
  labels: GraphImageLabels,
  contentHash: string,
): GraphLayout {
  for (const node of source.nodes) {
    checkedText(node.label);
    if (node.ref) checkedText(node.ref);
  }
  const graph = relationGraphSchema.parse(source);
  const selected = relationsImageOptionsSchema.parse(options);
  if (
    graph.projectId !== selected.projectId ||
    !selected.layers.every((layer) => graph.layers.includes(layer))
  )
    throw new Error("graph_scope_mismatch");
  const keys = new Set(graph.nodes.map((node) => node.key));
  if (
    keys.size !== graph.nodes.length ||
    graph.nodes.some((node) => node.key !== `${node.kind}:${node.id}`)
  )
    throw new Error("invalid_graph_keys");
  const visible = visibleGraph(graph, selected.layers);
  const ordered = nodeOrder(visible.nodes);
  if (ordered.length !== visible.nodes.length)
    throw new Error("invalid_graph_hierarchy");
  const retained = ordered.slice(0, GRAPH_IMAGE_MAX_NODES);
  const indices = new Map(retained.map((node, index) => [node.key, index]));
  const distinctEdges = uniqueEdges(
    visible.edges,
    (edge) => JSON.stringify([edge.from, edge.to, edge.kind, edge.layer]),
    (edge) => edge.key,
  );
  const retainedEdges = distinctEdges
    .filter((edge) => indices.has(edge.from) && indices.has(edge.to))
    // Core relationGraph and the web use key order for force springs.
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const positions =
    selected.layout === "layered"
      ? layeredLayout(retained, retainedEdges)
      : forceLayout(retained, retainedEdges, selected.forceSeed);
  const nodes: ImageNode[] = retained.map((node) => {
    const p = positions[node.key];
    if (!p) throw new Error("invalid_graph_geometry");
    return {
      key: node.key,
      ...p,
      radius: node.kind === "workspace" ? 9 : 6,
      shape:
        node.kind === "project"
          ? "diamond"
          : node.kind === "task"
            ? "square"
            : "circle",
      tone:
        node.kind === "task"
          ? "blue"
          : node.kind === "agent"
            ? "purple"
            : node.kind === "person"
              ? "green"
              : node.kind === "company" || node.kind === "contact"
                ? "gold"
                : "neutral",
      label: label(
        node.label,
        { x: p.x + 12, y: p.y + 14 / 3 },
        "start",
        14,
        28,
      ),
    };
  });
  // The edge budget limits raster work, not the shared web layout's adjacency.
  const edges: ImageEdge[] = retainedEdges
    .slice(0, GRAPH_IMAGE_MAX_EDGES)
    .flatMap((edge) => {
      const from = indices.get(edge.from),
        to = indices.get(edge.to);
      if (from === undefined || to === undefined) return [];
      const a = nodes[from],
        b = nodes[to];
      return [
        {
          from,
          to,
          ...relationEdgeGeometry(a, b, selected.layout),
          tone:
            edge.layer === "dependencies"
              ? "red"
              : edge.layer === "crm"
                ? "gold"
                : "neutral",
          dashed: edge.kind === "depends_on",
        },
      ];
    });
  return finish(
    "relations",
    locale,
    labels,
    contentHash,
    nodes,
    edges,
    visible.nodes.length - retained.length,
    distinctEdges.length - edges.length,
  );
}

/** Notes, source URLs, linked task content and CRM fields never enter the display contract. */
export function buildMindLayout(
  map: MindMap,
  options: MindImageOptions,
  locale: GraphLayout["locale"],
  labels: MindImageLabels,
  contentHash: string,
): GraphLayout {
  if (!["include", "exclude"].includes(options.archived))
    throw new Error("invalid_graph_options");
  for (const node of map.nodes) {
    idSchema.parse(node.id);
    checkedText(node.title);
    if (
      !Number.isInteger(node.layer) ||
      node.layer < 0 ||
      node.layer > 9 ||
      !Number.isFinite(node.angle) ||
      node.angle < 0 ||
      node.angle >= 360 ||
      !Number.isInteger(node.strength) ||
      node.strength < 1 ||
      node.strength > 5
    )
      throw new Error("invalid_graph_geometry");
  }
  if (new Set(map.nodes.map((node) => node.id)).size !== map.nodes.length)
    throw new Error("invalid_graph_keys");
  const visible = map.nodes.filter(
    (node) => options.archived === "include" || !node.archivedAt,
  );
  const retained = readingOrder(visible).slice(0, GRAPH_IMAGE_MAX_NODES);
  const indices = new Map(retained.map((node, index) => [node.id, index]));
  const nodes: ImageNode[] = retained.map((node) => ({
    key: node.id,
    ...nodePoint(node),
    radius: nodeRadius(node.strength),
    shape: "circle",
    tone: ["gold", "blue", "green", "purple"][
      Math.min(node.layer, 3)
    ] as ImageNode["tone"],
    label: label(
      node.title,
      labelPlacement(node),
      labelPlacement(node).anchor,
      node.layer === 0 ? 16 : 14,
    ),
  }));
  const visibleIds = new Set(visible.map((node) => node.id));
  const distinctEdges = uniqueEdges(
    map.edges.filter(
      (edge) =>
        visibleIds.has(edge.fromNodeId) && visibleIds.has(edge.toNodeId),
    ),
    (edge) => JSON.stringify([edge.fromNodeId, edge.toNodeId, edge.kind]),
    (edge) => edge.id,
  );
  const edges: ImageEdge[] = distinctEdges
    .filter(
      (edge) => indices.has(edge.fromNodeId) && indices.has(edge.toNodeId),
    )
    .slice(0, GRAPH_IMAGE_MAX_EDGES)
    .flatMap((edge) => {
      const from = indices.get(edge.fromNodeId),
        to = indices.get(edge.toNodeId);
      if (from === undefined || to === undefined) return [];
      const { c1, c2 } = edgeGeometry(retained[from], retained[to]);
      return [
        {
          from,
          to,
          c1,
          c2,
          tone:
            edge.kind === "contradicts"
              ? "red"
              : edge.kind === "supports"
                ? "green"
                : "neutral",
          dashed: edge.kind === "contradicts",
        },
      ];
    });
  const count = ringCount(visible);
  const rings = Array.from({ length: count }, (_, layer) => ({
    radius: ringRadius(layer),
    label: clipped(labels.ring(layer), 24),
  }));
  return finish(
    "mind",
    locale,
    labels,
    contentHash,
    nodes,
    edges,
    visible.length - retained.length,
    distinctEdges.length - edges.length,
    rings,
    clipped(labels.centre, 10),
    canvasExtent(count),
  );
}
