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
