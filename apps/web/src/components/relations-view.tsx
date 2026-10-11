"use client";
import "../styles/relations.css";

import type { GraphNode, WorkspaceGraph } from "@taff/schemas/graph";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { useWorkspaceGraph } from "../lib/graph-queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const PAGE_SIZE = 8;
function nodeHref(node: GraphNode) {
  return node.kind === "task"
    ? `/tasks/${node.id}`
    : node.kind === "project"
      ? `/projects/${node.id}`
      : node.kind === "agent"
        ? `/agents/${node.id}`
        : "/orgs#team";
}

export function RelationsView() {
  const { workspace } = useWorkspace();
  return <WorkspaceRelations key={workspace.id} workspaceId={workspace.id} />;
}

function WorkspaceRelations({ workspaceId }: { workspaceId: string }) {
  const { t, i18n } = useTranslation();
  const { me } = useWorkspace();
  const query = useWorkspaceGraph(workspaceId);
  const graph = query.data;
  return (
    <section className="relations-view">
      <Link href="/me" className="relations-back" prefetch={false}>
        <ArrowLeft size={18} aria-hidden="true" /> {t("me.title")}
      </Link>
      <h1>{t("relations.title")}</h1>
      <p className="section-hint">{t("relations.description")}</p>
      <div className="relations-status" role="status" aria-live="polite">
        {query.isPending
          ? t("loading")
          : query.isError
            ? t(errorKey(query.error))
            : graph && t(`relations.state.${graph.status}`)}
        {!query.isError && graph?.status === "ready" && graph.syncedAt && (
          <span>
            {t("relations.synced", {
              time: new Intl.DateTimeFormat(i18n.resolvedLanguage, {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: me.user.tz,
              }).format(new Date(graph.syncedAt)),
            })}
          </span>
        )}
        {graph?.status === "too_large" && (
          <span>{t("relations.limit", { count: graph.nodeLimit })}</span>
        )}
      </div>
      <Button onClick={() => void query.refetch()} disabled={query.isFetching}>
        {t(query.isFetching ? "relations.refreshing" : "relations.refresh")}
      </Button>
      {!query.isError && graph?.status === "ready" && (
        <GraphExplorer graph={graph} />
      )}
    </section>
  );
}

