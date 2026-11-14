import type { GraphNodeKind, RelationGraph } from "./graph";
import {
  buildMindLayout,
  buildRelationsLayout,
  type GraphImageInput,
  type MindImageLabels,
  type RelationsImageOptions,
} from "./graph-image";
import { compareGraphEdges } from "./graph-layout";
import type { MindMap } from "./mind";

export const graphFixtureId = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const workspaceId = graphFixtureId(9000);
export const relationsOptions: RelationsImageOptions = {
  layout: "layered",
  scope: "workspace",
  projectId: null,
  layers: ["people", "dependencies", "org", "crm"],
  forceSeed: 7,
};
export function relationsFixture(count = 12): RelationGraph {
  const kinds: GraphNodeKind[] = [
    "workspace",
    "project",
    "company",
    "contact",
    "person",
    "agent",
  ];
  const nodes: RelationGraph["nodes"] = Array.from(
    { length: count },
    (_, index) => {
      const kind = kinds[index] ?? "task";
      return {
        key: `${kind}:${graphFixtureId(index)}`,
        kind,
        id: graphFixtureId(index),
        label: `Node ${index + 1}`,
        ...(kind === "task"
          ? {
              ref: `NW-${index}`,
              projectId: graphFixtureId(1),
              parentId: index === 7 ? graphFixtureId(6) : null,
              status: "in_progress" as const,
            }
          : {}),
      };
    },
  );
  const edges: RelationGraph["edges"] = [];
  const add = (
    from: number,
    to: number,
    layer: RelationGraph["layers"][number],
    kind: RelationGraph["edges"][number]["kind"],
  ) => {
    if (nodes[from] && nodes[to])
      edges.push({
        key: `${from}:${to}:${kind}`,
        from: nodes[from].key,
        to: nodes[to].key,
        layer,
        kind,
      });
  };
  add(0, 1, "org", "contains");
  add(2, 1, "crm", "client_of");
  add(3, 2, "crm", "contact_of");
  add(3, 6, "crm", "stakeholder_of");
  add(4, 6, "people", "owns");
  add(5, 7, "people", "works_on");
  for (let i = 6; i < count; i++) {
    add(i === 7 ? 6 : 1, i, "org", "contains");
    if (i > 7) add(i, i - 1, "dependencies", "depends_on");
  }
  return {
    workspaceId,
    projectId: null,
    layers: relationsOptions.layers,
    crmVisible: true,
    nodes,
    // Core relationGraph's order, which the web lays out as given.
    edges: edges.sort(compareGraphEdges),
  };
}
export function mindFixture(count = 10): MindMap {
  const now = "2026-03-08T12:00:00.000Z";
  const nodes = Array.from({ length: count }, (_, index) => ({
    id: graphFixtureId(index),
    workspaceId,
    title: `Idea ${index + 1}`,
    layer: index % (count > 20 ? 10 : 4),
    angle: (index * 137.5) % 360,
    strength: (index % 5) + 1,
    momentum: (index % 5) - 2,
    note: "Private notes are not exported",
    taskId: null,
    archivedAt: null,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));
  return {
    workspaceId,
    nodes,
    edges: nodes.slice(1).map((node, index) => ({
      id: graphFixtureId(2000 + index),
      workspaceId,
      fromNodeId: nodes[index].id,
      toNodeId: node.id,
      kind: (["relates", "supports", "contradicts"] as const)[index % 3],
      version: 1,
      createdAt: now,
    })),
    sources: [],
    nodeSources: [],
    canWrite: false,
    canArchive: false,
  };
}
export function graphFixtureLabels(
  locale: "en" | "zh-CN" | "zh-HK",
  kind: "mind" | "relations",
): MindImageLabels {
  const copy = {
    en: [
      "Mind map",
      "Relations",
      "Exported by Alice",
      "No nodes",
      "more",
      "Focus",
      "Layer",
    ],
    "zh-CN": [
      "思维图",
      "关系图",
      "由艾丽丝导出",
      "暂无节点",
      "项",
      "核心",
      "层",
    ],
    "zh-HK": [
      "思維圖",
      "關係圖",
      "由艾麗絲匯出",
      "暫無節點",
      "項",
      "核心",
      "層",
    ],
  }[locale];
  return {
    title: copy[kind === "mind" ? 0 : 1],
    subtitle: copy[2],
    footer: `${copy[2]} · 2026-03-08 12:00 · Asia/Shanghai`,
    empty: copy[3],
    more: (n) =>
      locale === "en"
        ? `+${n} more nodes`
        : `+${n} ${locale === "zh-CN" ? "个节点" : "個節點"}`,
    moreEdges: (n) =>
      locale === "en"
        ? `+${n} more edges`
        : `+${n} ${locale === "zh-CN" ? "条连线" : "條連線"}`,
    centre: copy[5],
    ring: (n) => `${copy[6]} ${n + 1}`,
  };
}
export function graphImageFixture(
  kind: "mind" | "relations",
  locale: "en" | "zh-CN" | "zh-HK",
  count = 12,
  dense = false,
): GraphImageInput {
  const labels = graphFixtureLabels(locale, kind);
  const contentHash = "b".repeat(64);
  const prefix =
    locale === "en" ? "Delivery" : locale === "zh-CN" ? "项目交付" : "項目交付";
  const graph = relationsFixture(count),
    map = mindFixture(count);
  if (dense) {
    for (let index = 0; index < 1000; index++) {
      const from = 6 + Math.floor(index / (count - 7));
      const offset = index % (count - 7);
      const to = 6 + (offset >= from - 6 ? offset + 1 : offset);
      graph.edges.push({
        key: `dense:${index}`,
        from: graph.nodes[from].key,
        to: graph.nodes[to].key,
        kind: "depends_on",
        layer: "dependencies",
      });
      map.edges.push({
        ...map.edges[0],
        id: graphFixtureId(4000 + index),
        fromNodeId: map.nodes[from].id,
        toNodeId: map.nodes[to].id,
      });
    }
  }
  graph.nodes.forEach((node, index) => {
    node.label = `${prefix} ${index + 1} · 侍饕餮鑫${count > 150 || dense ? "长期合作伙伴".repeat(30) : ""}`;
  });
  map.nodes.forEach((node, index) => {
    node.title = `${prefix} ${index + 1} · 侍饕餮鑫${count > 150 || dense ? "長期合作伙伴".repeat(30) : ""}`;
  });
  return {
    layout:
      kind === "mind"
        ? buildMindLayout(
            map,
            { archived: "exclude" },
            locale,
            labels,
            contentHash,
          )
        : buildRelationsLayout(
            graph,
            relationsOptions,
            locale,
            labels,
            contentHash,
          ),
    watermark: { text: `${labels.subtitle} · Taff · 2026-03-08`, contentHash },
    contentHash,
  };
}
