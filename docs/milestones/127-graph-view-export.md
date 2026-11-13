# 127 — public mind and relations image export candidate

Status: implemented locally for v0.2.25; not released. No push, full gate or deployment.
Current dependency boundary: combined S2 candidate `b4485e8c4cd753374bbadd77d693f201a4219f75`; parent will rebase above it onto actual S2 main before full gate.
Retained graph prep/public/review commits rebased from `9875bec`/`54e72d5`/`1426d1f` to `979dced`/`5a1316c`/`68865fc`; pure source originally `9b4f563`.
Combined resolution preserves calendar/timeline options, scheduled-only reads, localized labels, typed dispatch/overloads, quota/audit; ADR amendments OAuth2/timeline3/calendar4/graph5.
Targets: TypeScript schemas/core/API/MCP/web/tests and Rust graph rendering; no dependencies.

- Strict mind archived filter and relations layout/scope/layers/uint32 seed; normalized defaults.
- Core calls authorized getMindMap/relationGraph; current membership, scopes and CRM grants apply.
- Canonical hash covers visible sanitized display/options, saved zone and exporter; no private fields or finance.
- Shared quota/render delivery and snapshot audit; MCP remains 38 tools, no new permission or migration.
- Toolbar exports current graph options in three locales; relations list mode hides the graph button.
- Shared geometry, 150 nodes/600 semantic edges and exact localized overflow counts remain intact.
- Graph uses canonical web semantic colors; six graph goldens updated, summary/timeline goldens unchanged.
- VE-6 living spec, ADR 0031, README and goal updated; deployment requires all four images.

Focused validation on this implementation (not the release gate):
- Vitest schema/graph/API/MCP/web geometry/font/palette/test-id/language selection: 69 passed in 10 files.
- PostgreSQL view-export + authorization selection (`exported view images|view-image|every REST endpoint`): 34 passed, 825 unrelated matrix cases skipped.
- `tsc --noEmit` for schemas/core/db/API/worker/web/SW and scripts: passed on clean-source generated types.
- `cargo test --locked --offline -p taff-core --test mcp_schema`: 4 passed; regenerated MCP fixture.
- `cargo test --locked --offline -p taff-render`: 17 passed; Clippy tests with `-D warnings` and rustfmt passed.
- Rust commands use `--manifest-path backend/Cargo.toml`, `CARGO_BUILD_JOBS=2`, private `/private/tmp/taff-graph-integration-target`.
- Six graph browser cases: passed (three locales, real PNG/hash/save and visible option changes).
- Six existing summary/timeline browser regressions: passed. Browser runs precede the Rust palette correction.
- Post-palette six locale graph goldens passed; HK mind/relations visually inspected without clipping.
- Dense mind/relations PNGs: 210,306 / 356,201 bytes; both within 400 KB and geometry bounds.
- Biome changed sources, generated test-id contract and `git diff --check`: passed.

Resolved harness findings: a combined six-export/account dev case hit 429 because StrictMode aborts still count; split into fresh accounts per graph (2/4 exports), preserving quota/no retries. New Chinese empty text uses existing audited “心智图/心智圖” vocabulary. Ignored Next dev types required modal unlike tracked layout; moved only generated dev types before clean-source typechecks, no layout change.
Browser artifacts: `/private/tmp/taff-v025-s3-graph-artifacts` (before palette correction).
Own 4200/4201/3304 services stopped; other worktrees/services untouched. Full gate needs a fresh seeded runtime database after focused fixtures.
Open implementation decisions: none. Parent owns combined S1/S2 integration, clean full gate, PR/merge and deployment.

Review followup (separate commit after `54e72d5`): relations use all retained semantic edges for geometry, with 600 applied only to rendered edges; both graph buttons require confirmed membership.
Regression: 52-node/1,131-edge layered/force position tests failed before and passed after; six locale SSR cases passed using the provisional-session fixture to assert hidden-before/visible-after confirmation.
Followup validation: graph/geometry/session/palette/test-id Vitest selection 60 passed; schema/web/scripts typechecks, Biome and diff check passed. Rust graph tests 5 passed; six PNG goldens unchanged; regenerated dense relations JSON renders 356,589 bytes.
Followup own API4201/web4200 stopped; renderer not started; ignored Next dev types moved before clean-source web typecheck. No full gate/push/deploy.
Combined-S2 rebase checks: 85 schema/API/MCP/geometry tests + 9 schema/font/language tests; 39 focused DB/auth passed (833 unrelated skipped); all eight TS targets, Rust MCP4/render22, Clippy/rustfmt/Biome passed. Full fixture regeneration (summary10) produced no drift; cross-calendar/graph irrelevant fields are rejected. No browser/services/full gate; v24 versions/migrations and38tools retained.
