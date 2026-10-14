"use client";
import "../styles/mind.css";
// Mind map (M18, D8: one map per workspace). Prototype v2 Module Plan:
// markup 198–237, strings 316–323, logic 552–599 (`buildMind`). A
// hand-rolled radial SVG over `GET /api/workspaces/:id/mind`; geometry and
// lists are pure functions in `lib/mind-model.ts`, writes are hooks in
// `lib/mutations/mind.ts`. The prototype's static "AI insight" is not
// ported: notes are a person's notes and are labelled so (plan §2.4 item
// 12). "As list" shows every node without the canvas; every node is
// reachable and editable from the keyboard through the list and the panel.
import type { Project } from "@taff/schemas";
import { taskReference } from "@taff/schemas/base";
import type {
  MindEdge,
  MindMap,
  MindNode,
  MindSource,
} from "@taff/schemas/mind";
import {
  ArrowLeft,
  ArrowUpRight,
  CircleCheck,
  ExternalLink,
  Maximize,
  Minus,
  Pencil,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { fitView, type View, zoomAt } from "../lib/graph-layout";
import { useProjects } from "../lib/m5-queries";
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
  MAX_LAYER,
  NAMED_LAYERS,
  nodePoint,
  nodeRadius,
  nodesCiting,
  onPath,
  readingOrder,
  ringCount,
  ringRadius,
  sourceHost,
  sourcesOf,
  trends,
} from "../lib/mind-model";
import { useMindMap } from "../lib/mind-queries";
import {
  type NodeFields,
  type SourceFields,
  useAddMindEdge,
  useArchiveMindNode,
  useArchiveMindSource,
  useCreateValidationTask,
  useLinkMindSource,
  useRemoveMindEdge,
  useSaveMindNode,
  useSaveMindSource,
  useUnlinkMindSource,
  useUpdateMindEdge,
} from "../lib/mutations/mind";
import { useTasks } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

type Translate = ReturnType<typeof useTranslation>["t"];
const EDGE_KINDS = ["relates", "supports", "contradicts"] as const;
const MOMENTA = [2, 1, 0, -1, -2] as const;
/** Days from today for a validation task's default due date (prototype +5). */
const VALIDATION_DAYS = 5;

type Dialog =
  | { kind: "node"; node: MindNode | null; layer?: number }
  | { kind: "source"; source: MindSource | null; linkTo: MindNode | null }
  | { kind: "task"; node: MindNode };

export const layerLabel = (t: Translate, layer: number) =>
  layer < NAMED_LAYERS
    ? t(`mind.layer.${layer}`)
    : t("mind.layerN", { n: layer + 1 });
const momentumLabel = (t: Translate, momentum: number) =>
  t(`mind.momentum.${momentum < 0 ? `m${-momentum}` : momentum}`);
const momentumMark = (momentum: number) =>
  momentum > 0
    ? "↑".repeat(momentum)
    : momentum < 0
      ? "↓".repeat(-momentum)
      : "";
const isOptimistic = (id: string | null) => !!id?.startsWith("optimistic:");

export function MindView({ project }: { project: Project | undefined }) {
  const { workspace, me } = useWorkspace();
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ids = useId();
  const [asList, setAsList] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("node"),
  );
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const query = useMindMap(workspace.id, showArchived);
  const map = query.data;
  const nodes = useMemo(() => readingOrder(map?.nodes ?? []), [map]);
  const selected = nodes.find((node) => node.id === selectedId);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const overviewHeading = useRef<HTMLHeadingElement>(null);
  const focusAfter = useRef<"detail" | "overview" | null>(null);
  const canWrite = !!map?.canWrite;
  const canArchive = !!map?.canArchive;
  const openTask = (taskId: string) => router.push(`/tasks/${taskId}`);
  const saveNode = useSaveMindNode(workspace.id, canArchive);
  const saveSource = useSaveMindSource(workspace.id, canArchive);
  const makeTask = useCreateValidationTask(workspace.id, openTask);

  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    // Wait for the heading: a new node's detail appears once it is saved.
    const heading = (target === "detail" ? detailHeading : overviewHeading)
      .current;
    if (!heading) return;
    focusAfter.current = null;
    heading.focus();
  });

  /** Selects a node (null: the overview); keyboard picks move focus too. */
  const choose = (id: string | null, focus = false) => {
    setSelectedId(id);
    const node = nodes.find((item) => item.id === id);
    setAnnouncement(
      node ? t("mind.selected", { title: node.title }) : t("mind.overview"),
    );
    if (focus) focusAfter.current = id ? "detail" : "overview";
  };

  return (
    <section
      className="mind-view"
      data-testid="mind-view"
      aria-labelledby={`${ids}-title`}
    >
      <header className="mind-header">
        <div className="mind-heading">
          <h2 id={`${ids}-title`}>{t("mind.title")}</h2>
          <p>{t("mind.subtitle")}</p>
        </div>
        <div className="mind-toolbar">
          {canWrite && (
            <>
              <Button
                type="button"
                className="button-primary"
                data-testid="mind-new-node"
                onClick={() => setDialog({ kind: "node", node: null })}
              >
                <Plus size={16} aria-hidden="true" />
                {t("mind.newNode")}
              </Button>
              <Button
                type="button"
                data-testid="mind-new-source"
                onClick={() =>
                  setDialog({ kind: "source", source: null, linkTo: null })
                }
              >
                <Plus size={16} aria-hidden="true" />
                {t("mind.newSource")}
              </Button>
            </>
          )}
          <button
            type="button"
            className="mind-chip"
            aria-pressed={asList}
            data-testid="mind-as-list"
            onClick={() => setAsList(!asList)}
          >
            {t("mind.asList")}
          </button>
          {canArchive && (
            <button
              type="button"
              className="mind-chip"
              aria-pressed={showArchived}
              data-testid="mind-show-archived"
              onClick={() => setShowArchived(!showArchived)}
            >
              {t("mind.showArchived")}
            </button>
          )}
        </div>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {query.isPending ? (
        <p className="loading mind-pad">{t("loading")}</p>
      ) : query.isError || !map ? (
        <p className="alert mind-pad" role="alert">
          {t(errorKey(query.error))}
        </p>
      ) : (
        <div className="mind-body">
          {nodes.length === 0 ? (
            <div className="mind-empty" data-testid="mind-empty">
              <p>{t(canWrite ? "mind.empty" : "mind.emptyReadOnly")}</p>
            </div>
          ) : asList ? (
            <MindList
              map={map}
              nodes={nodes}
              selectedId={selected?.id ?? null}
              onSelect={(id) => choose(id, true)}
              t={t}
            />
          ) : (
            <MindCanvas
              map={map}
              nodes={nodes}
              selectedId={selected?.id ?? null}
              onSelect={(id) => choose(id)}
              t={t}
            />
          )}
          <aside
            className="mind-panel"
            data-testid="mind-panel"
            aria-label={t("mind.panel")}
          >
            {selected ? (
              <NodeDetail
                key={selected.id}
                map={map}
                node={selected}
                heading={detailHeading}
                onSelect={(id) => choose(id, true)}
                onBack={() => choose(null, true)}
                onDialog={setDialog}
                taskPending={makeTask.isPending}
                t={t}
              />
            ) : (
              <Overview
                map={map}
                heading={overviewHeading}
                onSelect={(id) => choose(id, true)}
                onDialog={setDialog}
                t={t}
              />
            )}
          </aside>
        </div>
      )}
      {dialog?.kind === "node" && map && (
        <NodeForm
          map={map}
          node={dialog.node}
          busy={saveNode.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(fields) => {
            const node = dialog.node;
            saveNode.mutate({
              node,
              fields,
              onSaved: (saved) => {
                if (!node) choose(saved.id, true);
              },
            });
            setDialog(null);
          }}
          t={t}
        />
      )}
      {dialog?.kind === "source" && (
        <SourceForm
          source={dialog.source}
          linkTo={dialog.linkTo}
          busy={saveSource.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(fields) => {
            saveSource.mutate({
              source: dialog.source,
              fields,
              linkTo: dialog.linkTo?.id ?? null,
            });
            setDialog(null);
          }}
          t={t}
        />
      )}
      {dialog?.kind === "task" && (
        <TaskForm
          node={dialog.node}
          project={project}
          timeZone={me.user.tz}
          busy={makeTask.isPending}
          onClose={() => setDialog(null)}
          onSubmit={(body) => {
            makeTask.mutate({
              node: dialog.node,
              body,
              reference: (result) =>
                taskReference(workspace.key, result.task.number),
            });
            setDialog(null);
          }}
          t={t}
        />
      )}
    </section>
  );
}

