# 126 — public calendar image export candidate

Status: local focused verification complete; no push, full gate, merge or deployment.
Base: S1 head ec6f3a342716138847f324a074beda8d64f30b10.
Pure S2 dependency boundary: dcc2eecc541b0a9f8cf2d1331af8266cc3e7d375 (b6e1087 cherry-pick).
Targets: TypeScript core/API/MCP/UI and shared formatter; existing Rust calendar renderer.

- Strict view=calendar requires calendarMode=week|month and visibleDate; project/highlight/client-zone options refused.
- Authorized listCalendar uses the saved human/token-issuer zone and canonical civil window.
- Snapshot hash binds window/options/locale/exporter and scheduled display data; excludes tray, descriptions and finance.
- Common snapshot audit/quota preserved: scope calendar, resource workspace, finance false, distinct scheduled project count (zero allowed).
- Confirmed non-guests export the visible week/month grid; day and list views hide export.
- Existing dialog previews/sends/copies/saves 1600 px PNGs; MCP remains 38 tools with no scope changes.
- Shared localized formatter labels next-day midnight as 24:00; DST 23/25-hour segment assertions and six goldens updated.
- Schema, ADR amendment 3, VE-5, README and generated MCP/test-id contracts updated.

Focused validation:
- `node node_modules/vitest/vitest.mjs run packages/schemas/src/view-export.test.ts packages/schemas/src/calendar-image.test.ts apps/api/src/view-export.test.ts apps/api/src/mcp-views.test.ts scripts/ui/fonts.test.ts`: 28 passed (5 files).
- `node --env-file=.env node_modules/vitest/vitest.mjs run packages/core/src/view-export.integration.test.ts`: 16 passed, including scope narrowing/revocation, member demotion, options/hash/zone and audit.
- `node node_modules/typescript/bin/tsc -p <packages/core|apps/api|apps/web>/tsconfig.json --noEmit`: passed all three.
- `CARGO_TARGET_DIR=/tmp/taff-timeline-target CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path backend/Cargo.toml -p taff-render`: 16 passed; summary/timeline goldens unchanged.
- Six calendar goldens regenerated with rust-calendar-golden.mts and UPDATE_RENDER_GOLDENS=1 filtered calendar tests. Worst case remains 3728 px / 190904 bytes; localized week/month images 34953–68258 bytes.
- `node --env-file=.env node_modules/@playwright/test/cli.js test --config playwright.calendar.local.ts e2e/view-export.spec.ts -g 'calendar exports'`: 3 locales passed, 44.4 s, real PNG/save/window navigation, day/list absence.
- Temporary local harness used direct API + webpack dev on 4100/4101 and renderer 3303; no tracked config change. Existing isolated S1 test resources reused with parent authorization.
- Focused Biome, generated contracts, git diff --check: passed. No full release gate claim.

Parent owns serial rebase onto merged S1, full gate, PR/merge and deployment; S3 graph integration is separate.
