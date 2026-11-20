# 158 · Function map

- Base `af03712` on `claude/trusting-bell-ylwvn9` (milestone 157).
- Owner command, 2026-11-20: the LikeC4 pages are hard to read and to
  interact with; focus on key requirements, modules, functions, roles, flows
  and relations, and keep the detail as a supplement. Recorded as an
  amendment to [ADR 0033](../adr/0033-likec4-architecture-model.md);
  contract in `docs/spec/tooling.md` TT-9.6.
- Working: `pnpm arch:map` writes `architecture/.site/map.html` (53 KB, one
  file). 18 modules in five lanes. Clicking a module shows its functions with
  the four roles, its requirement groups, its flows, the modules it uses and
  the modules that use it, and folded detail.
- Working: a role switch shows how many of each module's functions that role
  may use. A flow switch numbers the modules of one of five flows and draws
  the path. A search box dims modules that do not match a function, table,
  route, tool or file.
- Derived, not typed: 60 functions from the generated permissions matrix;
  62 requirement groups from 14 specifications; module relations from the
  table imports of core files.
- Finding the map makes visible: eight modules have no living specification
  in `docs/spec` (tasks, planning, calendar, inbox, companies and contacts,
  relations, mind map, sign-in). Four modules have no permission action of
  their own (relations, sectors, audit, kernel).
- Validation in the cloud session: Biome clean on 718 files; scripts type
  check clean; 118 script unit tests passed, 1 skipped; the map opened in
  Chromium at 1440 px and 400 px with no page error and no sideways scroll.
- Not run: the full `pnpm check` (no Docker daemon in the session). The
  branch is still not gated.
- Missing: editing on the map. Changes are made in `focus.ts` and
  `modules.ts`; the map is rebuilt from them.
- Open decisions: unchanged from milestone 157.
