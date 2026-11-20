# 0033 — The architecture model lives in the repository, in LikeC4

Date: 2026-11-20. Status: accepted (owner: "use likec4 directly to map taff01
directly; the likec4 integration with tda01 is another story"). Builds on
ADR 0030 (TypeScript and Rust only) and ADR 0032 (Rust port).

## Context

The owner asked for a tree view and an architecture view to understand the
repository, then for a canvas that can be edited, keeps its version history
and carries a mapping and an ontology. The 2026-11-20 architecture map was a
published page: accurate that day, edited by nobody, with no history.

Free-form canvases keep history but know nothing about the code. The tools
that carry both a typed model and diagrams are architecture-model tools.
LikeC4 is MIT, TypeScript, keeps the model in text files, lets a repository
define its own kinds of element and relationship, draws many views from one
model, writes layout edits back to the source, and has an MCP server.

## Decision

1. The model is LikeC4 source under `architecture/`. Its version history is
   Git. Nothing outside the repository holds a second copy.
2. The vocabulary (`architecture/spec.c4`) is Taff's own: what runs, how work
   is organized, and what the code is made of.
3. The part that can be read from the code is generated, never typed: tables,
   REST routes, MCP tools, core files, pages, and which core file imports
   which table. A hand-written map assigns each to one function module, and
   the unit tests fail when something belongs to none.
4. LikeC4 runs on demand through `pnpm dlx`, pinned to 1.60.0. It is not a
   dependency, so the licence gate, the install and `pnpm check` are
   unchanged, and the gate needs no network for it.
5. Joining this model to the tda01 ontology is a separate decision.

## Amendment, 2026-11-20: the function map

The owner found the LikeC4 pages hard to read and to explore: every element
has the same weight, and the canvas is built for diagrams, not for questions.
The model stays; a second view is added. `pnpm arch:map` builds the function
map from the same inventory and puts what matters first: modules, functions,
roles, requirements, flows and relations, with tables, routes and files
folded away. It is written in TypeScript in this repository and needs no
dependency beyond the esbuild already present. LikeC4 remains the detailed
view and the vocabulary check.

## Amendment, 2026-11-20: unlikec4, ontology first

Owner: "encode the ontology and rebuild the map with perspective switch, and
remember this unlikec4 we will merge it into tda01".

1. The source of truth is the ontology, not a diagram: every kind of thing,
   ranked. The tier is a judgement about purpose; the order inside a tier is
   measured from the schema as the number of tables that cannot exist
   without the thing. Anything recomputed on read is a view and ranks last.
2. A perspective is one relation drawn in the form that fits it: containment
   as a tree, permission as a matrix, dependency as a graph, sequence as a
   numbered path. Five are built; Data, Time, Purpose, Measure and
   Deployment are named and planned.
3. The engine is `scripts/unlikec4/` and is kept free of any taff01 import,
   because it will be merged into tda01. taff01 keeps only its ontology and
   its adapter in `scripts/architecture/`.
4. `architecture/ontology.json` is committed, so a change to the ontology
   or to the code it maps appears as a diff.

## Consequences

- A change that adds a table, route, tool, core file or page must also name
  its module. That is one line in `scripts/architecture/modules.ts`.
- The generated file is committed, so a pull request shows the architectural
  effect of a change as a diff.
- Route and tool counts in the model are what the scan finds in source. They
  can differ from release counts that include routes registered by libraries.
- The model describes; no runtime reads it and it grants no authority.
- Raising the pinned LikeC4 version is a one-line change in `package.json`,
  made only to a release at least two weeks old.
