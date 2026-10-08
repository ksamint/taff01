# Milestone 06 — Calendar and recurrence

## Working behavior

- Calendar uses Schedule-X day, week and month views, with a list alternative,
  an unscheduled tray and a separate agent lane in the day view. The lane shows
  actual assigned-agent schedules. It does not invent agent execution timing.
- Mouse and native touch gestures move and resize schedules. Touch cancellation
  restores the original event. Month mouse and touch dragging, horizontal phone week
  navigation and keyboard event selection have direct browser coverage.
  Empty slots create a task and its schedule in one transaction.
- Schedules remain separate from task deadlines. Writes share the task version,
  authorization, audit and transactional notifications. Undo uses the returned
  version; intervening writes conflict safely. Stale or denied edits retain
  their draft, restore optimistic caches and reconcile after settlement.
- Daily, weekday, weekly and monthly presets and a bounded custom RRULE subset
  support whole-series edits. Core expands occurrences in the saved schedule's
  time zone, independent of later profile changes. DST gaps, folds, non-hour
  transitions, month-end skips, fixed offsets and ancient anchors are covered.
  Unchanged instants retain seconds and explicitly chosen second-fold anchors.
- Range and expansion limits protect reads. Deterministic occurrence identities
  and authoritative permission flags reach REST and MCP adapters. Twenty MCP
  tools include calendar list/set and atomic task creation with a schedule;
  the existing calendar.schedule tool retains its deadline behavior.
- All strings cover en, zh-CN and zh-HK, including the calendar's own dictionary.
  Phone layouts contain week scrolling, wrap long titles and keep the narrow
  agent resize handle usable. Light, dark and live system theme changes use the
  application's tokens. User text remains escaped by the native renderer.

Migrations 0012–0014 add schedules, audit/notification support and an exact
168-hour duration constraint without deleting existing data. The contract is in
[calendar.md](../calendar.md). [ADR 0006](../adr/0006-calendar-schedules-and-free-gestures.md)
records the route-only bundle exception and exact free MIT gesture/polyfill
pins. Schedule-X, Preact and signals are MIT; RRULE is BSD-3-Clause and
temporal-spec is ISC. Resize's complete MIT licence is verified from its
published file despite the missing package metadata field.

## Validation

| Check | Result |
| --- | --- |
| `pnpm lint` | 135 files, passed |
| `pnpm typecheck` | All six packages passed |
| `pnpm test` | 337 tests in 21 files passed |
| `pnpm build` | Production build passed |
| `pnpm e2e` | Full 57-case suite passed; final six focused cases passed across three locales, covering 60 unique cases including the added recovery regression |
| `pnpm mcp:smoke` | All 20 tools passed against the running API |
| `pnpm perf:budget` | 204,779 bytes gzipped, below the 204,800-byte limit |

An additional authenticated production browser check loads a real Today task
in each locale and measures all requested modern scripts: eleven scripts and
204,779 bytes in each language. Disabling navigation prefetch removes unrelated
tab scripts from Today. The remaining 21-byte headroom is small; M7 must reduce
the bundle before adding persistence. LCP and Lighthouse measurements remain M7.

Independent core and web review found no remaining blockers after repairs.
PostgreSQL tests cover atomic creation, shared-version races, scope/grant and
workspace boundaries, overlap/caps, audit delivery, rollback silence and the
elapsed-duration invariant across DST. API tests validate calendar bodies and
ranges before core and preserve conflicts. Real MCP smoke verifies recurring
creation, list/set/clear, deadlines, review, rate limiting and revocation.

Forty-eight desktop and 393-pixel phone captures cover day/week/month/list,
editing, the agent lane and actual light/dark controls in all three locales.
No browser runtime error or horizontal page overflow remains. Gesture tests
use real mouse and CDP native touch events, including cancellation; failures
were repaired without replacing gestures with API-only updates.
The final recovery regression forces a failed members request, checks localized
errors and disabled schedule actions, retries without losing the open editor's
baseline or draft, and verifies one successful schedule write after recovery.

## Missing work and decisions

M7–M9 remain: IndexedDB persistence, PWA and notification preferences/digests,
full runtime performance measurements, production and CI, release accessibility
and locale QA, and prototype seed data. Recurrence exceptions and independent
occurrence completion are outside the approved calendar contract. No offline
write queue is implemented. External runtimes still supply agent run events.

No open licence, deletion, publication or stack decision. Continue to M7.