function GraphExplorer({ graph }: { graph: WorkspaceGraph }) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState("");
  const [focusId, setFocusId] = useState("");
  const [page, setPage] = useState(0);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const focus =
    nodes.get(focusId) ??
    nodes.get(graph.edges[0]?.source ?? "") ??
    graph.nodes[0];
  const matches = graph.nodes.filter((node) =>
    node.label
      .toLocaleLowerCase(i18n.resolvedLanguage)
      .includes(search.toLocaleLowerCase(i18n.resolvedLanguage)),
  );
  const edges = graph.edges.filter(
    (edge) => edge.source === focus?.id || edge.target === focus?.id,
  );
  const pages = Math.max(1, Math.ceil(edges.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const shown = edges.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const height = Math.max(180, shown.length * 88 + 32);
  const format = new Intl.NumberFormat(i18n.resolvedLanguage);
  const choose = (id: string) => {
    setFocusId(id);
    setPage(0);
  };
  if (!focus) return <p>{t("relations.empty")}</p>;
  return (
    <div className="relations-explorer">
      <p>
        {t("relations.summary", {
          nodes: format.format(graph.nodes.length),
          edges: format.format(graph.edges.length),
        })}
      </p>
      <div className="relations-controls">
        <div className="field">
          <Label htmlFor="graph-search">{t("relations.search")}</Label>
          <Input
            id="graph-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="field">
          <Label htmlFor="graph-focus">{t("relations.select")}</Label>
          <select
            id="graph-focus"
            value={matches.some((node) => node.id === focus.id) ? focus.id : ""}
            onChange={(event) => choose(event.target.value)}
          >
            <option value="" disabled>
              {t(matches.length ? "relations.select" : "relations.noMatches")}
            </option>
            {matches.map((node) => (
              <option key={node.id} value={node.id}>
                {t(`relations.kind.${node.kind}`)} · {node.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <h2 className="relations-focus">
        <span>{t(`relations.kind.${focus.kind}`)}</span>
        <Link href={nodeHref(focus)} prefetch={false}>
          {focus.label}
        </Link>
      </h2>
      {focus.status && <p>{t(`status.${focus.status}`)}</p>}
      <p className="section-hint">{t("relations.hint")}</p>
      <div className="relations-legend" aria-label={t("relations.legend")}>
        {(["project", "task", "person", "agent"] as const).map((kind) => (
          <span key={kind} className={`relations-kind relations-${kind}`}>
            {t(`relations.kind.${kind}`)}
          </span>
        ))}
      </div>
      {shown.length > 0 ? (
        <>
          <div
            className="relations-viewport"
            role="region"
            tabIndex={0}
            aria-label={t("relations.diagram")}
          >
            <svg
              width="680"
              height={height}
              viewBox={`0 0 680 ${height}`}
              aria-hidden="true"
              className="relations-svg"
            >
              <defs>
                <marker
                  id="graph-arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {shown.map((edge, index) => {
                const neighbor = nodes.get(
                  edge.source === focus.id ? edge.target : edge.source,
                );
                if (!neighbor) return null;
                const y = index * 88 + 60;
                return (
                  <g key={`${edge.source}:${edge.target}:${edge.kind}`}>
                    <path
                      className="relations-edge"
                      d={`M 214 ${height / 2} C 290 ${height / 2}, 290 ${y}, 460 ${y}`}
                      markerEnd={
                        edge.source === focus.id
                          ? "url(#graph-arrow)"
                          : undefined
                      }
                      markerStart={
                        edge.target === focus.id
                          ? "url(#graph-arrow)"
                          : undefined
                      }
                    />
                    <text
                      className="relations-edge-label"
                      x="355"
                      y={y - 10}
                      textAnchor="middle"
                    >
                      {t(`relations.edge.${edge.kind}`)}
                    </text>
                    <GraphBox node={neighbor} x={460} y={y - 28} />
                  </g>
                );
              })}
              <GraphBox node={focus} x={14} y={height / 2 - 28} />
            </svg>
          </div>
          <h3>{t("relations.list")}</h3>
          <ul className="relations-list">
            {shown.map((edge) => {
              const source = nodes.get(edge.source);
              const target = nodes.get(edge.target);
              if (!source || !target) return null;
              const neighbor = source.id === focus.id ? target : source;
              return (
                <li key={`${edge.source}:${edge.target}:${edge.kind}`}>
                  <div>
                    <Link href={nodeHref(source)} prefetch={false}>
                      {source.label}
                    </Link>
                    <span className="relations-edge-copy">
                      {t(`relations.edge.${edge.kind}`)} →
                    </span>
                    <Link href={nodeHref(target)} prefetch={false}>
                      {target.label}
                    </Link>
                  </div>
                  <Button
                    onClick={() => choose(neighbor.id)}
                    aria-label={t("relations.focusNode", {
                      name: neighbor.label,
                    })}
                  >
                    {t("relations.focus")}
                  </Button>
                </li>
              );
            })}
          </ul>
          <div className="relations-pagination">
            <Button
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              {t("relations.previous")}
            </Button>
            <span role="status">
              {t("relations.page", {
                page: format.format(currentPage + 1),
                total: format.format(pages),
              })}
            </span>
            <Button
              disabled={currentPage + 1 >= pages}
              onClick={() => setPage(currentPage + 1)}
            >
              {t("relations.next")}
            </Button>
          </div>
        </>
      ) : (
        <p>{t("relations.isolated")}</p>
      )}
    </div>
  );
}

function GraphBox({ node, x, y }: { node: GraphNode; x: number; y: number }) {
  const { t } = useTranslation();
  const label = Array.from(node.label);
  return (
    <g className={`relations-node relations-${node.kind}`}>
      <rect x={x} y={y} width="200" height="56" rx="8" />
      <text x={x + 12} y={y + 19} className="relations-node-kind">
        {t(`relations.kind.${node.kind}`)}
      </text>
      <text x={x + 12} y={y + 41}>
        {label.length > 12 ? `${label.slice(0, 11).join("")}…` : node.label}
      </text>
    </g>
  );
}
