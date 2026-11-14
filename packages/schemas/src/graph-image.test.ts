import { describe, expect, it } from "vitest";
import {
  buildMindLayout,
  buildRelationsLayout,
  fitGraphExport,
  graphImageInputSchema,
  graphLabelBounds,
  relationsImageOptionsSchema,
} from "./graph-image";
import {
  graphFixtureLabels,
  graphImageFixture,
  mindFixture,
  relationsFixture,
  relationsOptions,
} from "./graph-image.fixture";
import {
  compareGraphEdges,
  forceLayout,
  layeredLayout,
  nodeOrder,
  relationEdgePath,
  visibleGraph,
} from "./graph-layout";
import {
  edgeGeometry,
  labelPlacement,
  nodePoint,
  readingOrder,
} from "./mind-geometry";

const hash = "b".repeat(64);
const labels = graphFixtureLabels("en", "relations");

describe("graph export display contract", () => {
  for (const kind of ["mind", "relations"] as const)
    for (const locale of ["en", "zh-CN", "zh-HK"] as const)
      it(`${kind}/${locale} localizes labels and fits all labels within delivery bounds`, () => {
        const input = graphImageFixture(kind, locale, 151);
        expect(graphImageInputSchema.parse(input)).toEqual(input);
        const l = input.layout;
        expect(l.nodes).toHaveLength(150);
        expect(l.more).toBe(graphFixtureLabels(locale, kind).more(1));
        expect(l.width).toBe(1080);
        expect(l.height).toBeLessThanOrEqual(4000);
        for (const n of l.nodes) {
          const bounds = graphLabelBounds(n.label);
          expect(bounds.left * l.view.scale + l.view.x).toBeGreaterThanOrEqual(
            48,
          );
          expect(bounds.right * l.view.scale + l.view.x).toBeLessThanOrEqual(
            1032,
          );
          expect(bounds.top * l.view.scale + l.view.y).toBeGreaterThanOrEqual(
            144,
          );
          expect(bounds.bottom * l.view.scale + l.view.y).toBeLessThanOrEqual(
            l.height - 96,
          );
        }
        for (const e of l.edges) {
          expect(l.nodes[e.from]).toBeDefined();
          expect(l.nodes[e.to]).toBeDefined();
        }
      });

  it("handles empty maps and excludes private notes, sources and CRM details", () => {
    for (const kind of ["mind", "relations"] as const) {
      const empty = graphImageFixture(kind, "zh-HK", 0);
      expect(empty.layout.nodes).toEqual([]);
      expect(empty.layout.edges).toEqual([]);
      expect(empty.layout.empty).toBe("暫無節點");
      expect(empty.layout.more).toBeNull();
      expect(JSON.stringify(graphImageFixture(kind, "en"))).not.toContain(
        "Private notes",
      );
    }
    const graph = relationsFixture();
    graph.nodes[2].detail = "private industry";
    expect(
      JSON.stringify(
        buildRelationsLayout(graph, relationsOptions, "en", labels, hash),
      ),
    ).not.toContain("private industry");
  });

  it("fits extreme geometry without the screen's minimum zoom clamp", () => {
    const nodes = graphImageFixture("relations", "en").layout.nodes.slice(0, 2);
    nodes[1] = {
      ...nodes[1],
      x: 50000,
      label: { ...nodes[1].label, x: 50012 },
    };
    expect(fitGraphExport(nodes, null).view.scale).toBeLessThan(0.25);
  });

  it("rejects unbounded or injected display data before rendering", () => {
    const input = graphImageFixture("relations", "en");
    for (const value of [
      { ...input, svg: "<svg/>" },
      { ...input, layout: { ...input.layout, height: 4001 } },
      { ...input, layout: { ...input.layout, width: 1081 } },
      { ...input, layout: { ...input.layout, title: "x".repeat(201) } },
      {
        ...input,
        layout: {
          ...input.layout,
          view: { ...input.layout.view, scale: Infinity },
        },
      },
      {
        ...input,
        layout: {
          ...input.layout,
          nodes: Array(151).fill(input.layout.nodes[0]),
        },
      },
      {
        ...input,
        layout: {
          ...input.layout,
          edges: Array(601).fill(input.layout.edges[0]),
        },
      },
    ])
      expect(graphImageInputSchema.safeParse(value).success).toBe(false);
  });
});

