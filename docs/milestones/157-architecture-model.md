# 157 · Architecture model in LikeC4

- Base `8d03faa` (`origin/main`, v0.2.26); branch `claude/trusting-bell-ylwvn9`.
- Owner command, 2026-11-20: map taff01 directly in LikeC4; tda01 is separate.
  Decision recorded in [ADR 0033](../adr/0033-likec4-architecture-model.md);
  contract in `docs/spec/tooling.md` TT-9.
- Working: `architecture/` holds the model. `spec.c4` defines 14 kinds of
  element, 4 kinds of relationship and 9 tags. `runtime.c4` has 3 actors and
  14 services, libraries and stores with their calls. `domain.c4` has the
  levels work lives in, with sub-project and organization group marked
  `not_modelled`. `views.c4` has 6 overview views.
- Working: `pnpm arch:gen` reads the code and writes
  `generated/modules.c4`: 18 modules, 55 tables, 155 routes, 38 MCP tools,
  51 core files, 28 pages, the table imports of every core file, and one view
  per module.
- Working: `scripts/architecture/architecture.test.ts` (4 cases) fails on an
  unmapped or doubly mapped item, a missing listed file, or a stale
  generated file.
- Validation in the cloud session, on Node 24.22.3:
  `likec4@1.60.0 validate architecture` valid (5 files); single-file site
  built (5.4 MB) and opened in Chromium with no page error; Biome on the new
  files clean; `tsc -p tsconfig.scripts.json` clean; architecture and
  language-policy unit tests passed.
- Not run: the full `pnpm check`. The session has no Docker daemon, so the
  image-build and pinned-Linux steps cannot run there. This branch is not
  gated and must not merge until the operator machine runs the full gate.
- Missing: per-route elements (routes are grouped by path family); edges
  from screens to the exact routes they call; edges from routes to the core
  functions they call. All three need parsing beyond import lists.
- Missing: the scan finds 155 routes in source; the release record counts
  159. The difference is routes registered by libraries, not by `app.get`.
- Open decisions: add a level between project and task; add a level above the
  organization; whether tda01's ontology absorbs this model.
