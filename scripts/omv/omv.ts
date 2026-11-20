// OMV: O defines what can be talked about, M holds the objects and their
// relations, V looks at M from one object with one question. See THEORY.md.
// Nothing in this folder knows the repository it describes.

// ---------- O: definitions ----------
export type ObjectType = { id: string; title: string; meaning: string };
export type RelationType = {
  id: string;
  /** How to read it from its source: "is part of". */
  out: string;
  /** How to read it from its target: "contains". */
  in: string;
  meaning: string;
  from: string[];
  to: string[];
  /** Computed from other relations, not declared or read from a source. */
  derived?: boolean;
};
export type Tier = { id: number; title: string; summary: string };

// ---------- M: the model ----------
export type Value = string | number | boolean | string[];
export type Obj = {
  id: string;
  type: string;
  title: string;
  summary?: string;
  attrs?: Record<string, Value>;
};
export type Rel = {
  from: string;
  to: string;
  type: string;
  label?: string;
  weight?: number;
};

// ---------- V: questions and views ----------
export type Form = "groups" | "tree" | "matrix" | "path";
export type Question = {
  id: string;
  title: string;
  ask: string;
  /** Relation types this question follows, in reading order. */
  follows: string[];
  form: Form;
  /** Said when the model cannot answer fully yet. */
  gap?: string;
};
export type OmvDocument = {
  name: string;
  source: string;
  /** Set when a page is built; left out of the committed document. */
  version?: string;
  /** The object that stands for the whole. */
  root: string;
  o: {
    objectTypes: ObjectType[];
    relationTypes: RelationType[];
    tiers: Tier[];
    rules: string[];
  };
  m: { objects: Obj[]; relations: Rel[] };
  v: { questions: Question[]; viewers: string[] };
};

export type Group = {
  relation: string;
  direction: "out" | "in";
  label: string;
  derived: boolean;
  items: { id: string; label?: string; weight?: number }[];
};
export type View = {
  centre: string;
  question: string;
  form: Form;
  groups: Group[];
  /** What produced this view, so it can be produced again. */
  provenance: {
    centre: string;
    question: string;
    source: string;
    conditions: string[];
    form: Form;
  };
};
export type Context = { viewer?: string };

/** Every object has a type, and every relation joins types O allows. */
export function validate(doc: OmvDocument): string[] {
  const problems: string[] = [];
  const types = new Set(doc.o.objectTypes.map((type) => type.id));
  const relations = new Map(doc.o.relationTypes.map((type) => [type.id, type]));
  const objects = new Map(doc.m.objects.map((object) => [object.id, object]));
  if (objects.size !== doc.m.objects.length)
    problems.push("duplicate object id");
  for (const object of doc.m.objects)
    if (!types.has(object.type))
      problems.push(`object ${object.id} has unknown type ${object.type}`);
  for (const type of doc.o.relationTypes)
    for (const id of [...type.from, ...type.to])
      if (!types.has(id))
        problems.push(`relation type ${type.id} names unknown type ${id}`);
  for (const relation of doc.m.relations) {
    const type = relations.get(relation.type);
    const from = objects.get(relation.from);
    const to = objects.get(relation.to);
    const name = `${relation.from} -${relation.type}-> ${relation.to}`;
    if (!type) problems.push(`${name}: unknown relation type`);
    if (!from || !to) problems.push(`${name}: unknown object`);
    if (type && from && !type.from.includes(from.type))
      problems.push(`${name}: ${from.type} may not be its source`);
    if (type && to && !type.to.includes(to.type))
      problems.push(`${name}: ${to.type} may not be its target`);
  }
  if (!objects.has(doc.root)) problems.push(`unknown root ${doc.root}`);
  for (const question of doc.v.questions)
    for (const id of question.follows)
      if (!relations.has(id))
        problems.push(`question ${question.id} follows unknown relation ${id}`);
  for (const id of doc.v.viewers)
    if (!objects.has(id)) problems.push(`unknown viewer ${id}`);
  return problems;
}

/** V = View(M; o, q, c, r): one hop from the centre along the question's relations. */
export function view(
  doc: OmvDocument,
  centre: string,
  question: string,
  context: Context = {},
): View {
  const q = doc.v.questions.find((item) => item.id === question);
  if (!q) throw new Error(`unknown question ${question}`);
  const title = (id: string) =>
    doc.m.objects.find((object) => object.id === id)?.title ?? id;
  const groups: Group[] = [];
  for (const id of q.follows) {
    const type = doc.o.relationTypes.find((item) => item.id === id);
    if (!type) continue;
    for (const direction of ["out", "in"] as const) {
      const items = doc.m.relations
        .filter(
          (relation) =>
            relation.type === id &&
            (direction === "out" ? relation.from : relation.to) === centre,
        )
        .map((relation) => ({
          id: direction === "out" ? relation.to : relation.from,
          ...(relation.label ? { label: relation.label } : {}),
          ...(relation.weight ? { weight: relation.weight } : {}),
        }));
      if (items.length)
        groups.push({
          relation: id,
          direction,
          label: direction === "out" ? type.out : type.in,
          derived: type.derived === true,
          items,
        });
    }
  }
  return {
    centre,
    question,
    form: q.form,
    groups,
    provenance: {
      centre: title(centre),
      question: q.title,
      source: doc.version ? `${doc.source}@${doc.version}` : doc.source,
      conditions: [
        context.viewer ? `viewer: ${title(context.viewer)}` : "viewer: anyone",
        "depth: one relation from the centre",
      ],
      form: q.form,
    },
  };
}

export type Branch = { id: string; children: Branch[] };
/** Follows one relation type all the way: up to the root and down to the leaves. */
export function tree(
  doc: OmvDocument,
  centre: string,
  relation: string,
): { up: string[]; down: Branch } {
  const parent = new Map<string, string>();
  const children = new Map<string, string[]>();
  for (const item of doc.m.relations) {
    if (item.type !== relation) continue;
    parent.set(item.from, item.to);
    children.set(item.to, [...(children.get(item.to) ?? []), item.from]);
  }
  const up: string[] = [];
  for (let at = parent.get(centre); at && !up.includes(at); at = parent.get(at))
    up.unshift(at);
  const seen = new Set<string>();
  const grow = (id: string): Branch => {
    seen.add(id);
    return {
      id,
      children: (children.get(id) ?? [])
        .filter((child) => !seen.has(child))
        .map(grow),
    };
  };
  return { up, down: grow(centre) };
}
