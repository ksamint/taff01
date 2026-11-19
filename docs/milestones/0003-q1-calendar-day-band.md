# Plan 0003 Q1 · Calendar day band

- The day view reserves the native hour label inset below the sticky
  overnight-event band while keeping Schedule-X event markup and gestures.
- The English production baseline reproduced the 08:00 label starting 8 px
  inside the band. A production browser probe measured the label starting
  1 px below it after the change on both 412 × 915 and 1440 × 900.
- The carried-over event still opened the schedule editor on both layouts.
- Focused production Playwright passed 6/6 in 26.4 seconds. English,
  Simplified Chinese and Traditional Chinese (Hong Kong) each passed the
  new 08:00 case and the existing multi-day 44px target case.
- Lint, typecheck and three generated test ID contract checks passed. The
  initial build exited 1 after emitting a package advisory. The production
  build targeting the dedicated test API port exited 0. The full gate remains
  pending.
- Pinned Linux visual capture ran 4/4 cases on the baseline and 4/4 on the
  candidate. All four day references show the complete 08:00 label. The eight
  matched week and month outputs were byte-identical, so their existing
  approved references stay in place. Those older approvals differ from the
  matched local captures even before Q1. A read-only replay against the
  matched reference set passed 4/4 cases.
- Chromium 156.0.8078.80, Playwright 1.64.1, Linux arm64. Source trees and
  image hashes are in the [capture manifest](../ui/screenshots/plan-0003-q1-calendar-day-capture-manifest.json).
