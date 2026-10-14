# M13 — Shell, navigation, Today, Me, Inbox, MCP, signed-out landing

Plan: `docs/frontend-v2-plan.md` §6.1 M13; decisions in ADR 0014.
Branch `m13-work`, merged as one pull request, so `main` never shows mixed
navigation (D2).

## What works

- **Prep commit.** The 32 inline `useMutation`s from 17 screen components
  are now hooks in `apps/web/src/lib/mutations/*`, with no UI change; the
  full e2e run passed 135/135 afterwards.
  - Their cache updates are pure helpers with unit tests.
  - `e2e/support/test-id-contract.md` lists 160 test ids, the role/name
    locators, the Schedule-X classes and the message keys the suites rely
    on. A Vitest check keeps it in step with the suites and the renderers.
- **Phone shell.**
  - Four tabs: 今天 · 日曆 · 項目 · 我的.
  - The badge sits on 我的. It shows **one count** (unresolved reviews plus
    blockers), the same number as Today › 待你處理 and the inbox tabs.
    Mentions stay in 全部.
  - The FAB, and one toast with 撤銷 shared by phone and desktop.
- **Desktop shell.**
  - Sidebar: organization switcher, ⌘K field, 今天 · 日曆 · 項目.
  - Fold-to-rail, remembered per person.
  - User footer carrying the same badge.
  - Today puts 新建任務 in its header in place of the FAB.
- **Today.**
  - Agents at work, showing real run status and no simulated progress.
  - 待你處理, the top three with "view all".
  - Due today.
  - The schedule timeline is gone (v2 moves it to the calendar).
  - Today still renders in one pass from the server bootstrap, which now
    includes the inbox read.
- **Me.**
  - Phone: profile; inbox row with badge; agents; organization, team, MCP;
    language (three locales) and appearance segmented controls;
    notifications; sign out.
  - Desktop: tabs 收件箱 · 智能體 · 設定 (`/me?tab=`, a real tablist).
    設定 covers organization switch and create, people and roles, invites,
    full notification settings (quiet hours, digest time), MCP and
    preferences.
  - 跳過首頁 and the demo reset are not ported.
- **Inbox.** A pushed screen on phone; `/inbox` on desktop goes to
  `/me?tab=inbox`. Rows and actions are as before. Snooze shows a toast whose
  undo sends the inverse PATCH.
- **MCP page.** v2 markup on both layouts:
  - endpoint with copy, the authorization panel and client config;
  - tokens shown once, **regenerate with confirm**, and **revoke with confirm
    and undo**. Undo uses a new `POST /api/agent-tokens/:id/restore`:
    person-only, within ten minutes, audited;
  - connected clients, tool list, integrations (all "not connected") and the
    call log.
  - Scope labels no longer lose the text before the colon.
- **Signed-out landing.** It replaces the sign-in screen and keeps the
  email, username and SMS flows with their `auth-*` test ids.
- **Deep links.** `#task=ID` opens the task once the person is signed in.

## Fixed along the way

- **LCP regression.** On the polluted local database the 待你處理 rows were
  the English LCP element and painted after a client `/api/inbox` fetch
  (2.75 s). The Today bootstrap now carries the inbox: en 816 ms, zh-CN
  960 ms, zh-HK 960 ms.
- **Tests that described removed behaviour** were changed to the v2 behaviour
  and say so in their commits: the Today schedule, the five-tab bar, quick
  add on desktop, and the inbox tab.

## Missing

- **AI 簡報** row and tab: M17.
- 公司 · 聯繫人 in the sidebar and the Projects switch: M15.
- The embedded agent profile on desktop Me keeps its v1 layout.
- Snoozed items are not listed: the API hides them until they wake.
- Tool toggles stay read-only: the server has no per-tool switch.

## Validation

| Check | Result |
| --- | --- |
| `pnpm lint`, `typecheck`, `licence:check` | green |
| `pnpm test` | green: web, core and API suites, plus the test-id contract and strings checks |
| `pnpm build`, `build:server` | green |
| `pnpm perf:budget` | Today 196,460 B / 204,800 B |
| `pnpm perf:lcp` (3 runs each) | en 816 ms, zh-CN 960 ms, zh-HK 960 ms |
| `pnpm perf:lighthouse` | 92 / 100 / 100 (performance, accessibility, best practices) in every locale |
| `pnpm e2e` | 129 passed and 6 failed on the first run. The failures were two tests describing removed behaviour; both were fixed and re-run (54 passed) |
| Visual suite | all 16 screens pass their assertions locally on a fresh seed. Baselines are recaptured on CI's Chromium with `visual-baselines.yml` and committed with this milestone |

## Captures

The v2 references are in `docs/ui/reference-v2/`, for example
`phone-today-zh-light.png`, `phone-me-en-light.png`,
`desktop-me-inbox-en-light.png` and `phone-mcp-zh-dark.png`. The app's
captures for the same screens are the committed baselines under
`e2e/__screenshots__/ui-parity.spec.ts/<project>/`: `today.png`, `me.png`,
`inbox.png`, `mcp.png`, `sidebar.png` and `tabbar.png`.
