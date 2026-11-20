// Joins Taff's ontology with what the code declares, into one intermediate
// document: dependents and referrers from the schema, owning modules from the
// module map, functions and roles from the permissions matrix.

import { focusModel } from "./focus-model.ts";
import { type Inventory, references } from "./inventory.ts";
import { assign } from "./model.ts";
import { PERSPECTIVES, ROLES_AT, THINGS, TIERS } from "./ontology.ts";
import type { Ontology } from "./ontology-types.ts";

export function ontology(inventory: Inventory): {
  doc: Ontology;
  problems: string[];
} {
  const focus = focusModel(inventory);
  const problems = [...focus.problems];
  const known = new Set(inventory.tables.map((table) => table.name));
  const thingOf = new Map<string, string>();
  for (const item of THINGS)
    for (const stored of item.stored) {
      if (stored.includes(".")) {
        if (!known.has(stored.split(".")[0]!))
          problems.push(`thing ${item.id} names unknown table in ${stored}`);
        continue;
      }
      if (!known.has(stored))
        problems.push(`thing ${item.id} names unknown table ${stored}`);
      if (thingOf.has(stored))
        problems.push(
          `table ${stored} belongs to ${thingOf.get(stored)} and ${item.id}`,
        );
      thingOf.set(stored, item.id);
    }
  for (const table of known)
    if (!thingOf.has(table))
      problems.push(`table ${table} belongs to no thing`);

  const moduleOf = new Map<string, string>();
  for (const entry of assign(inventory).modules)
    for (const table of entry.tables) moduleOf.set(table.name, entry.module.id);
  const referrers = new Map<string, Set<string>>();
  const tables = new Map<string, Set<string>>();
  for (const { from, to } of references()) {
    const source = thingOf.get(from);
    const target = thingOf.get(to);
    if (!source || !target || source === target) continue;
    referrers.set(target, (referrers.get(target) ?? new Set()).add(source));
    tables.set(target, (tables.get(target) ?? new Set()).add(from));
  }
  const things = THINGS.map((item) => ({
    ...item,
    dependents: tables.get(item.id)?.size ?? 0,
    referredBy: [...(referrers.get(item.id) ?? [])].sort(),
    modules: [
      ...new Set(
        item.stored.flatMap((stored) => {
          const owner = moduleOf.get(stored.split(".")[0]!);
          return owner ? [owner] : [];
        }),
      ),
    ],
  }));
  return {
    doc: {
      name: "Taff",
      source: "taff01",
      tiers: TIERS,
      things,
      rolesAt: ROLES_AT,
      roles: focus.roles,
      groups: focus.groups,
      modules: focus.modules,
      crossSpecs: focus.crossSpecs,
      flows: focus.flows,
      perspectives: PERSPECTIVES,
    },
    problems,
  };
}
