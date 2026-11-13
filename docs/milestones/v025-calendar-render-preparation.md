# S2 calendar renderer preparation

Status: local module preparation; public integration and release remain pending.
Base: origin/main `692a44ac235cabffef5c6b7e57c0e68e44c0bf92`.
Dependency boundary: `2247166101f300440931d9f466f66a7916ca0405` (cherry-pick of S1 `52690d4`).
Parent can drop that dependency with rebase --onto the merged S1 main at this boundary.
TypeScript target: shared typed calendar window/layout. Rust target: stateless PNG renderer.

- `calendarImageWindow({mode,visibleDate,timeZone})` validates week/month, civil date and IANA zone.
- Returns startDate/exclusive endDate, canonical zone, from/exclusive to for authorized listCalendar.
- `buildCalendarLayout(source,query,locale,labels,contentHash)` receives CalendarViewData and explicit translations.
- Labels: title/subtitle/allDay/footer/sourceTruncated, date(civil), weekday(civil), time(start,end,zone), more(count).
- Send `{layout,watermark:{text,contentHash},contentHash}` to `/render/calendar`; renderer `calendar-1`.
- Monday weeks; 4–6 surrounding weeks per month; civil-day intersection, exclusive ends and occurrence dedupe.
- Midnight-to-later-midnight spans are all-day even across DST. EOD .999 ms remains timed; no source allDay flag.
- Eight items total/day, localized known overflow; source.truncated is a separate unknown-overflow note.
- Six real PNG goldens: week 716 px / 34868–41720 bytes; month 1654 px / 59000–68241 bytes.
- Worst six-week separate-band case: 3728 px / 190904 bytes. Limit: 1600 wide, 4000 high, 400 KB.
- Spec VE-5 describes internal behavior and parent integration contract.

Validation:
- `node node_modules/vitest/vitest.mjs run packages/schemas/src/calendar-image.test.ts packages/schemas/src/timeline-image.test.ts`: 18 passed (13 calendar + 5 timeline).
- `node node_modules/typescript/bin/tsc -p packages/schemas/tsconfig.json --noEmit`: passed.
- `node --import tsx apps/api/scripts/summary-schema-gen.mts`: generated schemas.
- `node --import tsx scripts/rust-calendar-golden.mts`: generated six locale/mode inputs; deterministic regeneration.
- `CARGO_TARGET_DIR=/tmp/taff-timeline-target CARGO_BUILD_JOBS=2 cargo test --locked --offline --manifest-path backend/Cargo.toml -p taff-render`: 16 passed, existing summary/timeline goldens unchanged.
- Focused Biome, Rust formatting, git diff --check: passed. Week en and month zh-CN visually inspected.

Pending parent: viewer's visible date/mode (day unsupported), permissions, rate limit, audit, snapshot hash,
REST/MCP/button wiring, README/status, full release gate and deployment. No full S2 completion claim.
No credentials, production, services, CI/runners, push or PR changed. Temporary read-only dependency links removed.
