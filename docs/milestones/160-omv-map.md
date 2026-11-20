# 160 · OMV: theory and map

- Base `8349f1a` on `claude/trusting-bell-ylwvn9` (milestone 159).
- Owner command, 2026-11-20: optimize and build up the OMV theory, and turn
  the ontology map into the OMV map. Recorded in the third amendment of
  [ADR 0033](../adr/0033-likec4-architecture-model.md); contract in
  `docs/spec/tooling.md` TT-9.7 to TT-9.10.
- Working: `scripts/omv/THEORY.md` states the method: O (object types,
  relation types, ranking, rules), M (one typed graph, declared or derived,
  with a level), V = View(M; o, q, c, r), eight questions, seven rules.
- Working: the engine is renamed `scripts/omv/`. `omv.ts` holds the
  format, `validate`, `view` and `tree`; `repo-o.ts` holds a standard O
  of 14 object types, 19 relation types and 8 questions. It imports nothing
  from the rest of the repository.
- Working: `pnpm arch:map` writes `architecture/omv.json`: 592 objects
  (1 product, 48 concepts, 10 roles, 60 functions, 18 modules, 5 flows, 25
  steps, 14 specifications, 62 requirements, 55 tables, 155 routes, 38 tools,
  38 screens, 63 files) and 1,818 relations, valid against its own O.
- Working: the page has a picker for the centre (concepts ranked by tier and
  dependents), a question switch, a viewer switch and a provenance line.
  Structure draws a tree, Authority a matrix, Flow a path, the rest groups.
  A closed section lists O: types, relation types, tiers, rules, questions.
- Validation in the cloud session: Biome clean; scripts type check clean;
  script unit tests passed (10 in the architecture file); eight questions
  exercised from the product, the Task concept and the Planning module, and
  Authority from the Guest role, in Chromium at 1440 px with no page error;
  the page opened at 400 px with no sideways scroll.
- Not run: the full `pnpm check` (no Docker daemon in the session). The
  branch is not gated.
- Missing: tests are not linked to requirements, so Value and proof shows
  requirements only. Time holds which things carry time, not dates. From
  the product as centre, Responsibility, Time, Resource and Dependency are
  empty. A view goes one relation deep, except Structure. No editing on the
  page. The viewer switch changes only the Authority view.
- Open decisions: add a level between project and task; add a level above
  the organization; when to move `scripts/omv/` into tda01.
