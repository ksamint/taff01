# Spec: Architecture tooling

Living specification for Taff’s source inventory and function map.

Status: implemented on main.

## Users and roles

| Role | Can |
| --- | --- |
| Developer | Regenerate and inspect the architecture model |

## Requirements

### Architecture model (TT-9)

- TT-9.1 The repository shall hold one architecture model in LikeC4 source
  files under `architecture/`. `spec.c4` names the kinds of element and
  relationship; `runtime.c4`, `domain.c4` and `views.c4` are written by
  hand; `generated/modules.c4` is generated.
- TT-9.2 `pnpm arch:gen` shall build the generated file from the code: every
  table in `packages/db/src/schema.ts`, every REST route and MCP tool in
  `apps/api/src`, every literal Axum route with named handlers in
  `backend/crates/taff-api/src`, every source file in `packages/core/src`,
  every page in `apps/web/app`, and which tables each core file imports.
- TT-9.3 `scripts/architecture/modules.ts` shall assign each of those to
  exactly one function module. The unit tests shall fail when the code gains a
  table, core file, route, tool or page that no module claims, when two
  modules claim one, when a module names a file that does not exist, or when
  the committed generated file differs from a fresh run.
- TT-9.4 `pnpm arch:view`, `pnpm arch:build` and `pnpm arch:check` shall
  run LikeC4 1.60.0 on demand through `pnpm dlx`. LikeC4 shall not be a
  dependency of any package, and `pnpm check` shall not need it or the
  network: the gate covers TT-9.3 through the unit tests only.
- TT-9.6 `pnpm arch:map` shall build the function map, one self-contained
  page, from the same inventory. For each module it shall show its functions
  with the roles that may use them, taken from the generated permissions
  matrix; the requirement groups of its specifications; the flows it takes
  part in; and the modules whose tables its code imports and the modules
  that import its own. Tables, routes, tools and files shall be available as
  folded detail. The unit tests shall fail when a module is in no lane, when
  a permission action or a specification has no module, or when a flow step
  names a module that does not exist.
- TT-9.7 `pnpm arch:map` shall write one OMV document,
  `architecture/omv.json`, with three parts. O: the object types and the
  relation types, each relation type with a meaning, the types it may join
  and a reading in both directions. M: every concept, role, function,
  module, flow, step, specification, requirement, table, route, tool, screen
  and core file as an object, and typed relations between them; a concept
  carries its tier and the number of tables that cannot exist without it.
  V: the questions, each naming the relation types it follows and its form.
- TT-9.8 Every view on the page shall be produced by `view(document, centre,
  question, context)` and shall show its centre, question, context, form and
  model version. Any object may be the centre. The questions are Structure,
  Responsibility, Authority, Flow, Time, Resource, Dependency and Value and
  proof. A question the model cannot fully answer shall say what is missing.
- TT-9.9 The unit tests shall fail when an object has no type in O, when a
  relation joins types O does not allow, when a table belongs to no concept
  or to two, or when the committed document is stale.
- TT-9.10 `scripts/omv/` (format, validation, view function, viewer, page
  builder, standard repository vocabulary) shall import nothing from outside
  its folder, so it can move to another repository unchanged.
- TT-9.11 `pnpm arch:benchmark` shall write `docs/benchmark/function-map.md`
  with the func-map skill (`.claude/skills/func-map/`): the skill's
  project-management catalog (functions by group and category, and the
  products each is seen in) and Taff's assessment in
  `scripts/architecture/benchmark.ts` (one mark per catalog function). Each
  group on the page shall fold open and shut. Each function Taff has or partly has shall name objects of the
  OMV model. The unit tests shall fail when a named object does not exist,
  when a catalog function has no mark, when a partial mark has no note, or
  when the committed table is stale. The table states what the reading
  material says about other products; it does not claim to have tested them.
- TT-9.5 The model describes the code; it grants nothing and no runtime reads
  it. A sub-project level and a level above the organization appear in
  `domain.c4` marked `not_modelled` until the owner decides them.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| TT-9 | scripts/architecture/architecture.test.ts (11); eight questions exercised from three centres in Chromium ([milestone 160](../milestones/160-omv-map.md)); function map opened in Chromium at 1440 and 400 px with no page error ([milestone 158](../milestones/158-function-map.md)); `pnpm arch:check` valid on LikeC4 1.60.0 ([milestone 157](../milestones/157-architecture-model.md)) |

## Sources

- [Architecture guide](../../architecture/README.md)
- [ADR 0033](../adr/0033-likec4-architecture-model.md)
