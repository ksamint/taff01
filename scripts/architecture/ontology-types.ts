// The intermediate shape of the ontology before it becomes an OMV graph.

export type ThingKind =
  | "kind" // exists on its own: a user, a task
  | "role" // what a thing is in relation to another: a member, a stakeholder
  | "relator" // a relation with its own record: a token, a dependency
  | "event" // something that happened: a run, a payment
  | "attribute" // a quality of another thing: a due date, a label
  | "rule" // decides what may happen: a role, a capability
  | "output" // produced from other things: a digest, a summary
  | "view"; // recomputed on read; not a thing

export type Tier = { id: number; title: string; summary: string };
export type Thing = {
  id: string;
  title: string;
  tier: number;
  kind: ThingKind;
  summary: string;
  /** Where it is stored: table names, or a column for an attribute. */
  stored: string[];
  /** The thing that contains it (the structure perspective). */
  partOf?: string;
  /** Asked about, but not in the data. */
  missing?: boolean;
  /** Derived: how many other stored things cannot exist without it. */
  dependents?: number;
  /** Derived: the things whose records point at this one. */
  referredBy?: string[];
  /** Derived: the modules that own its storage. */
  modules?: string[];
};
export type RoleAt = {
  at: string;
  title: string;
  heldBy: string;
  summary: string;
};
export type RoleId = string;
export type Fn = { action: string; roles: Record<RoleId, boolean> };
export type Spec = {
  file: string;
  title: string;
  groups: { id: string; title: string; count: number }[];
};
export type Module = {
  id: string;
  title: string;
  summary: string;
  group: string;
  functions: Fn[];
  specs: Spec[];
  uses: { id: string; count: number }[];
  usedBy: { id: string; count: number }[];
  details: Record<string, string[]>;
};
export type Flow = {
  id: string;
  title: string;
  steps: { lane?: string; module: string; title: string; text: string }[];
};
export type Perspective = {
  id: string;
  title: string;
  question: string;
  relation: string;
  form: string;
  /** Built perspectives have a tab; planned ones are listed. */
  built: boolean;
};
export type Ontology = {
  name: string;
  source: string;
  tiers: Tier[];
  things: Thing[];
  rolesAt: RoleAt[];
  roles: { id: RoleId; title: string; summary: string }[];
  groups: { id: string; title: string; modules: string[] }[];
  modules: Module[];
  crossSpecs: Spec[];
  flows: Flow[];
  perspectives: Perspective[];
};

/** Every reference in the document must resolve. Returns the problems. */
export function validate(doc: Ontology): string[] {
  const problems: string[] = [];
  const things = new Set(doc.things.map((thing) => thing.id));
  const tiers = new Set(doc.tiers.map((tier) => tier.id));
  const modules = new Set(doc.modules.map((module) => module.id));
  if (things.size !== doc.things.length) problems.push("duplicate thing id");
  for (const thing of doc.things) {
    if (!tiers.has(thing.tier))
      problems.push(`thing ${thing.id} is in unknown tier ${thing.tier}`);
    if (thing.partOf && !things.has(thing.partOf))
      problems.push(`thing ${thing.id} is part of unknown ${thing.partOf}`);
    for (let at = thing.partOf, seen = 0; at; seen++) {
      if (seen > doc.things.length) {
        problems.push(`thing ${thing.id} is inside a containment cycle`);
        break;
      }
      at = doc.things.find((item) => item.id === at)?.partOf;
    }
    for (const id of thing.modules ?? [])
      if (!modules.has(id))
        problems.push(`thing ${thing.id} names unknown module ${id}`);
  }
  for (const role of doc.rolesAt)
    for (const id of [role.at, role.heldBy])
      if (!things.has(id))
        problems.push(`role ${role.title} names unknown ${id}`);
  for (const group of doc.groups)
    for (const id of group.modules)
      if (!modules.has(id))
        problems.push(`group ${group.id} names unknown module ${id}`);
  for (const flow of doc.flows)
    for (const step of flow.steps)
      if (!modules.has(step.module))
        problems.push(`flow ${flow.id} names unknown module ${step.module}`);
  return problems;
}
