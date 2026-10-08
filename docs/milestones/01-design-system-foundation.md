# Milestone 01 — Design system foundation (2026-10-08)

## What works

- The web app renders on the TABLE AI design tokens: white ground, Universe Deep
  Blue text and structure, Sundial Dark Gold for active states and the agent
  mark, hairline borders, square cards, 2px controls, Manrope (self-hosted) with
  Noto Sans TC fallbacks, Lucide icons. Light and dark themes (`data-theme`,
  system preference by default, chosen on Me, applied before first paint).
- Shell: phone bottom tab bar and desktop sidebar with Today, Calendar,
  Projects, Inbox and Me; sticky header with language and sign-out.
- Routes: `/` Today (date, greeting, agents-at-work card, new task, focus list),
  `/calendar` (next seven days by day in the user's time zone, unscheduled
  tray), `/projects` (board by status), `/inbox` (All / Reviews / Blockers with
  review items and inbox-zero state), `/me` (account, workspace, language,
  appearance).
- Three locales: `en`, `zh-CN`, `zh-HK` (ADR 0005). Only English ships in the
  initial bundle; Chinese bundles load on demand. The document `lang` is
  `zh-Hant-HK` or `zh-Hans-CN` so CJK letter-spacing rules apply. The database
  accepts `zh-HK` (migration 0002).
- Shared schemas moved to `zod/mini` with named imports. One definition still
  serves server and client; the client chunk for schemas dropped from 40 KiB to
  27 KiB gzipped.
- `pnpm perf:budget` serves the production build and fails when the Today
  page's modern JavaScript exceeds 200 KiB gzipped.

## Validation evidence

| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck` | Passed |
| `pnpm test` | 39 passed (PostgreSQL 18.4) |
| `pnpm build` | Passed; routes `/`, `/calendar`, `/projects`, `/inbox`, `/me` |
| `pnpm e2e` | 9 passed: three flows × en, zh-CN, zh-HK (Playwright 1.56 shim for this container's Chromium 141) |
| Today initial JS (modern scripts, gzipped) | 186.8 KiB of the 200 KiB budget. Before the zod change it was 200.3 KiB; the earlier 238 KiB figure wrongly counted the `noModule` polyfill. |
| Phone screenshots | Captured by the e2e run in all three locales and inspected |

## Missing

- Desktop screenshots in the e2e run (the phone project only). Visual
  regression baselines are not stored yet.
- Noto Sans TC is not self-hosted; system CJK fonts render Chinese until M7
  adds a subset.
- The prototype's remaining Today pieces (schedule strip, tap-through to task
  detail) arrive with M3 and M5.

## Open decisions

- None new. Dark theme still needs brand review (carried over).
