# 127 — public mind and relations image export candidate

Status: PR102 merged as `7c8db5c`, tree `5c84440`; graph exports and subsequent repairs are now deployed in v0.2.25 `e5a42c5`, tree `47038018`. Exact-source gate/live acceptance passed; final closeout pending.
S1 PR100 merged at `0cd8302`; S2 PR101 merged at `9182d16` with exact validated tree: 2,313 unit, 38 Rust and 360 browser passed, 3 expected skips.
All six S3 implementation/review/evidence/version commits retained; final rebase was conflict-free.
Production now runs v0.2.25 `e5a42c5`; prior accepted v0.2.24 `ff411c6` is the rollback source. Tag verified; closeout checks 7–8 remain pending; no unlocked/final-closeout claim.
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

Open implementation decisions: none. Historical PR head `928ab9e`: 2,365 unit/147 files, Rust 44, 372 browser/3 skips (29.1 min), SSR 3, C6 six, checklist 32, MCP 69/38, four images, non-root 76+27, Today 197,317 bytes. Deployed `e5a42c5`: 2,376 unit/148, Rust 46, 375 browser/0 failures/3 expected skips (25.7 min), Today 197,390 bytes. Final closeout and all four owner checks remain pending in [milestone 128](128-v0.2.25.md).

Proven audit repair after frozen `25bb821`: SDK legacy fallback ignored responseMode=json and logged ok before delayed renderer failure. Public legacy JSON transport now shares the same tool factory; modern handling, auth/quota and one-MiB limit remain intact.
Real app/SDK regression was RED for legacy success/failure and GREEN for modern controls. Focused app/MCP/export suites now pass 100 tests in seven files, including 15 new HTTP completion/compatibility/abort/resource-cleanup cases; API/scripts types, changed-file Biome and diff checks passed.
Request abort settles499 with one error log; connected server owns transport cleanup, listeners are released, and late work rejection is observed. No claim that abort undoes snapshots or cancels core work. VE-2.4 records this contract.
The earlier `25bb821` checklist PNG assertion remains unexplained; one focused rerun and 12 unchanged diagnostic cases passed. The patch fixes the independently reproduced audit defect only. The later deployed-source gate/live acceptance passed without establishing that PNG failure's cause. Known native-select capture variation remains documented in milestone 124; no baseline, tolerance or assertion was weakened.
