# 125 — public timeline image export candidate

Status: local implementation; no push, merge, release gate or deployment.
Base E3: d0c9eae16eae044e53dce4e2bbc9abf851dd4f09.
Pure renderer dependency boundary: 6b634bd (cherry-pick of 52690d4).
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

Parent owns full gate, rebase onto completed v24, PR/merge and deploy. S2/S3 integrate separately.

Review repair: timeline colours now use approved TABLE AI ink/gold/error/outline/container tokens from tokens.css, guarded by a renderer source-token assertion. Intentionally refreshed only three timeline PNGs. Focused timeline checks: 5 passed; full renderer regression: 13 passed, summary goldens unchanged. No full gate or publication.
