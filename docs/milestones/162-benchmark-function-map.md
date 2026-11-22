# 162 · Benchmark reading and the function map

- Base `39cacde` on `claude/trusting-bell-ylwvn9` (milestone 161).
- Owner command, 2026-11-20: keep the research as reading material, and list
  one table of consolidated functions by group and category beside Taff's
  existing functions.
- Working: `docs/benchmark/README.md` indexes the folder and states how to
  benchmark one product with the OMV method.
  `reading/2026-11-20-pm-platforms.md` holds the owner-supplied research,
  condensed, with what was checked. `reading/2026-11-20-structure-and-review.md`
  holds this repository's notes on Linear, Asana and Shape Up, a review of
  the research against the code, and two corrections accepted from it.
- Working: `scripts/architecture/benchmark.ts` lists 86 functions in 8
  groups. `pnpm arch:benchmark` writes `docs/benchmark/function-map.md` and a
  page. Taff today: 48 yes, 8 partly, 30 no.
- By group (yes / partly / no): work structure 7/1/9; planning and time
  4/2/5; execution and workflow 7/2/4; people, roles and access 5/0/1; agents
  10/1/3; reporting and communication 6/1/1; client and commercial 4/0/6;
  platform 5/1/1.
- Working: every function Taff has or partly has names objects of the OMV
  model; a unit test fails when one does not exist or the table is stale.
- Validation in the cloud session: Biome clean; scripts type check clean;
  script unit tests passed (11 in the architecture file).
- Not run: the full `pnpm check` (no Docker daemon in the session).
- Limits: the "seen in" column repeats vendor documentation through the
  reading material and was not tested by hand. Status marks are a judgement
  made from the code; "partly" is explained in each note. No product has
  been benchmarked with the six-step method yet.
- Open decisions: listed in section 4 of the structure-and-review reading.
