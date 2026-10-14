# M11 — Prototype v2 intake, references and decisions

Goal: `docs/agent-goal-frontend-v2.md`; plan: `docs/frontend-v2-plan.md` §6.1
M11. Branch `claude/frontend-v2`, pull request #6 (it also carries the plan
commits from #5).

## What works

- **`main` is green again.** Before v2 started, CI on `main` was red: a
  fresh database could not be seeded on most days of the week. The
  prototype standup (`BYDAY=MO..FR`) is anchored relative to the seed date,
  and the recurrence validator rejects a weekend anchor. The anchor now moves
  to the next listed weekday; a unit test covers it, and the integration
  test pins its seed date. The phone calendar e2e expected four weekly
  occurrences in the month grid, which only holds early in a month. It now
  counts the dates the grid renders; this is a test-only change. The
  M11 head `55126cc` is green on CI.
- **ADR 0014**: prototype v2 is the UI source of truth. It records the
  four-tab navigation (inbox moves into 我的), the signed-out home (D3), the
  D5 vocabulary (待確認 / "To confirm", 請求確認), archive instead of delete
  (D4), finance visibility (D7), the mind-map and value-chain scope (D8, D9),
  subtree moves (D10), the v1 history policy (D11), the AI path (D6) and the
  full do-not-port list from plan §2.4.
- **`docs/ui/README.md`** is rewritten for v2: the design floor, navigation
  on both layouts, the screen → route → data table and the prototype data
  map. The v1 mapping is kept in `docs/ui/README-v1.md`.
- **Reference captures.** `pnpm ui:prototype-shots --v2` captures 27 phone
  and 20 desktop screens in zh and en, light and dark: 188 PNGs in
  `docs/ui/reference-v2/`, 15 MB at device scale 1. It serves `docs/ui`,
  blocks every external request, freezes the demo timers and drives the
  prototype by role and text. `--only=` and an output directory are
  supported. The README maps every screen to its files. v1 mode is unchanged.
- **Strings table.** `docs/ui/prototype-v2/strings.csv` maps 646 prototype
  strings to app keys (`prototype_key, app_key, zh-HK, en, zh-CN, source`).
  The sources are the `S` table, the Module Plan `T` table, the Relations
  table, and inline `zh ? … : …` strings and `{zh, en}` pairs. 185 rows
  reuse 154 existing keys; 461 rows propose `new:` keys. Sixteen Traditional
  fixes were applied (搜尋, 週, 註冊, 複製, 資訊, 合併, 標籤). D5 changes
  eight rows, and four mismatched pairs (開始 / "Start agent", 關係 /
  "Graph") were made consistent. `scripts/ui/strings-csv.test.ts` guards
  the CSV shape, the forbidden characters in zh-HK, key uniqueness and that
  every reused key exists. `docs/ui/prototype-v2/strings.md` explains the
  rules.

## Missing

- The strings table is not wired into the locales; screens add their keys as
  they are ported (M13 onward).
- Prototype states that only appear briefly (toasts, the changes sheet,
  confirm dialogs) are not captured. The phone mind map and relations graph
  are captured as the prototype renders them; both overflow the 390 px
  frame, so they are references for content, not layout.

## Decisions taken (delegated, plan §5)

- D1: `main` was red when v2 started, so `v0.1.0` was not tagged; v2
  releases as `v0.2.0`.
- D2: one branch and pull request per milestone, merged green.
- All other defaults are recorded in ADR 0014. ADR 0015 (M12) covers the
  planning and CRM data model.
- **Deployment handoff (2026-10-14).** A local agent with host access deploys
  (`docs/agent-goal-deploy-frontend-v2.md`). This environment publishes
  release-candidate sections in `docs/deploy.md` and never deploys itself.

## Validation

| Check | Result |
| --- | --- |
| `pnpm lint`, `typecheck`, `licence:check` | green |
| `pnpm test` | 521 + 6 tests green, run on a fresh test database |
| `pnpm build`, `build:server` | green |
| `pnpm perf:budget` | 196,207 B / 204,800 B |
| `pnpm e2e` | 132 passed before the calendar test fix; the fixed test passes in all three locales |
| `pnpm mcp:smoke` | 27 checks passed |
| CI on PR #6 at `55126cc` | `checks` and `images` green |

No UI changed in M11, so LCP, Lighthouse and the visual suite are as on
`main` (CI's LCP and Lighthouse gates passed).

## Captures

The v2 references are in `docs/ui/reference-v2/`, for example
`phone-today-zh-light.png` and `desktop-today-en-dark.png`. The app's
captures sit beside them in each screen's milestone report from M13 onward.
