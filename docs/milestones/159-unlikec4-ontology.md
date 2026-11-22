# 159 · unlikec4: ontology, mapping, perspectives

- Base `1c942c0` on `claude/trusting-bell-ylwvn9` (milestone 158).
- Owner command, 2026-11-20: encode the ontology, rebuild the map with a
  perspective switch, and keep unlikec4 ready to merge into tda01. Recorded
  in the second amendment of [ADR 0033](../adr/0033-likec4-architecture-model.md);
  contract in `docs/spec/tooling.md` TT-9.7 and TT-9.8; note for agents in
  `AGENTS.md`.
- Working: `scripts/architecture/ontology.ts` lists 48 things in 8 tiers,
  each with a kind, its storage and what contains it. All 55 tables belong to
  exactly one thing. Two things are marked not modelled: group of
  organizations and sub-project.
- Working: the ranking inside a tier is measured from the schema. Tables
  that cannot exist without it: member 19, organization 15, task 10, user 6,
  run 6, project 5.
- Working: `pnpm arch:map` writes `architecture/ontology.json` and the page.
  Perspectives: Things (ranked list), Structure (tree with the roles held at
  each level), Authority (60 functions by 4 roles), Dependency (18 modules
  with arrows), Flow (5 numbered paths). Clicking a thing shows its tier,
  kind, storage, container, contents, roles, dependents and owning module;
  clicking a module shows its things, functions, requirements, flows,
  relations and folded code detail. The perspective is kept in the page
  address (`#structure`).
- Working: `scripts/unlikec4/` holds the format, `validate`, the viewer and
  the page builder, and imports nothing from the rest of the repository.
- Validation in the cloud session: Biome clean; scripts type check clean;
  script unit tests passed (9 in the architecture file); all five
  perspectives exercised in Chromium at 1440 px and the page opened at 400 px
  with no page error and no sideways scroll.
- Not run: the full `pnpm check` (no Docker daemon in the session). The
  branch is not gated.
- Missing: the Data, Time, Purpose, Measure and Deployment perspectives;
  editing on the page; relations between things other than containment and
  declared references.
- Open decisions: add a level between project and task; add a level above
  the organization; when to move `scripts/unlikec4/` into tda01.
