# Plan 0003 Q1 · Calendar day band

- The day view reserves the native hour label inset below the sticky
  overnight-event band while keeping Schedule-X event markup and gestures.
- The English production baseline reproduced the 08:00 label starting 8 px
  inside the band. A production browser probe measured the label starting
  1 px below it after the change on both 412 × 915 and 1440 × 900.
- The carried-over event still opened the schedule editor on both layouts.
- Lint, typecheck and three generated test ID contract checks passed. The
  Next build compiled and produced the candidate routes but exited 1 after
  emitting a package advisory. Full gate and pinned visual runs are pending.
