// Turns Taff's ontology and the code inventory into one OMV document:
// O from the standard repository vocabulary plus Taff's tiers, M as a typed
// graph of every concept, role, function, module, flow, requirement and code
// object, V as the eight questions.
import type { Obj, OmvDocument, Rel } from "../omv/omv.ts";
import { OBJECT_TYPES, QUESTIONS, RELATION_TYPES } from "../omv/repo-o.ts";
import { type Inventory, references } from "./inventory.ts";
import { assign } from "./model.ts";
import { DATES } from "./ontology.ts";
import { ontology } from "./ontology-model.ts";

export function omv(inventory: Inventory): {
  doc: OmvDocument;
  problems: string[];
} {
  const { doc: source, problems } = ontology(inventory);
  const root = "product:taff";
  const objects: Obj[] = [
    {
      id: root,
      type: "product",
      title: "Taff",
      summary:
        "People and agents working on the same tasks, with a person approving agent output.",
    },
  ];
  const relations: Rel[] = [];
  const link = (
    from: string,
    type: string,
    to: string,
    extra: Partial<Rel> = {},
  ) => relations.push({ from, to, type, ...extra });

  // Concepts, ranked by tier and then by how many tables need them.
  for (const thing of source.things) {
    objects.push({
      id: `concept:${thing.id}`,
      type: "concept",
      title: thing.title,
      summary: thing.summary,
      attrs: {
        tier: thing.tier,
        kind: thing.missing ? "not modelled" : thing.kind,
        dependents: thing.dependents ?? 0,
        ...(thing.stored.length ? { stored: thing.stored } : {}),
        ...(thing.missing ? { missing: true } : {}),
      },
    });
    if (thing.partOf)
      link(`concept:${thing.id}`, "part_of", `concept:${thing.partOf}`);
    for (const id of thing.modules ?? [])
      link(`concept:${thing.id}`, "kept_by", `module:${id}`);
    for (const id of thing.referredBy ?? [])
      link(`concept:${id}`, "requires", `concept:${thing.id}`);
  }
  link("concept:system", "part_of", root);
  for (const [from, to, label] of DATES)
    link(`concept:${from}`, "dates", `concept:${to}`, { label });

  // Roles: the organization roles, and the roles that come from a relationship.
  for (const role of source.roles)
    objects.push({
      id: `role:${role.id}`,
      type: "role",
      title: role.title,
      summary: role.summary,
      attrs: { scope: "organization" },
    });
  for (const role of source.roles) {
    link(`role:${role.id}`, "held_at", "concept:organization");
    link(
      `role:${role.id}`,
      "held_by",
      role.id === "agent" ? "concept:agent" : "concept:member",
    );
  }
  for (const role of source.rolesAt) {
    if (role.at === "organization") continue;
    const id = `role:${role.title.toLowerCase().replace(/[^a-z]+/g, "_")}`;
    objects.push({
      id,
      type: "role",
      title: role.title,
      summary: role.summary,
      attrs: { scope: "relationship" },
    });
    link(id, "held_at", `concept:${role.at}`);
    link(id, "held_by", `concept:${role.heldBy}`);
  }

  // Modules with their functions, specifications and requirements.
  const conceptsOf = new Map<string, string[]>();
  for (const thing of source.things)
    for (const id of thing.modules ?? [])
      conceptsOf.set(id, [
        ...(conceptsOf.get(id) ?? []),
        `concept:${thing.id}`,
      ]);
  const specs = new Map<string, (typeof source.crossSpecs)[number]>();
  for (const module of source.modules) {
    const id = `module:${module.id}`;
    objects.push({
      id,
      type: "module",
      title: module.title,
      summary: module.summary,
      attrs: {
        lane:
          source.groups.find((group) => group.id === module.group)?.title ?? "",
      },
    });
    link(id, "part_of", root);
    const holders = [id, root, ...(conceptsOf.get(module.id) ?? [])];
    for (const fn of module.functions) {
      const fid = `function:${fn.action}`;
      objects.push({
        id: fid,
        type: "function",
        title: fn.action.replace(":", " · ").replace(/_/g, " "),
        attrs: { action: fn.action },
      });
      link(fid, "belongs_to", id);
      for (const holder of holders) link(holder, "has_function", fid);
      for (const role of source.roles)
        if (fn.roles[role.id]) link(`role:${role.id}`, "may_do", fid);
    }
    for (const use of module.uses)
      link(id, "depends_on", `module:${use.id}`, { weight: use.count });
    for (const spec of module.specs) {
      specs.set(spec.file, spec);
      link(id, "specified_by", `spec:${spec.file}`);
      for (const group of spec.groups)
        for (const holder of [id, ...(conceptsOf.get(module.id) ?? [])])
          link(holder, "must_satisfy", `requirement:${group.id}`);
    }
  }
  for (const spec of source.crossSpecs) {
    specs.set(spec.file, spec);
    link(root, "specified_by", `spec:${spec.file}`);
    for (const group of spec.groups)
      link(root, "must_satisfy", `requirement:${group.id}`);
  }
  for (const spec of specs.values()) {
    objects.push({
      id: `spec:${spec.file}`,
      type: "spec",
      title: spec.title,
      attrs: { file: `docs/spec/${spec.file}` },
    });
    for (const group of spec.groups) {
      objects.push({
        id: `requirement:${group.id}`,
        type: "requirement",
        title: `${group.id} ${group.title}`,
        attrs: { statements: group.count },
      });
      link(`requirement:${group.id}`, "stated_in", `spec:${spec.file}`);
    }
  }

  // Flows and their steps.
  for (const flow of source.flows) {
    objects.push({ id: `flow:${flow.id}`, type: "flow", title: flow.title });
    link(root, "in_flow", `flow:${flow.id}`);
    const touched = new Set<string>();
    flow.steps.forEach((step, index) => {
      const id = `step:${flow.id}:${index + 1}`;
      objects.push({
        id,
        type: "step",
        title: step.title,
        summary: step.text,
        attrs: { order: index + 1 },
      });
      link(id, "step_of", `flow:${flow.id}`);
      link(id, "happens_in", `module:${step.module}`);
      touched.add(step.module);
    });
    for (const module of touched)
      for (const holder of [
        `module:${module}`,
        ...(conceptsOf.get(module) ?? []),
      ])
        link(holder, "in_flow", `flow:${flow.id}`);
  }

  // Code and data, each owned by one module.
  for (const entry of assign(inventory).modules) {
    const owner = `module:${entry.module.id}`;
    const own = (
      id: string,
      type: string,
      title: string,
      attrs?: Obj["attrs"],
    ) => {
      objects.push({ id, type, title, ...(attrs ? { attrs } : {}) });
      link(id, "belongs_to", owner);
    };
    for (const table of entry.tables)
      own(`table:${table.name}`, "table", table.name);
    for (const route of entry.routes)
      own(
        `route:${route.method} ${route.path}`,
        "route",
        `${route.method} ${route.path}`,
        { file: route.file },
      );
    for (const tool of entry.tools)
      own(`tool:${tool.name}`, "tool", tool.name, { title: tool.title });
    for (const file of entry.core)
      own(`file:${file.file}`, "file", file.name, { path: file.file });
    for (const file of entry.module.sources ?? [])
      own(`file:${file}`, "file", file.split("/").pop() ?? file, {
        path: file,
      });
    for (const page of entry.pages)
      own(`screen:${page.route}`, "screen", page.route, { file: page.file });
    for (const name of entry.module.components ?? [])
      own(`screen:${name}`, "screen", name, {
        file: `apps/web/src/components/${name}`,
      });
  }
  for (const entry of assign(inventory).modules)
    for (const file of entry.core)
      for (const table of file.tables)
        link(`file:${file.file}`, "uses", `table:${table}`);
  for (const { from, to } of references())
    link(`table:${from}`, "refers_to", `table:${to}`);
  const tables = new Set(inventory.tables.map((table) => table.name));
  for (const thing of source.things)
    for (const stored of thing.stored)
      if (tables.has(stored))
        link(`concept:${thing.id}`, "stored_in", `table:${stored}`);

  // One relation per (from, type, to).
  const unique = [
    ...new Map(
      relations.map((r) => [`${r.from}|${r.type}|${r.to}`, r]),
    ).values(),
  ];
  return {
    doc: {
      name: "Taff",
      source: "taff01",
      root,
      o: {
        objectTypes: OBJECT_TYPES,
        relationTypes: RELATION_TYPES,
        tiers: source.tiers,
        rules: [
          "Every object in M has a type in O, and every relation joins only the types O allows.",
          "A concept's tier is a judgement about purpose; inside a tier the order is the number of tables that cannot exist without it.",
          "Every table belongs to exactly one concept and one module.",
          "Every route, tool, core file, page, permission function and specification belongs to one module.",
          "A relation marked derived is computed from others and is never edited by hand.",
          "A view reads M and never changes it.",
        ],
      },
      m: { objects, relations: unique },
      v: {
        questions: QUESTIONS,
        viewers: source.roles.map((role) => `role:${role.id}`),
      },
    },
    problems,
  };
}
