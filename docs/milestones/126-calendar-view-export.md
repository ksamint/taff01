# 126 — public calendar image export candidate

Status: integrated onto merged S1 main `0cd8302`; v0.2.25 unreleased. Final local gate pending.
S1 PR100 merged with the exact validated tree: 2,293 unit, 34 Rust, 357 browser passed, 3 expected skips.
All five S2 implementation/review/evidence commits retained; accepted v0.2.24 production/next rollback source is `ff411c6`.
Targets: TypeScript core/API/MCP/UI and shared formatter; existing Rust calendar renderer.

- Strict view=calendar requires calendarMode=week|month and visibleDate; project/highlight/client-zone options refused.
- Authorized listCalendar uses the saved human/token-issuer zone and canonical civil window.
- Snapshot hash binds window/options/locale/exporter and scheduled display data; excludes tray, descriptions and finance.
- Common snapshot audit/quota preserved: scope calendar, resource workspace, finance false, distinct scheduled project count (zero allowed).
- Confirmed non-guests export the visible week/month grid; day and list views hide export.
- Existing dialog previews/sends/copies/saves 1600 px PNGs; MCP remains 38 tools with no scope changes.
- Shared localized formatter labels next-day midnight as 24:00; DST 23/25-hour segment assertions and six goldens updated.
- Schema, ADR amendment 4, VE-5, README and generated MCP/test-id contracts updated.

Original focused validation (before this preparatory rebase):
- `node node_modules/vitest/vitest.mjs run packages/schemas/src/view-export.test.ts packages/schemas/src/calendar-image.test.ts apps/api/src/view-export.test.ts apps/api/src/mcp-views.test.ts scripts/ui/fonts.test.ts`: 28 passed (5 files).
- `node --env-file=.env node_modules/vitest/vitest.mjs run packages/core/src/view-export.integration.test.ts`: 16 passed, including scope narrowing/revocation, member demotion, options/hash/zone and audit.
- `node node_modules/typescript/bin/tsc -p <packages/core|apps/api|apps/web>/tsconfig.json --noEmit`: clean-source checks passed all three.
- Post-browser web tsc hit generated `.next/dev/types/app/layout.ts:42` TS2344: existing optional modal prop conflicts with required generated LayoutProps.modal. No production types directory existed; tracked layout source is unchanged. Moved only this task's ignored dev/types to `/tmp/taff-calendar-dev-types-20261114`; clean-source web tsc passed again. Parent canonical build/typecheck must assess this harness artifact.
- `CARGO_TARGET_DIR=/tmp/taff-timeline-target CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path backend/Cargo.toml -p taff-render`: 16 passed; summary/timeline goldens unchanged.
- Six calendar goldens regenerated with rust-calendar-golden.mts and UPDATE_RENDER_GOLDENS=1 filtered calendar tests. Worst case remains 3728 px / 190904 bytes; localized week/month images 34953–68258 bytes.
- `node --env-file=.env node_modules/@playwright/test/cli.js test --config playwright.calendar.local.ts e2e/view-export.spec.ts -g 'calendar exports'`: 3 locales passed, 44.4 s, real PNG/save/window navigation, day/list absence.
- Temporary local harness used direct API + webpack dev on 4100/4101 and renderer 3303; no tracked config change. Existing isolated S1 test resources reused with parent authorization.
- Focused Biome, generated contracts, git diff --check: passed. No full release gate claim.

Parent owns serial rebase onto merged S1, full gate, PR/merge and deployment; S3 graph integration is separate.

Review repairs (local only):
- S1 palette fix cc24ffe inherited as 226f5d5; calendar now uses approved CSS ink/gold/outline/container and gold-mist opacity. Only six calendar goldens intentionally updated here (34923–68517 bytes); summary goldens untouched.
- Trusted fourth `listCalendar` argument `{ scheduledOnly: true }` skips the tray query only for export. Public REST/MCP/UI inputs and default truncation remain unchanged; all callers inspected.
- 200→201 unscheduled tasks leave exported hash/layout unchanged and no false warning; normal calendar still reports truncation. Scheduled-row and occurrence overflow remain reported.
- DB command above expanded with `packages/core/src/calendar.integration.test.ts`: 31 passed. Focused schema/API/MCP command above without fonts: 25 passed. Core/API typechecks passed; Biome, Rust fmt and diff checks passed.
- Full renderer command above: 17 passed, including summary/timeline goldens and palette guard. Calendar-only UPDATE_RENDER_GOLDENS=1 run: 4 passed. No browser/full release gate rerun for this internal-read/palette repair; prior browser evidence remains above.

Preparatory rebase onto frozen S1 d49be16: one conflict in the view-export spec, resolved with released v24 ff411c6 and implemented/unreleased timeline+calendar; graphs remain planned. ADR numbering OAuth2/timeline3/calendar4 and all-four-images goal preserved; calendar behavior/review-fix files unchanged from b4485e8.
Current checks: 82 pure schema/calendar-recurrence/API/MCP/font/language/test-id tests (10 files); all eight schema/db/core/API/worker/web/SW/scripts tsc targets passed. MCP/schema/calendar/test-id generation produced no drift (38 tools); focused Biome and diff checks passed.
Preparation ran no services, browser, Rust, database or full gate. Final rebase onto merged S1 was clean; canonical full gate, PR and release remain pending.