/** Layer fills (prototype FILL): solid, muted, outlined, gold. */
const layerClass = (layer: number) => `is-layer-${Math.min(layer, 3)}`;

function MindCanvas({
  map,
  nodes,
  selectedId,
  onSelect,
  t,
}: {
  map: MindMap;
  nodes: MindNode[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  t: Translate;
}) {
  const box = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    start: View | null;
    distance: number;
    mid: { x: number; y: number };
    moved: boolean;
  }>({
    pointers: new Map(),
    start: null,
    distance: 0,
    mid: { x: 0, y: 0 },
    moved: false,
  });
  const rings = ringCount(nodes);
  const extent = canvasExtent(rings);
  const byId = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const cited = useMemo(
    () => new Set(map.nodeSources.map((link) => link.nodeId)),
    [map.nodeSources],
  );
  const family = useMemo(
    () => (selectedId ? lineage(map.edges, selectedId) : null),
    [map.edges, selectedId],
  );
  const lit = (id: string) =>
    !selectedId ||
    id === selectedId ||
    !!family?.ancestors.has(id) ||
    !!family?.descendants.has(id);

  const size = () => ({
    width: box.current?.clientWidth ?? 600,
    height: box.current?.clientHeight ?? 480,
  });
  const fit = () => {
    const { width, height } = size();
    setView(
      fitView(
        [
          { x: -extent, y: -extent },
          { x: extent, y: extent },
        ],
        width,
        height,
        8,
      ),
    );
  };
  // Fit on first paint and whenever a ring is added or removed.
  useLayoutEffect(fit, [extent]);
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
  }, []);
  const local = (event: PointerEvent) => {
    const rect = svg.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };
  const begin = () => {
    const state = drag.current;
    const [a, b] = [...state.pointers.values()];
    state.start = viewRef.current;
    if (!a) return;
    state.distance = b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    state.mid = b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
  };
  const onDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    drag.current.pointers.set(event.pointerId, local(event));
    drag.current.moved = false;
    begin();
  };
  const onMove = (event: PointerEvent<SVGSVGElement>) => {
    const state = drag.current;
    if (!state.pointers.has(event.pointerId) || !state.start) return;
    state.pointers.set(event.pointerId, local(event));
    const [a, b] = [...state.pointers.values()];
    if (!a) return;
    if (!state.moved && Math.hypot(a.x - state.mid.x, a.y - state.mid.y) < 4)
      return;
    if (!state.moved) svg.current?.setPointerCapture(event.pointerId);
    state.moved = true;
    if (b && state.distance > 0) {
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoomed = zoomAt(
        state.start,
        Math.hypot(b.x - a.x, b.y - a.y) / state.distance,
        state.mid.x,
        state.mid.y,
      );
      setView({
        ...zoomed,
        x: zoomed.x + mid.x - state.mid.x,
        y: zoomed.y + mid.y - state.mid.y,
      });
    } else
      setView({
        ...state.start,
        x: state.start.x + a.x - state.mid.x,
        y: state.start.y + a.y - state.mid.y,
      });
  };
  const onUp = (event: PointerEvent<SVGSVGElement>) => {
    drag.current.pointers.delete(event.pointerId);
    if (drag.current.pointers.size) begin();
    else drag.current.start = null;
  };
  const zoomBy = (factor: number) => {
    if (!view) return;
    const { width, height } = size();
    setView(zoomAt(view, factor, width / 2, height / 2));
  };
  const k = view?.k ?? 1;
  // Labels never fall below 12 px on screen; when that would crowd the
  // rings, only the inner ring and the selected path keep theirs.
  const crowded = k < 0.55;
  const fontSize = (node: MindNode) =>
    Math.max(node.layer === 0 ? 16 : 14, 12 / k);

  return (
    <div className="mind-canvas" ref={box}>
      <svg
        ref={svg}
        className={`mind-svg${selectedId ? " has-selection" : ""}`}
        role="img"
        aria-label={t("mind.canvasLabel", { count: nodes.length })}
        data-testid="mind-canvas"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onClick={() => {
          if (!drag.current.moved) onSelect(null);
        }}
      >
        {view && (
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {Array.from({ length: rings }, (_, layer) => (
              <g key={layer}>
                <circle r={ringRadius(layer)} className="mind-ring" />
                <text
                  x={0}
                  y={-ringRadius(layer) + Math.max(18, 14 / k)}
                  fontSize={Math.max(12, 12 / k)}
                  className="mind-ring-label"
                >
                  {layerLabel(t, layer)}
                </text>
              </g>
            ))}
            {map.edges.map((edge) => {
              const from = byId.get(edge.fromNodeId);
              const to = byId.get(edge.toNodeId);
              if (!from || !to) return null;
              const on =
                !!selectedId && !!family && onPath(edge, selectedId, family);
              return (
                <path
                  key={edge.id}
                  d={edgePath(from, to)}
                  className={`mind-edge is-${edge.kind}${on ? " is-on" : ""}`}
                  data-testid="mind-edge"
                  data-from={edge.fromNodeId}
                  data-to={edge.toNodeId}
                  data-kind={edge.kind}
                />
              );
            })}
            <circle r={36} className="mind-core" />
            <text
              y={5}
              fontSize={Math.max(13, 12 / k)}
              className="mind-core-label"
            >
              {t("mind.centre")}
            </text>
            {nodes.map((node) => {
              const p = nodePoint(node);
              const r = nodeRadius(node.strength);
              const label = labelPlacement(node);
              const on = lit(node.id);
              const showLabel =
                !crowded || node.layer === 0 || (!!selectedId && on);
              return (
                <g
                  key={node.id}
                  className={`mind-node ${layerClass(node.layer)}${node.id === selectedId ? " is-selected" : ""}${on ? "" : " is-dim"}${node.archivedAt ? " is-archived" : ""}`}
                  data-testid="mind-node"
                  data-id={node.id}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(node.id === selectedId ? null : node.id);
                  }}
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={Math.max(r + 10, 22 / k)}
                    className="mind-hit"
                  />
                  {node.id === selectedId && (
                    <circle cx={p.x} cy={p.y} r={r + 5} className="mind-halo" />
                  )}
                  <circle cx={p.x} cy={p.y} r={r} className="mind-dot" />
                  {cited.has(node.id) && (
                    <circle
                      cx={p.x + r * 0.75}
                      cy={p.y - r * 0.75}
                      r={3.2}
                      className="mind-evidence"
                    />
                  )}
                  {showLabel && (
                    <text
                      x={label.x}
                      y={label.y}
                      textAnchor={label.anchor}
                      fontSize={fontSize(node)}
                      className="mind-label"
                    >
                      {node.title}
                      {node.momentum !== 0 && (
                        <tspan
                          className={
                            node.momentum > 0 ? "mind-up" : "mind-down"
                          }
                        >
                          {` ${momentumMark(node.momentum)}`}
                        </tspan>
                      )}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
      </svg>
      <div className="mind-zoom">
        <Button
          type="button"
          aria-label={t("relations.zoomIn")}
          data-testid="mind-zoom-in"
          onClick={() => zoomBy(1.25)}
        >
          <Plus size={18} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          aria-label={t("relations.zoomOut")}
          data-testid="mind-zoom-out"
          onClick={() => zoomBy(0.8)}
        >
          <Minus size={18} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          aria-label={t("relations.fit")}
          data-testid="mind-fit"
          onClick={fit}
        >
          <Maximize size={18} aria-hidden="true" />
        </Button>
      </div>
      <ul className="mind-legend" aria-label={t("relations.legend")}>
        {[0, 1, 2, 3].map((layer) => (
          <li key={layer}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <g className={`mind-node ${layerClass(layer)}`}>
                <circle cx={6} cy={6} r={5} className="mind-dot" />
              </g>
            </svg>
            {layerLabel(t, layer)}
          </li>
        ))}
        <li>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <circle cx={6} cy={6} r={3.5} className="mind-evidence" />
          </svg>
          {t("mind.evidence")}
        </li>
        <li>
          <span className="mind-up" aria-hidden="true">
            ↑
          </span>
          {t("mind.momentum.1")}
        </li>
      </ul>
    </div>
  );
}

/** Every node grouped by ring, as buttons; ↑/↓ move between them. */
function MindList({
  map,
  nodes,
  selectedId,
  onSelect,
  t,
}: {
  map: MindMap;
  nodes: MindNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  t: Translate;
}) {
  const layers = [...new Set(nodes.map((node) => node.layer))];
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "[data-testid='mind-list-node']",
      ),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    buttons[
      Math.min(
        buttons.length - 1,
        Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)),
      )
    ]?.focus();
  };
  return (
    <div className="mind-list" data-testid="mind-list" onKeyDown={onKey}>
      {layers.map((layer) => (
        <section key={layer} aria-labelledby={`mind-list-layer-${layer}`}>
          <h3 id={`mind-list-layer-${layer}`} className="mind-eyebrow">
            {layerLabel(t, layer)}
          </h3>
          <ul>
            {nodes
              .filter((node) => node.layer === layer)
              .map((node) => {
                const evidence = sourcesOf(map, node.id).length;
                const links = linksOf(map, node.id).length;
                return (
                  <li key={node.id}>
                    <button
                      type="button"
                      className="mind-row"
                      data-testid="mind-list-node"
                      data-id={node.id}
                      aria-current={node.id === selectedId ? "true" : undefined}
                      onClick={() => onSelect(node.id)}
                    >
                      <span className="mind-row-title">
                        {node.title}
                        {node.archivedAt && (
                          <span className="mind-tag">{t("mind.archived")}</span>
                        )}
                      </span>
                      <span className="mind-row-meta">
                        {momentumLabel(t, node.momentum)} ·{" "}
                        {t("mind.strengthValue", { value: node.strength })} ·{" "}
                        {t("mind.evidenceCount", { count: evidence })} ·{" "}
                        {t("mind.linkCount", { count: links })}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NodeButton({
  node,
  onSelect,
  t,
  testId,
  trailing,
}: {
  node: MindNode;
  onSelect: (id: string) => void;
  t: Translate;
  testId: string;
  trailing?: string;
}) {
  return (
    <button
      type="button"
      className="mind-row mind-row-inline"
      data-testid={testId}
      data-id={node.id}
      onClick={() => onSelect(node.id)}
    >
      <span className="mind-row-layer">{layerLabel(t, node.layer)}</span>
      <span className="mind-row-title">{node.title}</span>
      {trailing && (
        <span className="mind-row-mark" aria-hidden="true">
          {trailing}
        </span>
      )}
    </button>
  );
}

function Overview({
  map,
  heading,
  onSelect,
  onDialog,
  t,
}: {
  map: MindMap;
  heading: RefObject<HTMLHeadingElement | null>;
  onSelect: (id: string) => void;
  onDialog: (dialog: Dialog) => void;
  t: Translate;
}) {
  const archiveSource = useArchiveMindSource(map.workspaceId);
  const { rising, cooling } = trends(map.nodes);
  const counts = coverage(map);
  return (
    <div className="mind-overview" data-testid="mind-overview">
      <h2 ref={heading} tabIndex={-1} className="mind-panel-title">
        {t("mind.overview")}
      </h2>
      <p className="mind-hint">{t("mind.selectHint")}</p>
      <section aria-labelledby="mind-rising">
        <h3 id="mind-rising" className="mind-eyebrow">
          {t("mind.rising")}
        </h3>
        {rising.length ? (
          <ul className="mind-rows">
            {rising.map((node) => (
              <li key={node.id}>
                <NodeButton
                  node={node}
                  onSelect={onSelect}
                  t={t}
                  testId="mind-rising-node"
                  trailing={momentumMark(node.momentum)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mind-hint">{t("mind.noneRising")}</p>
        )}
      </section>
      <section aria-labelledby="mind-cooling">
        <h3 id="mind-cooling" className="mind-eyebrow">
          {t("mind.cooling")}
        </h3>
        {cooling.length ? (
          <ul className="mind-rows">
            {cooling.map((node) => (
              <li key={node.id}>
                <NodeButton
                  node={node}
                  onSelect={onSelect}
                  t={t}
                  testId="mind-cooling-node"
                  trailing={momentumMark(node.momentum)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mind-hint">{t("mind.noneCooling")}</p>
        )}
      </section>
      <section aria-labelledby="mind-sources" data-testid="mind-sources">
        <div className="mind-eyebrow-row">
          <h3 id="mind-sources" className="mind-eyebrow">
            {t("mind.sourcesCount", { count: map.sources.length })}
          </h3>
          <span className="mind-hint" data-testid="mind-coverage">
            {t("mind.coverage", { cited: counts.cited, total: counts.total })}
          </span>
        </div>
        {map.sources.length === 0 ? (
          <p className="mind-hint">{t("mind.noSources")}</p>
        ) : (
          <ul className="mind-sources">
            {map.sources.map((source) => (
              <li
                key={source.id}
                data-testid="mind-source"
                data-id={source.id}
                className={source.archivedAt ? "is-archived" : undefined}
              >
                <SourceCitation source={source} t={t} />
                <span className="mind-hint">
                  {t("mind.citedBy", {
                    count: nodesCiting(map, source.id).length,
                  })}
                  {source.archivedAt ? ` · ${t("mind.archived")}` : ""}
                </span>
                <div className="mind-actions">
                  {map.canWrite && !source.archivedAt && (
                    <Button
                      type="button"
                      className="button-quiet"
                      data-testid="mind-source-edit"
                      aria-label={t("mind.editSourceNamed", {
                        title: source.title,
                      })}
                      onClick={() =>
                        onDialog({ kind: "source", source, linkTo: null })
                      }
                    >
                      <Pencil size={16} aria-hidden="true" />
                      {t("mind.edit")}
                    </Button>
                  )}
                  {map.canArchive && (
                    <Button
                      type="button"
                      className="button-quiet"
                      data-testid={
                        source.archivedAt
                          ? "mind-source-restore"
                          : "mind-source-archive"
                      }
                      aria-label={t(
                        source.archivedAt
                          ? "mind.restoreNamed"
                          : "mind.archiveNamed",
                        { title: source.title },
                      )}
                      disabled={isOptimistic(source.id)}
                      onClick={() =>
                        archiveSource.mutate({
                          source,
                          archived: !source.archivedAt,
                        })
                      }
                    >
                      {t(source.archivedAt ? "mind.restore" : "mind.archive")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mind-footnote">{t("mind.notesFootnote")}</p>
    </div>
  );
}

function SourceCitation({ source, t }: { source: MindSource; t: Translate }) {
  const host = sourceHost(source.url);
  return (
    <div className="mind-citation">
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mind-citation-title"
          data-testid="mind-source-link"
        >
          {source.title}
          <ArrowUpRight size={14} aria-hidden="true" />
          <span className="sr-only">{t("mind.opensInNewTab")}</span>
        </a>
      ) : (
        <span className="mind-citation-title">{source.title}</span>
      )}
      {host && <span className="mind-tag">{host}</span>}
    </div>
  );
}

function NodeDetail({
  map,
  node,
  heading,
  onSelect,
  onBack,
  onDialog,
  taskPending,
  t,
}: {
  map: MindMap;
  node: MindNode;
  heading: RefObject<HTMLHeadingElement | null>;
  onSelect: (id: string) => void;
  onBack: () => void;
  onDialog: (dialog: Dialog) => void;
  taskPending: boolean;
  t: Translate;
}) {
  const { workspace } = useWorkspace();
  const ids = useId();
  const tasks = useTasks(workspace.id);
  const archiveNode = useArchiveMindNode(workspace.id);
  const addEdge = useAddMindEdge(workspace.id);
  const updateEdge = useUpdateMindEdge(workspace.id);
  const removeEdge = useRemoveMindEdge(workspace.id);
  const link = useLinkMindSource(workspace.id);
  const unlink = useUnlinkMindSource(workspace.id);
  const byId = new Map(map.nodes.map((item) => [item.id, item]));
  const family = lineage(map.edges, node.id);
  const chips = (set: Set<string>) =>
    readingOrder(
      [...set].flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      }),
    );
  const from = chips(family.ancestors);
  const to = chips(family.descendants);
  const evidence = sourcesOf(map, node.id);
  const unused = map.sources.filter(
    (source) =>
      !source.archivedAt &&
      !isOptimistic(source.id) &&
      !evidence.some((item) => item.id === source.id),
  );
  const links = linksOf(map, node.id);
  const others = readingOrder(
    map.nodes.filter(
      (item) =>
        item.id !== node.id &&
        !item.archivedAt &&
        !isOptimistic(item.id) &&
        !hasEdge(map, node.id, item.id),
    ),
  );
  const [addSource, setAddSource] = useState("");
  const [linkDirection, setLinkDirection] = useState<"out" | "in">("out");
  const [linkTarget, setLinkTarget] = useState("");
  const [linkKind, setLinkKind] = useState<MindEdge["kind"]>("relates");
  const archived = !!node.archivedAt;
  const editable = map.canWrite && !archived && !isOptimistic(node.id);
  const task = node.taskId
    ? tasks.data?.find((item) => item.id === node.taskId)
    : undefined;

  return (
    <div className="mind-detail" data-testid="mind-detail" data-id={node.id}>
      <button
        type="button"
        className="mind-back"
        data-testid="mind-back"
        onClick={onBack}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        {t("mind.back")}
      </button>
      <div className="mind-detail-head">
        <span className="mind-eyebrow">{layerLabel(t, node.layer)}</span>
        <h2
          ref={heading}
          tabIndex={-1}
          className="mind-detail-title"
          data-testid="mind-detail-title"
        >
          {node.title}
        </h2>
        <div className="mind-badges">
          <span
            className={`mind-badge is-${node.momentum > 0 ? "up" : node.momentum < 0 ? "down" : "flat"}`}
            data-testid="mind-momentum"
          >
            {momentumLabel(t, node.momentum)}
          </span>
          {archived && (
            <span className="mind-badge is-down">{t("mind.archived")}</span>
          )}
        </div>
      </div>
      <div className="mind-strength">
        <span id={`${ids}-strength`}>{t("mind.strength")}</span>
        <div
          className="mind-meter"
          role="meter"
          aria-labelledby={`${ids}-strength`}
          aria-valuemin={1}
          aria-valuemax={5}
          aria-valuenow={node.strength}
          data-testid="mind-strength"
        >
          <div style={{ width: `${(node.strength / 5) * 100}%` }} />
        </div>
        <span>{t("mind.strengthValue", { value: node.strength })}</span>
      </div>
      {(editable || (map.canArchive && !isOptimistic(node.id))) && (
        <div className="mind-actions">
          {editable && (
            <Button
              type="button"
              data-testid="mind-edit-node"
              onClick={() => onDialog({ kind: "node", node })}
            >
              <Pencil size={16} aria-hidden="true" />
              {t("mind.editNode")}
            </Button>
          )}
          {map.canArchive && (
            <Button
              type="button"
              className="button-quiet"
              data-testid={archived ? "mind-restore-node" : "mind-archive-node"}
              onClick={() => archiveNode.mutate({ node, archived: !archived })}
            >
              {t(archived ? "mind.restore" : "mind.archive")}
            </Button>
          )}
        </div>
      )}
      <section className="mind-note" aria-labelledby={`${ids}-note`}>
        <h3 id={`${ids}-note`} className="mind-eyebrow">
          {t(node.layer === 3 ? "mind.opportunity" : "mind.insight")}
        </h3>
        {node.note ? (
          <p className="preserve-text" data-testid="mind-note">
            {node.note}
          </p>
        ) : (
          <p className="mind-hint">{t("mind.noNote")}</p>
        )}
        <p className="mind-footnote">{t("mind.noteByPerson")}</p>
      </section>
      <section aria-labelledby={`${ids}-evidence`} data-testid="mind-evidence">
        <h3 id={`${ids}-evidence`} className="mind-eyebrow">
          {t("mind.evidenceCount", { count: evidence.length })}
        </h3>
        {evidence.length === 0 && (
          <p className="mind-warning" data-testid="mind-no-evidence">
            {t("mind.noEvidence")}
          </p>
        )}
        <ul className="mind-sources">
          {evidence.map((source) => (
            <li
              key={source.id}
              data-testid="mind-evidence-item"
              data-id={source.id}
            >
              <SourceCitation source={source} t={t} />
              {source.note && <p className="preserve-text">{source.note}</p>}
              {editable && (
                <div className="mind-actions">
                  <Button
                    type="button"
                    className="button-quiet"
                    data-testid="mind-evidence-remove"
                    aria-label={t("mind.removeEvidenceNamed", {
                      title: source.title,
                    })}
                    onClick={() => unlink.mutate({ node, source })}
                  >
                    {t("actions.remove")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {editable && (
          <div className="mind-inline-form">
            {unused.length > 0 && (
              <form
                className="mind-inline-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  const source = unused.find((item) => item.id === addSource);
                  if (!source) return;
                  link.mutate({ node, source });
                  setAddSource("");
                }}
              >
                <div className="field">
                  <Label htmlFor={`${ids}-add-source`}>
                    {t("mind.addEvidence")}
                  </Label>
                  <select
                    id={`${ids}-add-source`}
                    data-testid="mind-add-evidence"
                    value={addSource}
                    onChange={(event) => setAddSource(event.target.value)}
                  >
                    <option value="">{t("mind.chooseSource")}</option>
                    {unused.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.title}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  type="submit"
                  data-testid="mind-add-evidence-submit"
                  disabled={!addSource}
                >
                  {t("mind.add")}
                </Button>
              </form>
            )}
            <Button
              type="button"
              className="button-quiet"
              data-testid="mind-new-evidence"
              onClick={() =>
                onDialog({ kind: "source", source: null, linkTo: node })
              }
            >
              <Plus size={16} aria-hidden="true" />
              {t("mind.newEvidence")}
            </Button>
          </div>
        )}
      </section>
      {from.length > 0 && (
        <section aria-labelledby={`${ids}-from`}>
          <h3 id={`${ids}-from`} className="mind-eyebrow">
            {t("mind.from")}
          </h3>
          <ul className="mind-chips">
            {from.map((item) => (
              <li key={item.id}>
                <NodeButton
                  node={item}
                  onSelect={onSelect}
                  t={t}
                  testId="mind-from-node"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      {to.length > 0 && (
        <section aria-labelledby={`${ids}-to`}>
          <h3 id={`${ids}-to`} className="mind-eyebrow">
            {t("mind.leadsTo")}
          </h3>
          <ul className="mind-chips">
            {to.map((item) => (
              <li key={item.id}>
                <NodeButton
                  node={item}
                  onSelect={onSelect}
                  t={t}
                  testId="mind-to-node"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section aria-labelledby={`${ids}-links`} data-testid="mind-links">
        <h3 id={`${ids}-links`} className="mind-eyebrow">
          {t("mind.links")}
        </h3>
        {links.length === 0 && <p className="mind-hint">{t("mind.noLinks")}</p>}
        <ul className="mind-link-list">
          {links.map(({ edge, other, outgoing }) => (
            <li
              key={edge.id}
              data-testid="mind-link"
              data-id={edge.id}
              data-other={other.id}
            >
              <button
                type="button"
                className="mind-row mind-row-inline"
                data-testid="mind-link-node"
                onClick={() => onSelect(other.id)}
              >
                <span className="mind-row-layer">
                  {t(outgoing ? "mind.direction.out" : "mind.direction.in")}
                </span>
                <span className="mind-row-title">{other.title}</span>
              </button>
              {editable && !isOptimistic(edge.id) ? (
                <div className="mind-inline-row">
                  <div className="field">
                    <Label htmlFor={`${ids}-kind-${edge.id}`}>
                      {t("mind.linkKindFor", { title: other.title })}
                    </Label>
                    <select
                      id={`${ids}-kind-${edge.id}`}
                      data-testid="mind-link-kind"
                      value={edge.kind}
                      onChange={(event) =>
                        updateEdge.mutate({
                          edge,
                          kind: event.target.value as MindEdge["kind"],
                        })
                      }
                    >
                      {EDGE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {t(`mind.edgeKind.${kind}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    type="button"
                    className="button-quiet"
                    data-testid="mind-link-remove"
                    aria-label={t("mind.removeLinkNamed", {
                      title: other.title,
                    })}
                    onClick={() => removeEdge.mutate(edge)}
                  >
                    {t("actions.remove")}
                  </Button>
                </div>
              ) : (
                <span className="mind-hint">
                  {t(`mind.edgeKind.${edge.kind}`)}
                </span>
              )}
            </li>
          ))}
        </ul>
        {editable && others.length > 0 && (
          <form
            className="mind-inline-form"
            data-testid="mind-add-link"
            onSubmit={(event) => {
              event.preventDefault();
              if (!linkTarget) return;
              const added = addEdge.add({
                fromNodeId: linkDirection === "out" ? node.id : linkTarget,
                toNodeId: linkDirection === "out" ? linkTarget : node.id,
                kind: linkKind,
              });
              if (added) setLinkTarget("");
            }}
          >
            <h4 className="mind-subtitle">{t("mind.addLink")}</h4>
            <div className="field">
              <Label htmlFor={`${ids}-direction`}>
                {t("mind.direction.label")}
              </Label>
              <select
                id={`${ids}-direction`}
                data-testid="mind-add-link-direction"
                value={linkDirection}
                onChange={(event) =>
                  setLinkDirection(event.target.value === "in" ? "in" : "out")
                }
              >
                <option value="out">{t("mind.direction.out")}</option>
                <option value="in">{t("mind.direction.in")}</option>
              </select>
            </div>
            <div className="field">
              <Label htmlFor={`${ids}-target`}>{t("mind.linkTarget")}</Label>
              <select
                id={`${ids}-target`}
                data-testid="mind-add-link-target"
                value={linkTarget}
                onChange={(event) => setLinkTarget(event.target.value)}
              >
                <option value="">{t("mind.chooseNode")}</option>
                {others.map((item) => (
                  <option key={item.id} value={item.id}>
                    {layerLabel(t, item.layer)} · {item.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <Label htmlFor={`${ids}-link-kind`}>{t("mind.linkKind")}</Label>
              <select
                id={`${ids}-link-kind`}
                data-testid="mind-add-link-kind"
                value={linkKind}
                onChange={(event) =>
                  setLinkKind(event.target.value as MindEdge["kind"])
                }
              >
                {EDGE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`mind.edgeKind.${kind}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="action-row">
              <Button
                type="submit"
                data-testid="mind-add-link-submit"
                disabled={!linkTarget}
              >
                {t("mind.add")}
              </Button>
            </div>
          </form>
        )}
      </section>
      <section aria-labelledby={`${ids}-task`} data-testid="mind-task">
        <h3 id={`${ids}-task`} className="mind-eyebrow">
          {t("mind.validation")}
        </h3>
        {node.taskId ? (
          <div className="mind-tasked" data-testid="mind-tasked">
            <span className="mind-success">
              <CircleCheck size={16} aria-hidden="true" />
              {isOptimistic(node.taskId)
                ? t("mind.taskCreating")
                : task
                  ? t("mind.taskMadeRef", {
                      ref: taskReference(workspace.key, task.number),
                      title: task.title,
                    })
                  : t("mind.taskMade")}
            </span>
            {!isOptimistic(node.taskId) && (
              <Link
                href={`/tasks/${node.taskId}`}
                className="text-link"
                data-testid="mind-open-task"
              >
                <ExternalLink size={14} aria-hidden="true" />
                {t("mind.openTask")}
              </Link>
            )}
          </div>
        ) : editable ? (
          <>
            <p className="mind-hint">{t("mind.validationHint")}</p>
            <Button
              type="button"
              className="button-primary"
              data-testid="mind-make-task"
              disabled={taskPending}
              onClick={() => onDialog({ kind: "task", node })}
            >
              <Plus size={16} aria-hidden="true" />
              {t("mind.makeTask")}
            </Button>
          </>
        ) : (
          <p className="mind-hint">{t("mind.noTask")}</p>
        )}
      </section>
    </div>
  );
}

function NodeForm({
  map,
  node,
  busy,
  onClose,
  onSubmit,
  t,
}: {
  map: MindMap;
  node: MindNode | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (fields: NodeFields) => void;
  t: Translate;
}) {
  const id = useId();
  const [title, setTitle] = useState(node?.title ?? "");
  const [layer, setLayer] = useState(node?.layer ?? 0);
  const [angle, setAngle] = useState(
    String(node?.angle ?? freeAngle(map.nodes, 0)),
  );
  const [angleTouched, setAngleTouched] = useState(!!node);
  const [strength, setStrength] = useState(node?.strength ?? 3);
  const [momentum, setMomentum] = useState(node?.momentum ?? 0);
  const [note, setNote] = useState(node?.note ?? "");
  const [invalid, setInvalid] = useState(false);
  const angleValue = Number(angle);
  const angleOk =
    angle.trim() !== "" &&
    Number.isFinite(angleValue) &&
    angleValue >= 0 &&
    angleValue < 360;
  const titleOk = !!title.trim();
  return (
    <SheetDialog
      title={t(node ? "mind.editNode" : "mind.newNode")}
      onClose={onClose}
      className="mind-form"
    >
      <form
        noValidate
        data-testid="mind-node-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!titleOk || !angleOk) {
            setInvalid(true);
            return;
          }
          onSubmit({
            title: title.trim(),
            layer,
            angle: Math.round(angleValue * 100) / 100,
            strength,
            momentum,
            note,
          });
        }}
      >
        <div className="field">
          <Label htmlFor={`${id}-title`}>{t("mind.form.title")}</Label>
          <Input
            id={`${id}-title`}
            data-testid="mind-node-title"
            value={title}
            maxLength={200}
            required
            aria-invalid={invalid && !titleOk}
            aria-describedby={
              invalid && !titleOk ? `${id}-title-error` : undefined
            }
            onChange={(event) => setTitle(event.target.value)}
          />
          {invalid && !titleOk && (
            <p id={`${id}-title-error`} className="field-error" role="alert">
              {t("mind.form.required")}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor={`${id}-layer`}>{t("mind.form.layer")}</Label>
          <select
            id={`${id}-layer`}
            data-testid="mind-node-layer"
            value={layer}
            onChange={(event) => {
              const next = Number(event.target.value);
              setLayer(next);
              if (!angleTouched) setAngle(String(freeAngle(map.nodes, next)));
            }}
          >
            {Array.from({ length: MAX_LAYER + 1 }, (_, value) => (
              <option key={value} value={value}>
                {layerLabel(t, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <Label htmlFor={`${id}-angle`}>{t("mind.form.angle")}</Label>
          <Input
            id={`${id}-angle`}
            data-testid="mind-node-angle"
            type="number"
            inputMode="decimal"
            min={0}
            max={359.99}
            step={0.01}
            value={angle}
            aria-invalid={invalid && !angleOk}
            aria-describedby={`${id}-angle-hint`}
            onChange={(event) => {
              setAngleTouched(true);
              setAngle(event.target.value);
            }}
          />
          <p id={`${id}-angle-hint`} className="field-hint">
            {t("mind.form.angleHint")}
          </p>
          {invalid && !angleOk && (
            <p className="field-error" role="alert">
              {t("mind.form.angleError")}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor={`${id}-strength`}>{t("mind.strength")}</Label>
          <select
            id={`${id}-strength`}
            data-testid="mind-node-strength"
            value={strength}
            onChange={(event) => setStrength(Number(event.target.value))}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {t("mind.strengthValue", { value })}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <Label htmlFor={`${id}-momentum`}>{t("mind.form.momentum")}</Label>
          <select
            id={`${id}-momentum`}
            data-testid="mind-node-momentum"
            value={momentum}
            onChange={(event) => setMomentum(Number(event.target.value))}
          >
            {MOMENTA.map((value) => (
              <option key={value} value={value}>
                {momentumLabel(t, value)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <Label htmlFor={`${id}-note`}>{t("mind.form.note")}</Label>
          <textarea
            id={`${id}-note`}
            className="input"
            data-testid="mind-node-note"
            rows={4}
            maxLength={4000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div className="action-row">
          <Button
            type="submit"
            className="button-primary"
            data-testid="mind-node-save"
            disabled={busy}
          >
            {t(node ? "crm.form.save" : "crm.form.create")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}

const URL_PATTERN = /^https?:\/\/\S+$/;

function SourceForm({
  source,
  linkTo,
  busy,
  onClose,
  onSubmit,
  t,
}: {
  source: MindSource | null;
  linkTo: MindNode | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (fields: SourceFields) => void;
  t: Translate;
}) {
  const id = useId();
  const [title, setTitle] = useState(source?.title ?? "");
  const [url, setUrl] = useState(source?.url ?? "");
  const [note, setNote] = useState(source?.note ?? "");
  const [invalid, setInvalid] = useState(false);
  const titleOk = !!title.trim();
  const urlOk = !url.trim() || URL_PATTERN.test(url.trim());
  return (
    <SheetDialog
      title={
        source
          ? t("mind.editSource")
          : linkTo
            ? t("mind.newEvidenceFor", { title: linkTo.title })
            : t("mind.newSource")
      }
      onClose={onClose}
      className="mind-form"
    >
      <form
        noValidate
        data-testid="mind-source-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!titleOk || !urlOk) {
            setInvalid(true);
            return;
          }
          onSubmit({
            title: title.trim(),
            url: url.trim() || null,
            note,
          });
        }}
      >
        <div className="field">
          <Label htmlFor={`${id}-title`}>{t("mind.form.sourceTitle")}</Label>
          <Input
            id={`${id}-title`}
            data-testid="mind-source-title"
            value={title}
            maxLength={300}
            required
            aria-invalid={invalid && !titleOk}
            aria-describedby={
              invalid && !titleOk ? `${id}-title-error` : undefined
            }
            onChange={(event) => setTitle(event.target.value)}
          />
          {invalid && !titleOk && (
            <p id={`${id}-title-error`} className="field-error" role="alert">
              {t("mind.form.required")}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor={`${id}-url`}>{t("mind.form.url")}</Label>
          <Input
            id={`${id}-url`}
            data-testid="mind-source-url"
            type="url"
            inputMode="url"
            maxLength={2000}
            value={url}
            aria-invalid={invalid && !urlOk}
            aria-describedby={`${id}-url-hint`}
            onChange={(event) => setUrl(event.target.value)}
          />
          <p id={`${id}-url-hint`} className="field-hint">
            {t("mind.form.urlHint")}
          </p>
          {invalid && !urlOk && (
            <p className="field-error" role="alert">
              {t("mind.form.urlError")}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor={`${id}-note`}>{t("mind.form.sourceNote")}</Label>
          <textarea
            id={`${id}-note`}
            className="input"
            data-testid="mind-source-note"
            rows={4}
            maxLength={4000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div className="action-row">
          <Button
            type="submit"
            className="button-primary"
            data-testid="mind-source-save"
            disabled={busy}
          >
            {t(source ? "crm.form.save" : "crm.form.create")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}

function TaskForm({
  node,
  project,
  timeZone,
  busy,
  onClose,
  onSubmit,
  t,
}: {
  node: MindNode;
  project: Project | undefined;
  timeZone: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (body: {
    title: string;
    projectId: string | null;
    dueDate: string;
  }) => void;
  t: Translate;
}) {
  const { workspace } = useWorkspace();
  const projects = useProjects(workspace.id);
  const id = useId();
  const [title, setTitle] = useState(
    t("mind.validateTitle", { title: node.title }).slice(0, 200),
  );
  const [projectId, setProjectId] = useState(
    project && !project.archived ? project.id : "",
  );
  const [dueDate, setDueDate] = useState(() =>
    civilDateAfter(VALIDATION_DAYS, timeZone),
  );
  const [invalid, setInvalid] = useState(false);
  const titleOk = !!title.trim();
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(dueDate);
  return (
    <SheetDialog
      title={t("mind.makeTask")}
      onClose={onClose}
      className="mind-form"
    >
      <form
        noValidate
        data-testid="mind-task-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!titleOk || !dateOk) {
            setInvalid(true);
            return;
          }
          onSubmit({
            title: title.trim(),
            projectId: projectId || null,
            dueDate,
          });
        }}
      >
        <p className="mind-hint">{t("mind.taskFormHint")}</p>
        <div className="field">
          <Label htmlFor={`${id}-title`}>{t("mind.form.taskTitle")}</Label>
          <Input
            id={`${id}-title`}
            data-testid="mind-task-title"
            value={title}
            maxLength={200}
            required
            aria-invalid={invalid && !titleOk}
            onChange={(event) => setTitle(event.target.value)}
          />
          {invalid && !titleOk && (
            <p className="field-error" role="alert">
              {t("mind.form.required")}
            </p>
          )}
        </div>
        <div className="field">
          <Label htmlFor={`${id}-project`}>{t("mind.addTo")}</Label>
          <select
            id={`${id}-project`}
            data-testid="mind-task-project"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">{t("mind.noProject")}</option>
            {(projects.data ?? [])
              .filter((item) => !item.archived || item.id === projectId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </div>
        <div className="field">
          <Label htmlFor={`${id}-due`}>{t("mind.form.due")}</Label>
          <Input
            id={`${id}-due`}
            data-testid="mind-task-due"
            type="date"
            required
            value={dueDate}
            aria-invalid={invalid && !dateOk}
            aria-describedby={`${id}-due-hint`}
            onChange={(event) => setDueDate(event.target.value)}
          />
          <p id={`${id}-due-hint`} className="field-hint">
            {t("mind.form.dueHint")}
          </p>
        </div>
        <div className="action-row">
          <Button
            type="submit"
            className="button-primary"
            data-testid="mind-task-save"
            disabled={busy}
          >
            {t("mind.makeTask")}
          </Button>
        </div>
      </form>
    </SheetDialog>
  );
}
