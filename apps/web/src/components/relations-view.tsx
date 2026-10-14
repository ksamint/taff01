"use client";
import "../styles/relations.css";
// Relations graph (M16, prototype Module Relations: styles 91–101, force
// 163–182, layered 245–261, pan/zoom 148–199, inspector 58–78 and 311–332).
// Hand-rolled SVG over `GET /api/workspaces/:id/graph`; layouts are pure
// functions in `lib/graph-layout.ts`. Keyboard users reach every node from
// the inspector's lists, and "as list" shows the same data without a canvas.
import type { Project } from "@taff/schemas";
import {
  GRAPH_LAYERS,
  type GraphEdge,
  type GraphLayer,
  type GraphNode,
} from "@taff/schemas/graph";
import {
  ExternalLink,
  GanttChart,
  Maximize,
  Minus,
  Plus,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import {
  fitView,
  forceLayout,
  layeredLayout,
  nodeOrder,
  type Positions,
  type View,
  visibleGraph,
  zoomAt,
} from "../lib/graph-layout";
import { useRelationGraph } from "../lib/graph-queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";

type Translate = ReturnType<typeof useTranslation>["t"];
type Layout = "layered" | "force";
type Relation = { edge: GraphEdge; other: GraphNode; outgoing: boolean };

const FORCE_SEED = 7;

/** Every visible edge touching `key`, with the node at its other end. */
export function relationsOf(
  key: string,
  edges: GraphEdge[],
  byKey: Map<string, GraphNode>,
): Relation[] {
  const out: Relation[] = [];
  for (const edge of edges) {
    const outgoing = edge.from === key;
    if (!outgoing && edge.to !== key) continue;
    const other = byKey.get(outgoing ? edge.to : edge.from);
    if (other) out.push({ edge, other, outgoing });
  }
  return out;
}

export function RelationsView({ project }: { project: Project | undefined }) {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const ids = useId();
  const [scope, setScope] = useState<"project" | "workspace">("project");
  const [layout, setLayout] = useState<Layout>("layered");
  const [layers, setLayers] = useState<GraphLayer[]>([...GRAPH_LAYERS]);
  const [asList, setAsList] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    searchParams.get("node"),
  );
  const projectId = scope === "project" && project ? project.id : null;
  const query = useRelationGraph(workspace.id, projectId);
  const graph = query.data;
  const visible = useMemo(
    () => (graph ? visibleGraph(graph, layers) : { nodes: [], edges: [] }),
    [graph, layers],
  );
  const ordered = useMemo(() => nodeOrder(visible.nodes), [visible.nodes]);
  const byKey = useMemo(
    () => new Map(visible.nodes.map((node) => [node.key, node])),
    [visible.nodes],
  );
  const positions = useMemo<Positions>(
    () =>
      layout === "layered"
        ? layeredLayout(visible.nodes, visible.edges)
        : forceLayout(visible.nodes, visible.edges, FORCE_SEED),
    [layout, visible],
  );
  const selected = selectedKey ? byKey.get(selectedKey) : undefined;
  const heading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<View | null>(null);
  const inspectorFocus = useRef(false);
  const canvasSize = useRef({ width: 600, height: 480 });

  useEffect(() => {
    if (!inspectorFocus.current) return;
    inspectorFocus.current = false;
    heading.current?.focus();
  });

  const choose = (key: string | null, fromKeyboard = false) => {
    setSelectedKey(key);
    if (fromKeyboard) inspectorFocus.current = true;
  };
  const toggleLayer = (layer: GraphLayer) =>
    setLayers((current) =>
      current.includes(layer)
        ? current.filter((value) => value !== layer)
        : GRAPH_LAYERS.filter(
            (value) => value === layer || current.includes(value),
          ),
    );
  const allOn = layers.length === GRAPH_LAYERS.length;
  const shownLayers = GRAPH_LAYERS.filter(
    (layer) => layer !== "crm" || graph?.crmVisible,
  );

  return (
    <section
      className="relations-view"
      data-testid="relations-view"
      aria-label={t("projects.relationsView")}
    >
      <div className="relations-toolbar">
        <div
          className="relations-segment"
          role="group"
          aria-label={t("relations.layoutLabel")}
        >
          {(["layered", "force"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={layout === value}
              data-testid={`relations-layout-${value}`}
              onClick={() => setLayout(value)}
            >
              {t(`relations.layout.${value}`)}
            </button>
          ))}
        </div>
        <div
          className="relations-chips"
          role="group"
          aria-label={t("relations.layersTitle")}
        >
          <button
            type="button"
            className="relations-chip"
            aria-pressed={allOn}
            data-testid="relations-layer-all"
            onClick={() => setLayers(allOn ? [] : [...GRAPH_LAYERS])}
          >
            {t("relations.filterAll")}
          </button>
          {shownLayers.map((layer) => (
            <button
              key={layer}
              type="button"
              className="relations-chip"
              aria-pressed={layers.includes(layer)}
              data-testid={`relations-layer-${layer}`}
              onClick={() => toggleLayer(layer)}
            >
              {t(`relations.layer.${layer}`)}
            </button>
          ))}
        </div>
        <div className="field relations-scope">
          <label htmlFor={`${ids}-scope`}>{t("relations.scope")}</label>
          <select
            id={`${ids}-scope`}
            value={projectId ? "project" : "workspace"}
            data-testid="relations-scope"
            onChange={(event) =>
              setScope(
                event.target.value === "project" ? "project" : "workspace",
              )
            }
          >
            {project && (
              <option value="project">
                {t("relations.scopeProject", { project: project.name })}
              </option>
            )}
            <option value="workspace">{t("relations.scopeWorkspace")}</option>
          </select>
        </div>
        <button
          type="button"
          className="relations-chip relations-as-list"
          aria-pressed={asList}
          data-testid="relations-as-list"
          onClick={() => setAsList(!asList)}
        >
          {t("relations.asList")}
        </button>
      </div>
      {query.isPending ? (
        <p className="loading">{t("loading")}</p>
      ) : query.isError || !graph ? (
        <p className="alert" role="alert">
          {t(errorKey(query.error))}
        </p>
      ) : visible.nodes.length === 0 ? (
        <p className="relations-empty" data-testid="relations-empty">
          {t("relations.empty")}
        </p>
      ) : asList ? (
        <RelationsList
          ordered={ordered}
          edges={visible.edges}
          byKey={byKey}
          t={t}
        />
      ) : (
        <div className="relations-body">
          <GraphCanvas
            nodes={visible.nodes}
            edges={visible.edges}
            positions={positions}
            layout={layout}
            selectedKey={selected?.key ?? null}
            view={view}
            setView={setView}
            sizeRef={canvasSize}
            onSelect={(key) => choose(key)}
            t={t}
          />
          <aside
            className="relations-inspector"
            data-testid="relations-inspector"
            aria-label={t("relations.inspector")}
          >
            {selected ? (
              <Inspector
                node={selected}
                relations={relationsOf(selected.key, visible.edges, byKey)}
                heading={heading}
                onSelect={(key) => {
                  choose(key, true);
                  const p = positions[key];
                  const { width, height } = canvasSize.current;
                  if (p && view)
                    setView({
                      ...view,
                      x: width / 2 - p.x * view.k,
                      y: height / 2 - p.y * view.k,
                    });
                }}
                onClose={() => choose(null)}
                t={t}
              />
            ) : (
              <>
                <h2 className="relations-inspector-title">
                  {t("relations.nodes")}
                </h2>
                <p className="relations-hint">{t("relations.selectHint")}</p>
                {visible.edges.length === 0 && (
                  <p className="relations-hint">{t("relations.noLayers")}</p>
                )}
                <ul className="relations-list-buttons">
                  {ordered.map((node) => (
                    <li key={node.key}>
                      <button
                        type="button"
                        className="relations-relation"
                        data-testid="relations-node-button"
                        data-key={node.key}
                        onClick={() => choose(node.key, true)}
                      >
                        <span className="relations-kind">
                          {t(`relations.nodeType.${node.kind}`)}
                        </span>
                        <span>
                          {node.ref ? `${node.ref} ${node.label}` : node.label}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

function GraphCanvas({
  nodes,
  edges,
  positions,
  layout,
  selectedKey,
  view,
  setView,
  sizeRef,
  onSelect,
  t,
}: {
  sizeRef: { current: { width: number; height: number } };
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Positions;
  layout: Layout;
  selectedKey: string | null;
  view: View | null;
  setView: (view: View) => void;
  onSelect: (key: string) => void;
  t: Translate;
}) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    view: View;
    distance: number;
    mid: { x: number; y: number };
  } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const size = () => {
    sizeRef.current = {
      width: box.current?.clientWidth ?? 600,
      height: box.current?.clientHeight ?? 480,
    };
    return sizeRef.current;
  };
  const fit = () => {
    const { width, height } = size();
    setView(fitView(Object.values(positions), width, height));
  };
  // Fit whenever the layout or the visible graph changes.
  useLayoutEffect(fit, [positions]);
  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      const current = viewRef.current;
      if (!current) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      setView(
        zoomAt(
          current,
          Math.exp(-event.deltaY * 0.0015),
          event.clientX - rect.left,
          event.clientY - rect.top,
        ),
      );
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [setView]);

  const local = (event: PointerEvent) => {
    const rect = svg.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };
  const startGesture = () => {
    const points = [...pointers.current.values()];
    if (!viewRef.current || points.length === 0) return;
    const [a, b] = points as [
      { x: number; y: number },
      { x: number; y: number } | undefined,
    ];
    gesture.current = {
      view: viewRef.current,
      distance: b ? Math.hypot(b.x - a.x, b.y - a.y) : 0,
      mid: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a,
    };
  };
  const onDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, local(event));
    startGesture();
  };
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId) || !gesture.current) return;
    pointers.current.set(event.pointerId, local(event));
    const points = [...pointers.current.values()];
    const start = gesture.current;
    const [a, b] = points as [
      { x: number; y: number },
      { x: number; y: number } | undefined,
    ];
    if (b && start.distance > 0) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(
        start.view,
        Math.hypot(b.x - a.x, b.y - a.y) / start.distance,
        start.mid.x,
        start.mid.y,
      );
      setView({
        ...zoomed,
        x: zoomed.x + mid.x - start.mid.x,
        y: zoomed.y + mid.y - start.mid.y,
      });
    } else {
      setView({
        ...start.view,
        x: start.view.x + a.x - start.mid.x,
        y: start.view.y + a.y - start.mid.y,
      });
    }
  };
  const onUp = (event: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    gesture.current = null;
    if (pointers.current.size) startGesture();
  };
  const zoomBy = (factor: number) => {
    if (!view) return;
    const { width, height } = size();
    setView(zoomAt(view, factor, width / 2, height / 2));
  };
  const linked = new Set<string>();
  if (selectedKey)
    for (const edge of edges)
      if (edge.from === selectedKey || edge.to === selectedKey) {
        linked.add(edge.from);
        linked.add(edge.to);
      }
  const k = view?.k ?? 1;
  const fontSize = 12 / k;
  const showLabels = k >= 0.55;

  return (
    <div className="relations-canvas" ref={box}>
      <svg
        ref={svg}
        className={`relations-svg${selectedKey ? " has-selection" : ""}`}
        role="img"
        aria-label={t("relations.canvasLabel", { count: nodes.length })}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {view && (
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {edges.map((edge) => {
              const a = positions[edge.from];
              const b = positions[edge.to];
              if (!a || !b) return null;
              const mx = (a.x + b.x) / 2;
              const d =
                layout === "layered"
                  ? `M${a.x},${a.y}C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`
                  : `M${a.x},${a.y}L${b.x},${b.y}`;
              const on =
                selectedKey !== null &&
                (edge.from === selectedKey || edge.to === selectedKey);
              return (
                <path
                  key={edge.key}
                  d={d}
                  className={`relations-edge is-${edge.kind}${on ? " is-on" : ""}`}
                  strokeWidth={1 / k}
                />
              );
            })}
            {nodes.map((node) => {
              const p = positions[node.key];
              if (!p) return null;
              const dim =
                selectedKey !== null &&
                !linked.has(node.key) &&
                node.key !== selectedKey;
              return (
                <g
                  key={node.key}
                  transform={`translate(${p.x},${p.y})`}
                  className={`relations-node is-${node.kind}${node.status ? ` status-${node.status}` : ""}${node.key === selectedKey ? " is-selected" : ""}${dim ? " is-dim" : ""}`}
                  data-testid="relations-node"
                  data-key={node.key}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onSelect(node.key)}
                >
                  <circle
                    r={14 / Math.max(k, 0.5)}
                    className="relations-hit"
                    data-testid="relations-node-hit"
                  />
                  <NodeShape node={node} />
                  {(showLabels || node.key === selectedKey) && (
                    <text
                      x={12}
                      y={fontSize / 3}
                      fontSize={fontSize}
                      className="relations-label"
                    >
                      {node.label.length > 28
                        ? `${node.label.slice(0, 27)}…`
                        : node.label}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
      </svg>
      <div className="relations-zoom">
        <Button
          type="button"
          aria-label={t("relations.zoomIn")}
          data-testid="relations-zoom-in"
          onClick={() => zoomBy(1.25)}
        >
          <Plus size={18} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          aria-label={t("relations.zoomOut")}
          data-testid="relations-zoom-out"
          onClick={() => zoomBy(0.8)}
        >
          <Minus size={18} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          aria-label={t("relations.fit")}
          data-testid="relations-fit"
          onClick={fit}
        >
          <Maximize size={18} aria-hidden="true" />
        </Button>
      </div>
      <ul className="relations-legend" aria-label={t("relations.legend")}>
        {(
          [
            "workspace",
            "project",
            "task",
            "person",
            "agent",
            "company",
            "contact",
          ] as const
        ).map((kind) => (
          <li key={kind}>
            <svg
              width="16"
              height="16"
              viewBox="-8 -8 16 16"
              aria-hidden="true"
            >
              <g className={`relations-node is-${kind}`}>
                <NodeShape node={{ kind } as GraphNode} />
              </g>
            </svg>
            {t(`relations.nodeType.${kind}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NodeShape({ node }: { node: Pick<GraphNode, "kind"> }) {
  switch (node.kind) {
    case "workspace":
      return (
        <>
          <circle r={7} className="relations-shape" />
          <circle r={4.5} className="relations-shape-inner" />
        </>
      );
    case "company":
      return <path d="M0,-6L6,0L0,6L-6,0Z" className="relations-shape" />;
    case "contact":
      return (
        <rect
          x={-4.5}
          y={-4.5}
          width={9}
          height={9}
          className="relations-shape"
        />
      );
    case "agent":
      return (
        <>
          <circle r={6} className="relations-shape" />
          <path d="M-3,0H3M0,-3V3" className="relations-shape-mark" />
        </>
      );
    default:
      return (
        <circle
          r={node.kind === "project" ? 7 : node.kind === "task" ? 5 : 6}
          className="relations-shape"
        />
      );
  }
}

function edgeLabel(t: Translate, relation: Relation) {
  return t(
    `relations.edge.${relation.edge.kind}.${relation.outgoing ? "out" : "in"}`,
  );
}

function NodeActions({
  node,
  t,
  testPrefix,
}: {
  node: GraphNode;
  t: Translate;
  testPrefix: string;
}) {
  const timelineProject =
    node.kind === "project"
      ? node.id
      : node.kind === "task"
        ? node.projectId
        : null;
  if (node.kind !== "task" && !timelineProject) return null;
  return (
    <div className="relations-actions">
      {node.kind === "task" && (
        <Link
          href={`/tasks/${node.id}`}
          className="button button-primary"
          data-testid={`${testPrefix}-open-task`}
        >
          <ExternalLink size={16} aria-hidden="true" />
          {t("relations.openTask")}
        </Link>
      )}
      {timelineProject && (
        <Link
          href={`/projects/${timelineProject}?view=timeline${node.kind === "task" ? `&task=${node.id}` : ""}`}
          className="button"
          data-testid={`${testPrefix}-open-timeline`}
        >
          <GanttChart size={16} aria-hidden="true" />
          {t("relations.openInTimeline")}
        </Link>
      )}
    </div>
  );
}

function Inspector({
  node,
  relations,
  heading,
  onSelect,
  onClose,
  t,
}: {
  node: GraphNode;
  relations: Relation[];
  heading: React.RefObject<HTMLHeadingElement | null>;
  onSelect: (key: string) => void;
  onClose: () => void;
  t: Translate;
}) {
  return (
    <>
      <div className="relations-inspector-head">
        <span className="relations-kind">
          {t(`relations.nodeType.${node.kind}`)}
        </span>
        <Button
          type="button"
          className="button-quiet"
          aria-label={t("relations.close")}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </Button>
      </div>
      <h2
        className="relations-inspector-title"
        ref={heading}
        tabIndex={-1}
        data-testid="relations-inspector-title"
      >
        {node.ref && <span className="relations-ref">{node.ref}</span>}
        {node.label}
      </h2>
      <dl className="relations-facts">
        {node.status && (
          <div>
            <dt>{t("planning.status")}</dt>
            <dd>{t(`status.${node.status}`)}</dd>
          </div>
        )}
        {node.role && (
          <div>
            <dt>{t("relations.role")}</dt>
            <dd>{t(`relations.memberRole.${node.role}`)}</dd>
          </div>
        )}
        {node.detail && (
          <div>
            <dt>{t("relations.detail")}</dt>
            <dd>{node.detail}</dd>
          </div>
        )}
      </dl>
      <NodeActions node={node} t={t} testPrefix="relations" />
      <h3 className="relations-subtitle">{t("relations.layersTitle")}</h3>
      {relations.length === 0 ? (
        <p className="relations-hint">{t("relations.noRelations")}</p>
      ) : (
        <ul className="relations-list-buttons">
          {relations.map((relation) => (
            <li key={`${relation.edge.key}:${relation.outgoing}`}>
              <button
                type="button"
                className="relations-relation"
                data-testid="relations-relation"
                data-key={relation.other.key}
                onClick={() => onSelect(relation.other.key)}
              >
                <span className="relations-kind">{edgeLabel(t, relation)}</span>
                <span>
                  {relation.other.ref ? `${relation.other.ref} ` : ""}
                  {relation.other.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The same nodes and relations without the canvas, in reading order. */
function RelationsList({
  ordered,
  edges,
  byKey,
  t,
}: {
  ordered: GraphNode[];
  edges: GraphEdge[];
  byKey: Map<string, GraphNode>;
  t: Translate;
}) {
  return (
    <ol className="relations-as-list-items" data-testid="relations-list">
      {ordered.map((node) => {
        const relations = relationsOf(node.key, edges, byKey);
        return (
          <li
            key={node.key}
            data-testid="relations-list-node"
            data-key={node.key}
          >
            <div className="relations-list-head">
              <span className="relations-kind">
                {t(`relations.nodeType.${node.kind}`)}
              </span>
              <h3>
                {node.ref && <span className="relations-ref">{node.ref}</span>}
                {node.label}
              </h3>
              {node.status && (
                <span className="relations-status">
                  {t(`status.${node.status}`)}
                </span>
              )}
            </div>
            {relations.length > 0 && (
              <ul className="relations-list-relations">
                {relations.map((relation) => (
                  <li key={`${relation.edge.key}:${relation.outgoing}`}>
                    {edgeLabel(t, relation)}:{" "}
                    {relation.other.ref ? `${relation.other.ref} ` : ""}
                    {relation.other.label}
                  </li>
                ))}
              </ul>
            )}
            <NodeActions node={node} t={t} testPrefix="relations-list" />
          </li>
        );
      })}
    </ol>
  );
}
