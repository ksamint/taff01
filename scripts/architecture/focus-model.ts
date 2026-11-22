// Builds the data of the function map: modules with their functions, roles,
// requirements, flows and relations, with the code inventory as detail.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  ACTION_RULES,
  FLOWS,
  GROUPS,
  LEVELS,
  RELATIONSHIP_ROLES,
  ROLES,
  SPEC_MODULES,
} from "./focus.ts";
import { type Inventory, repoRoot } from "./inventory.ts";
import { type Assignment, assign } from "./model.ts";

export type RoleId = "admin" | "member" | "guest" | "agent";
export type MapFunction = { action: string; roles: Record<RoleId, boolean> };
export type MapSpec = {
  file: string;
  title: string;
  groups: { id: string; title: string; count: number }[];
};
export type MapModule = {
  id: string;
  title: string;
  summary: string;
  group: string;
  functions: MapFunction[];
  specs: MapSpec[];
  uses: { id: string; count: number }[];
  usedBy: { id: string; count: number }[];
  details: Record<
    "tables" | "routes" | "tools" | "core" | "screens" | "sources",
    string[]
  >;
};
export type FocusModel = {
  groups: typeof GROUPS;
  roles: typeof ROLES;
  relationshipRoles: typeof RELATIONSHIP_ROLES;
  levels: typeof LEVELS;
  flows: typeof FLOWS;
  modules: MapModule[];
  crossSpecs: MapSpec[];
  problems: string[];
};

const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

/** The generated permissions matrix: one row per action of can(). */
export function permissionActions(): MapFunction[] {
  return [
    ...read("docs/spec/permissions-matrix.md").matchAll(
      /^\| ([a-z_]+:[a-z_]+) \| (Yes|No) \| (Yes|No) \| (Yes|No) \| (Yes|No) \|$/gm,
    ),
  ].map(([, action, admin, member, guest, agent]) => ({
    action: action!,
    roles: {
      admin: admin === "Yes",
      member: member === "Yes",
      guest: guest === "Yes",
      agent: agent === "Yes",
    },
  }));
}

/** Requirement groups of every living specification in docs/spec. */
export function specs(): MapSpec[] {
  return readdirSync(path.join(repoRoot, "docs/spec"))
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => {
      const source = read(`docs/spec/${file}`);
      const title = (/^# (?:Spec: )?(.+)$/m.exec(source)?.[1] ?? file).trim();
      const groups = [
        ...source.matchAll(/^### (.+?) \(([A-Z]+-\d+)\)\s*$/gm),
      ].map(([, name, id]) => ({
        id: id!,
        title: name!,
        count: [...source.matchAll(new RegExp(`^- ${id}\\.\\d+`, "gm"))].length,
      }));
      return { file, title, groups };
    });
}

export function focusModel(inventory: Inventory): FocusModel {
  const assignment: Assignment = assign(inventory);
  const problems: string[] = [];
  const ids = new Set(assignment.modules.map((entry) => entry.module.id));
  const groupOf = new Map<string, string>();
  for (const group of GROUPS)
    for (const id of group.modules) {
      if (!ids.has(id))
        problems.push(`group ${group.id} names unknown module ${id}`);
      if (groupOf.has(id)) problems.push(`module ${id} is in two groups`);
      groupOf.set(id, group.id);
    }
  for (const id of ids)
    if (!groupOf.has(id)) problems.push(`module ${id} is in no group`);

  const functions = new Map<string, MapFunction[]>();
  for (const fn of permissionActions()) {
    const owner = ACTION_RULES.find(([rule]) => rule.test(fn.action))?.[1];
    if (!owner) problems.push(`permission action ${fn.action} has no module`);
    else if (!ids.has(owner))
      problems.push(`action rule names unknown module ${owner}`);
    else functions.set(owner, [...(functions.get(owner) ?? []), fn]);
  }

  const allSpecs = specs();
  const bySpec = new Map<string, MapSpec[]>();
  const crossSpecs: MapSpec[] = [];
  for (const spec of allSpecs) {
    const owners = SPEC_MODULES[spec.file];
    if (!owners) problems.push(`spec ${spec.file} has no module mapping`);
    else if (owners.length === 0) crossSpecs.push(spec);
    else
      for (const owner of owners) {
        if (!ids.has(owner))
          problems.push(`spec ${spec.file} names unknown module ${owner}`);
        bySpec.set(owner, [...(bySpec.get(owner) ?? []), spec]);
      }
  }
  for (const file of Object.keys(SPEC_MODULES))
    if (!allSpecs.some((spec) => spec.file === file))
      problems.push(`spec mapping names missing file ${file}`);
  for (const flow of FLOWS)
    for (const step of flow.steps)
      if (!ids.has(step.module))
        problems.push(`flow ${flow.id} names unknown module ${step.module}`);

  // Module A uses module B when a core file of A imports a table B owns.
  const tableOwner = new Map<string, string>();
  for (const entry of assignment.modules)
    for (const table of entry.tables)
      tableOwner.set(table.name, entry.module.id);
  const edges = new Map<string, number>();
  for (const entry of assignment.modules)
    for (const file of entry.core)
      for (const table of file.tables) {
        const owner = tableOwner.get(table);
        if (!owner || owner === entry.module.id) continue;
        const key = `${entry.module.id}>${owner}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
  const related = (id: string, side: 0 | 1) =>
    [...edges]
      .filter(([key]) => key.split(">")[side] === id)
      .map(([key, count]) => ({ id: key.split(">")[1 - side]!, count }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  const modules = GROUPS.flatMap((group) => group.modules)
    .filter((id) => ids.has(id))
    .map((id) => {
      const entry = assignment.modules.find((item) => item.module.id === id)!;
      return {
        id,
        title: entry.module.title,
        summary: entry.module.summary,
        group: groupOf.get(id)!,
        functions: functions.get(id) ?? [],
        specs: bySpec.get(id) ?? [],
        uses: related(id, 0),
        usedBy: related(id, 1),
        details: {
          tables: entry.tables.map((table) => table.name),
          routes: entry.routes.map((route) => `${route.method} ${route.path}`),
          tools: entry.tools.map((tool) => tool.name),
          core: entry.core.map((file) => file.name),
          screens: [
            ...entry.pages.map((page) => page.route),
            ...(entry.module.components ?? []),
          ],
          sources: entry.module.sources ?? [],
        },
      };
    });
  return {
    groups: GROUPS,
    roles: ROLES,
    relationshipRoles: RELATIONSHIP_ROLES,
    levels: LEVELS,
    flows: FLOWS,
    modules,
    crossSpecs,
    problems: [...assignment.unmapped, ...assignment.conflicts, ...problems],
  };
}
