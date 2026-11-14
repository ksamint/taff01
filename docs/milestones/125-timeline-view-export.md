# 125 — public timeline image export candidate

Status: merged in PR100 (`0cd8302`), now deployed in v0.2.25 source `e5a42c5` after exact-source gate and live acceptance; tag verified; closeout checks 7–8 passed.
Original implementation base E3: d0c9eae16eae044e53dce4e2bbc9abf851dd4f09.
Integrated onto v0.2.24 closeout main `02e03c4`; pure renderer, public integration, browser evidence and palette repairs preserved.
Targets: TypeScript core/API/MCP/UI and shared schemas; existing Rust timeline renderer.

- Strict view=overview|project|timeline; omitted view preserves old projectId behavior.
- Timeline requires projectId; criticalPath=show|hide defaults show and is refused elsewhere.
- Core calls authorized getTimeline; saved caller/token-issuer zone and locale apply.
- Canonical hash binds snapshot, normalized options and exporter/workspace/project labels; no finance.
- Existing finish path records authorized snapshot audit before rendering; same shared member quota.
- Shared helper routes timeline to /render/timeline; existing summaries still use /render/summary.
- One non-guest toolbar button exports current critical highlight and the whole chart, independent of browser zoom.
- Preview/send/copy/save reuse the existing dialog. All three locale headings and VE-4/ADR/README updated.
- No scope, permission, OAuth migration or version changes. MCP remains 38 tools.

Focused validation on the implementation tree:
- Schema/API/MCP/font Vitest selection: 18 passed across 5 files.
- PostgreSQL view-export.integration.test.ts: 12 passed (isolated taff_v025_s1_test).
- tsc --noEmit for packages/core, apps/api and apps/web: passed.
- schema generator and test-id contract regenerated; Biome and git diff --check passed.
- `CARGO_TARGET_DIR=/tmp/taff-timeline-target CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path backend/Cargo.toml -p taff-render`: 12 passed; summary/timeline goldens unchanged.
- Three-locale timeline browser tests: 3 passed in 29.3 s against the real renderer (1600 px PNG/save, critical highlight hash change, zoom hash stability).
- Browser command: `node --env-file=.env node_modules/@playwright/test/cli.js test --config playwright.timeline.local.ts e2e/view-export.spec.ts -g 'timeline exports'`; temporary harness used direct API + webpack dev on 4100/4101, renderer 3303. Default Turbopack startup could not resolve external dependency links; no tracked config change.

PR100 gate: 2,293 unit, 34 Rust and 357 browser passed, 3 expected skips. S2/S3 and later repairs merged through PR104; deployed `e5a42c5` passed 2,376 unit/148 files, Rust 46 and 375 browser/0 failures/3 expected skips. Final closeout is accepted in [milestone 128](128-v0.2.25.md).
Conflict resolution keeps v24 released status separate from the timeline candidate; the goal now correctly requires all four application images.
Post-rebase typecheck and 21 focused tests in six files passed. Replaced unsupported shared dependency-store links with a normal frozen local install; no configuration change.

Review repair: timeline colours use approved TABLE AI ink/gold/error/outline/container tokens from tokens.css, guarded by a renderer source-token assertion. Intentionally refreshed only three timeline PNGs. Focused timeline checks: 5 passed; renderer regression: 13 passed, summary goldens unchanged. This focused evidence preceded the PR100 gate above.
