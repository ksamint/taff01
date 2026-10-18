# 29 — Project pipeline (2026-10-18)

## Working

- Non-guest people in charge and person admins move stages; all other project
  fields and finance administration remain admin-only. Agents never move stages.
- Header stage control uses optimistic rollback, version checks and Undo.
  The lead picker excludes guests; later demotion removes stage authority.
- Brief and MCP carry nullable stage/leadId; Brief resolves person names and
  filters rows and currency totals by stage without changing timeline risk/sort.
- Project switching groups pipeline stages, then projects with no stage.
- ADR 0021 resolves the open decisions; Unreleased and test-id contract updated.
  No new dependency, migration, backfill or generated Drizzle snapshot.

## Missing

- None.

## Open decisions

- None. Agents continue to receive null finance, including with grants.

## Validation

- Lint passed; typecheck 6/6; licence gate 302 packages, 7 documented exceptions.
- db:migrate + db:seed passed; Vitest 102 files / 1698 tests passed.
- build + build:server passed; Today JS 191.8 KiB local / 191.9 KiB CI (limit 200 KiB).
- Source CI e5ca3ac: LCP en/zh-CN/zh-HK 616/680/680 ms; Lighthouse
  performance 95/94/94, accessibility and best practices 100/100 in every locale.
- Bundled API MCP smoke: 59/59 checks, including Brief metadata and null finance.
- Requested four Playwright specs: 33/33, en/zh-CN/zh-HK, production build,
  pinned Chromium 1248; lead/colleague contexts, rollback/Undo, persistence,
  API 403, Brief labels, filtered rows and totals.
- Visual capture: 66 changed PNGs from [CI workflow](https://github.com/ksamint/taff01/actions/runs/39093716474)
  on reviewed source e5ca3ac; generated PNGs only, comparison tolerances unchanged.
- [PR #60 head CI](https://github.com/ksamint/taff01/pull/60/checks): checks,
  four browser/pixel shards and all three production image builds.