describe("shared web geometry", () => {
  for (const layout of ["layered", "force"] as const)
    it(`preserves every ${layout} web position when only rendered edges are capped`, () => {
      const source = relationsFixture(52);
      for (let from = 6; from < source.nodes.length; from++)
        for (let to = from + 1; to < source.nodes.length; to++)
          source.edges.push({
            key: `depends_on:${source.nodes[from].key}:${source.nodes[to].key}`,
            from: source.nodes[from].key,
            to: source.nodes[to].key,
            kind: "depends_on",
            layer: "dependencies",
          });
      // The web lays out core's canonical order (layer, kind, from, to), not
      // key order; force springs are summed in edge order.
      source.edges.sort(compareGraphEdges);
      const options = { ...relationsOptions, layout, forceSeed: 7 };
      const visible = visibleGraph(source, options.layers);
      expect(visible.edges.length).toBeGreaterThan(600);
      const positions =
        layout === "layered"
          ? layeredLayout(visible.nodes, visible.edges)
          : forceLayout(visible.nodes, visible.edges, options.forceSeed);
      const actual = buildRelationsLayout(source, options, "en", labels, hash);
      expect(actual.nodes).toHaveLength(52);
      expect(actual.edges).toHaveLength(600);
      expect(actual.more).toBeNull();
      expect(actual.moreEdges).toBe(
        labels.moreEdges(visible.edges.length - 600),
      );
      for (const node of actual.nodes)
        expect({ x: node.x, y: node.y }).toEqual(positions[node.key]);
    });

  for (const layout of ["layered", "force"] as const)
    it(`preserves exact uncapped ${layout} web positions and seed`, () => {
      const source = relationsFixture(150);
      const original = structuredClone(source);
      const options = { ...relationsOptions, layout };
      const visible = visibleGraph(source, options.layers);
      const positions =
        layout === "layered"
          ? layeredLayout(visible.nodes, visible.edges)
          : forceLayout(visible.nodes, visible.edges, options.forceSeed);
      const actual = buildRelationsLayout(source, options, "en", labels, hash);
      for (const n of actual.nodes)
        expect({ x: n.x, y: n.y }).toEqual(positions[n.key]);
      expect(
        buildRelationsLayout(
          {
            ...source,
            nodes: [...source.nodes].reverse(),
            edges: [...source.edges].reverse(),
          },
          options,
          "en",
          labels,
          hash,
        ),
      ).toEqual(actual);
      expect(source).toEqual(original);
      if (layout === "force")
        expect(
          buildRelationsLayout(
            source,
            { ...options, forceSeed: 8 },
            "en",
            labels,
            hash,
          ).nodes,
        ).not.toEqual(actual.nodes);
    });

  for (const layout of ["layered", "force"] as const)
    it(`bounds ${layout} work by laying out the retained subgraph when truncated`, () => {
      const source = relationsFixture(1001);
      const options = { ...relationsOptions, layout };
      const visible = visibleGraph(source, options.layers);
      const retained = nodeOrder(visible.nodes).slice(0, 150);
      const keys = new Set(retained.map((node) => node.key));
      const edges = visible.edges.filter(
        (edge) => keys.has(edge.from) && keys.has(edge.to),
      );
      const positions =
        layout === "layered"
          ? layeredLayout(retained, edges)
          : forceLayout(retained, edges, options.forceSeed);
      const actual = buildRelationsLayout(source, options, "en", labels, hash);
      for (const node of actual.nodes)
        expect({ x: node.x, y: node.y }).toEqual(positions[node.key]);
      expect(actual.more).toBe("+851 more nodes");
      expect(actual.moreEdges).toBe(
        labels.moreEdges(visible.edges.length - edges.length),
      );
    });

  it("deduplicates semantic edges before capping and counts only authorized visible nodes", () => {
    for (const kind of ["mind", "relations"] as const) {
      const input = graphImageFixture(kind, "zh-HK", 150, true);
      expect(input.layout.edges).toHaveLength(600);
      expect(input.layout.moreEdges).toBe(
        kind === "mind" ? "+546 條連線" : "+687 條連線",
      );
    }
    const map = mindFixture();
    map.edges = Array(10001).fill(map.edges[0]);
    const actual = buildMindLayout(
      map,
      { archived: "exclude" },
      "en",
      graphFixtureLabels("en", "mind"),
      hash,
    );
    expect(actual.edges).toHaveLength(1);
    expect(actual.moreEdges).toBeNull();
    const source = relationsFixture(151);
    source.edges.push({ ...source.edges[0], key: "semantic duplicate" });
    const filtered = buildRelationsLayout(
      source,
      { ...relationsOptions, layers: ["dependencies"] },
      "en",
      labels,
      hash,
    );
    expect(filtered.nodes).toHaveLength(147);
    expect(filtered.more).toBeNull();
    expect(filtered.moreEdges).toBeNull();
    const uncapped = relationsFixture();
    const baseline = buildRelationsLayout(
      uncapped,
      relationsOptions,
      "en",
      labels,
      hash,
    );
    uncapped.edges.push({ ...uncapped.edges[0], key: "semantic duplicate" });
    expect(
      buildRelationsLayout(uncapped, relationsOptions, "en", labels, hash),
    ).toEqual(baseline);
    uncapped.edges.reverse();
    expect(
      buildRelationsLayout(uncapped, relationsOptions, "en", labels, hash),
    ).toEqual(baseline);
  });

  it("binds project scope and visible layers explicitly and drops dangling edges", () => {
    const source = relationsFixture();
    source.edges.push({
      ...source.edges[0],
      key: "dangling",
      to: "task:missing",
    });
    const actual = buildRelationsLayout(
      source,
      { ...relationsOptions, layers: ["dependencies"] },
      "en",
      labels,
      hash,
    );
    expect(
      actual.nodes.every((n) => /^(workspace|project|task):/.test(n.key)),
    ).toBe(true);
    expect(actual.edges.every((e) => e.tone === "red")).toBe(true);
    expect(() =>
      buildRelationsLayout(
        source,
        {
          ...relationsOptions,
          scope: "project",
          projectId: source.nodes[1].id,
        },
        "en",
        labels,
        hash,
      ),
    ).toThrow("graph_scope_mismatch");
    expect(
      relationsImageOptionsSchema.safeParse({
        ...relationsOptions,
        forceSeed: -1,
      }).success,
    ).toBe(false);
    expect(
      relationsImageOptionsSchema.safeParse({
        ...relationsOptions,
        layers: ["org", "org"],
      }).success,
    ).toBe(false);
    expect(relationEdgePath({ x: 1, y: 2 }, { x: 9, y: 6 }, "layered")).toBe(
      "M1,2C5,2 5,6 9,6",
    );
    expect(relationEdgePath({ x: 1, y: 2 }, { x: 9, y: 6 }, "force")).toBe(
      "M1,2L9,6",
    );
  });

  it("preserves mind polar positions, labels, curves and rings before the cap", () => {
    const map = mindFixture(151);
    map.nodes[0].archivedAt = "2026-03-09T00:00:00.000Z";
    const original = structuredClone(map);
    const actual = buildMindLayout(
      map,
      { archived: "include" },
      "en",
      graphFixtureLabels("en", "mind"),
      hash,
    );
    const ordered = readingOrder(map.nodes).slice(0, 150);
    for (const [index, node] of actual.nodes.entries()) {
      expect({ x: node.x, y: node.y }).toEqual(nodePoint(ordered[index]));
      expect(node.label).toMatchObject(labelPlacement(ordered[index]));
    }
    for (const edge of actual.edges) {
      const { c1, c2 } = edgeGeometry(ordered[edge.from], ordered[edge.to]);
      expect(edge).toMatchObject({ c1, c2 });
    }
    expect(actual.rings).toHaveLength(10);
    const filtered = buildMindLayout(
      map,
      { archived: "exclude" },
      "en",
      graphFixtureLabels("en", "mind"),
      hash,
    );
    expect(filtered.nodes.some((node) => node.key === map.nodes[0].id)).toBe(
      false,
    );
    expect(filtered.more).toBeNull();
    expect(
      buildMindLayout(
        {
          ...map,
          nodes: [...map.nodes].reverse(),
          edges: [...map.edges].reverse(),
        },
        { archived: "include" },
        "en",
        graphFixtureLabels("en", "mind"),
        hash,
      ),
    ).toEqual(actual);
    expect(map).toEqual(original);
  });

  it("rejects invalid geometry, hierarchies and text", () => {
    const map = mindFixture();
    map.edges = [];
    map.nodes[0].angle = NaN;
    expect(() =>
      buildMindLayout(
        map,
        { archived: "exclude" },
        "en",
        graphFixtureLabels("en", "mind"),
        hash,
      ),
    ).toThrow("invalid_graph_geometry");
    const graph = relationsFixture();
    graph.nodes[6].parentId = graph.nodes[7].id;
    expect(() =>
      buildRelationsLayout(graph, relationsOptions, "en", labels, hash),
    ).toThrow("invalid_graph_hierarchy");
    graph.nodes[0].label = "x".repeat(4001);
    expect(() =>
      buildRelationsLayout(graph, relationsOptions, "en", labels, hash),
    ).toThrow("invalid_graph_text");
  });

  it("orders a deep task tree without recursion and retains full mind extent beyond150 nodes", () => {
    const graph = relationsFixture(12000);
    for (let index = 7; index < graph.nodes.length; index++)
      graph.nodes[index].parentId = graph.nodes[index - 1].id;
    expect(nodeOrder(graph.nodes)).toHaveLength(12000);
    const map = mindFixture(1001);
    const actual = buildMindLayout(
      map,
      { archived: "exclude" },
      "en",
      graphFixtureLabels("en", "mind"),
      hash,
    );
    expect(actual.nodes).toHaveLength(150);
    expect(actual.more).toBe("+851 more nodes");
    expect(actual.rings).toHaveLength(10);
  });
});
