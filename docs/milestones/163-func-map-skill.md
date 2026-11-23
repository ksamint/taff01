# 163 · The func-map skill

- Base `f3b9f15` on `claude/trusting-bell-ylwvn9` (milestone 162).
- Owner command, 2026-11-22: make the function map a skill, `func-map`.
  Owner comment on the published map: each group should fold open and shut.
- Working: `.claude/skills/func-map/` holds `SKILL.md` (when to use,
  procedure, rules), `references/method.md` (writing a catalog, marking,
  benchmarking one product), `catalogs/project-management.ts` (86 functions
  in 8 groups with stable ids and "seen in"), and `scripts/func-map.ts`
  (`check`, `markdown`, `page`, and a command line Node 24 runs directly).
  It imports nothing outside its folder.
- Working: the catalog (what the field offers) and the assessment (what one
  subject has) are separate. Taff's assessment in
  `scripts/architecture/benchmark.ts` holds one mark per catalog id;
  `pnpm arch:benchmark` uses the skill with the OMV model as evidence.
  Counts unchanged: 48 yes, 8 partly, 30 no.
- Working: the page lists the eight groups as one folding list with counts
  and a coverage bar; each opens into its table; open all and close all.
- Check rules: every catalog function marked once; a partial mark needs a
  note; a yes needs evidence or a note; every `where` id must exist.
- Validation in the cloud session: Biome clean; scripts type check clean;
  script unit tests passed; the skill's script run directly with Node 24
  produced the same table; the page folded and unfolded in Chromium at
  1280 px and 400 px with no sideways scroll.
- Not run: the full `pnpm check` (no Docker daemon in the session).
- Synced 2026-11-23: v1.0.1 is canonical in ksamint/ksaskill01 (`skills/func-map/`,
  PR 6, command `fmap`); this copy is identical. module-spec was added there too.
- Missing: no second catalog and no competitor assessment yet.
