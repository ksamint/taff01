// Mind geometry shared by the interactive canvas and server image exports.
import type { MindNode } from "./mind";

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
  nodes.reduce((max, node) => Math.max(max, node.layer + 1), MIN_RINGS);
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
export function edgeGeometry(
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
  return { from: p1, c1, c2, to: p2 };
}
export function edgePath(
  from: Pick<MindNode, "layer" | "angle">,
  to: Pick<MindNode, "layer" | "angle">,
) {
  const { from: p1, c1, c2, to: p2 } = edgeGeometry(from, to);
  return `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`;
}

/** Half the side of the square that holds every ring and its labels. */
export const canvasExtent = (rings: number) =>
  ringRadius(rings - 1) + LABEL_MARGIN;

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
