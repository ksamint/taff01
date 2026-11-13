# 127 — public mind and relations image export candidate

Status: v0.2.25 preparation only; full gate and deployment pending. No push.
Exact future drop boundary: frozen final S2 `2dda9afa4e8e196fb4000b034410912b8c3cd749`; parent will rebase above it onto actual merged S2 before the final gate. S1 PR100 is merged at `0cd83021df951eb0f86de437a49d85577d3778a6`.
Retained S3 commits: `7844f35` (pure geometry/render), `7673275` (public integration), `86d98f3` (review fixes), `ef3f634` (combined validation), `03a0544` (versions/changelog).
Production remains accepted v0.2.24 `ff411c6`, also the v0.2.25 rollback source. API/web/worker package versions are now 0.2.25 with an explicitly unreleased changelog.
Targets: TypeScript schemas/core/API/MCP/web/tests and Rust renderer; no new dependency, migration, environment value, permission or tool (38 remain).

- Strict mind archived filter and relations layout/scope/layers/uint32 seed; normalized defaults and cross-view irrelevant options refused.
- Authorized getMindMap/relationGraph preserve current membership/scopes/CRM grants; visible sanitized display/options determine the hash with saved zone and exporter, excluding private fields and finance.
- Shared quota/render delivery and bounded snapshot audit; scope mind/relations and finance false.
- Confirmed non-guests export current graph options in three locales; relations list mode hides the control.
- Shared web geometry retains 150 nodes; all retained unique edges drive layout, while only 600 edges render. Separate exact localized overflow counts exclude hidden nodes/edges.
- Canonical TABLE AI colors, bounded geometry, label-aware fit, 1080 px palette PNGs, maximum 4000 px/400 KB, watermark and embedded hash.
- VE-6 spec, README and ADR updated; numbering OAuth 2 / timeline 3 / calendar 4 / graph 5. All four application images must share the validated release source.

Focused validation before this documentation-only rebase (unchanged code):
- 99 pure schema/API/MCP/geometry/session/font/palette/language/test-id tests passed in 13 files.
- All eight tsc targets passed: schemas, db, core, API, worker, web, SW and scripts.
- `node --import tsx scripts/rust-fixtures.mts` passed (summary model 10 tests); MCP/schema/calendar/timeline/graph/parity fixtures regenerated with no drift.
- `node --import tsx scripts/test-id-contract.mts` produced no drift. Focused Biome and `git diff --check` passed.
- Only spec release/role text and the four-image goal conflicted; both intents retained. Dense geometry, confirmed controls and all public graph source files match the previous S3 candidate.
- No Rust execution, shared target, browser, services, listeners or database changes in this preparation; no full-gate claim.
- Second preparation onto final S2 was conflict-free. Compared all apps/packages/backend/scripts/e2e and lockfile bytes with `836eb744`: identical, including generated contracts/fixtures, confirmed controls and dense geometry. `git diff --check` passed; focused gates were not repeated.

Earlier evidence, not rerun on this rebased tree:
- 39 focused PostgreSQL authorization/export cases passed (833 unrelated matrix cases skipped); Rust MCP 4 and renderer 22 passed with Clippy/rustfmt.
- Six graph export browser cases plus six summary/timeline regressions passed before palette correction; six provisional-session locale cases passed after confirmed-control correction.
- Post-palette graph goldens passed and HK images were inspected. Dense mind/relations PNGs: 210,306 / 356,589 bytes; six PNG goldens unchanged by the geometry fix.
- The 52-node/1,131-edge regression reproduced layered/force drift before the fix and verifies every shared position with seed 7 after it.
- Dev StrictMode aborted requests consumed quota; fixtures use fresh accounts per graph (2/4 exports), without changing product quota or adding retries. Ignored dev types were moved before earlier clean-source typechecks; no layout change.
- Historical browser artifacts: `/private/tmp/taff-v025-s3-graph-artifacts` (before palette correction). Parent full gate requires a fresh seeded runtime database after prior focused fixtures.

Open implementation decisions: none. Parent owns final S2-main rebase, full local gate, PR/merge, deployment and owner acceptance.
