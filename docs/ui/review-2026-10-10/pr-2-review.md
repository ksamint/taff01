# Review of PR #2 `codex/ui-parity` at a048523 (2026-10-10)

Reviewed by checking out the branch, running every gate locally
(PostgreSQL 18.4, Valkey, the production build, Chromium 141 through
Playwright 1.56 for the browser suite) and capturing the seeded app beside
the prototype. Screens are in `pr-2/`.

## Verdict

The port is real and the phone screens now read as the prototype: compact
headers, the Today timeline with the gold now-line, the Projects board with
IDs and chips, Inbox rows with agent, time, excerpt and inline 批准 / 查看 /
延後, the Me row list, the field-row task sheet, and a desktop sidebar,
board and detail panel. This is the product we planned. It is not ready to
merge: the branch's own browser suite fails, both LCP gates fail, and two
pieces of fixture-only code make real data look worse than demo data.

## Gates on this branch

| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck`, `pnpm licence:check` | pass |
| `pnpm test` | 452 passed (one BullMQ digest case needs Valkey running; passes with it) |
| `pnpm build`, `pnpm perf:budget` | pass, 193.0 KiB Today JavaScript |
| `pnpm mcp:smoke` | pass |
| `pnpm e2e` (120 cases) | 99 passed, 21 failed: the same 7 cases in all three locales |
| `pnpm perf:lcp` en | 2,172 ms (main: 1,944 ms) |
| `pnpm perf:lcp` zh-HK | 2,416 ms (main: 2,340 ms) |

A first e2e run failed 78 cases because the development cache left over from
`main` made the dev server reload every page in a loop ("HMR hash
mismatch"); after clearing `apps/web/.next/dev` the loop was gone and the
production build never showed it. The 21 remaining failures are consistent
across locales and are the branch's:

| Case | Failure |
| --- | --- |
| calendar 257 | expects a "Calendar" heading the compact header no longer has |
| calendar 474 | two `schedule-save` buttons are mounted at once (calendar scene and task dialog) |
| calendar 817 | week grid scrolls 517 px where 44 px rows predict 528 px |
| persistence 68 | the calendar list item for the cached task is not rendered |
| planning 70 | board drag never issues the PATCH |
| planning 486 | `.history-list` no longer exists on the invitation screen |
| today 52 | the held-chunk desktop sidebar case never sees the held request |

Some are selector updates the port owes the suite; the duplicate schedule
form and the silent board drag look like regressions and need a trace each.

## Must fix before merge

1. **Task references are faked for fixture rows only.** `prototypeTaskReference`
   in `packages/schemas/src/prototype-data.ts` returns "NW-145" for seeded
   tasks and `null` otherwise, so every real task shows an eight-character
   UUID prefix (`4f0ee8b9`) in the ID slot of cards, rows and the task sheet.
   Give tasks a real number: a per-workspace sequence column and a workspace
   key, assigned in core on create, rendered everywhere the prototype shows
   `NW-141`. Then delete the fixture lookup from the client.
2. **Fixture translations in the client.** `presentPrototypeField` swaps
   seeded names, titles and roles to the viewer's locale by matching the
   stored zh-HK string against the fixture table, and ships that table in
   the bundle (`sidebar.tsx`, `me-view.tsx`, `inbox-view.tsx`,
   `task-detail-view.tsx`). Real data gets no such treatment. Seed localized
   text into the database (or seed one language) and remove the import
   from `apps/web`.
3. **Both LCP gates fail.** English regressed from 1.94 s to 2.17 s; the
   main stylesheet grew from about 6 KB to 21 KB gzipped (111 KB raw) and
   is render-blocking. The 17 stylesheet files (6,400 lines, half of them
   named `*-parity.css` beside `base.css`) are a second CSS system by
   another name. Consolidate per screen, drop duplicated rules, split
   route-only CSS out of the shared bundle, and re-measure in all three
   locales.
4. **Browser suite red** (table above).

## Should fix in this PR

- Today's "安排日程" lists every unscheduled run as a dashed block with no
  cap; the demo workspace shows dozens. Bound it like the due list (20 and
  "Show more").
- The daily digest Inbox row renders the date as both title and excerpt
  ("2026-10-10 / 2026-10-10"); the digest title should be the digest label
  and date, the excerpt its summary.
- The Inbox excerpt for seeded reviews shows the bilingual disclaimer
  "原型示例資料；未執行外部工具… / Prototype sample data; no external tools…".
  Seed one language per locale or keep the disclaimer out of excerpts.
- Desktop Projects opens on whatever project sorts first; with test data
  that is "Smoke-1791506827548". Default to the most recently updated
  project or the one with open tasks.

## Fine as is

- No API changes; the seed creates no new accounts beyond the five demo
  users, takes an advisory lock, and writes only workspace content.
- The `@modal` intercepted task route, `default.tsx` fallbacks, and the
  shell persisting across routes work in the production build.
- Visual baselines are committed per screen and locale and compared in CI
  before the behavioural flows mutate the fixture.

## Next step

Hand the agent the "must fix" list in order, with the rule that
`pnpm e2e`, `pnpm perf:lcp` in en, zh-CN and zh-HK, and `pnpm mcp:smoke`
must be green on the branch before the PR leaves draft. Merge after that;
deploy after the deploy guide's clean-checkout run on the merged commit.
