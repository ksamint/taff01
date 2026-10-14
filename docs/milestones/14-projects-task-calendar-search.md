# M14 — Projects, task detail, calendar, search

Plan: `docs/frontend-v2-plan.md` §6.1 M14; decisions in ADR 0014. Branch
`m14-work` (built on `m13-work`). The R1 release checklist (plan §6.0) also
rides this pull request.

## What works

- **Projects (v2).**
  - **Phone:** the 看板 · 列表 · 時間線 · 更多 switch, status tabs with
    counts, and board cards.
  - **Desktop:** a four-column board, a table list and filter chips.
  - **Status moves:** they go through an extracted optimistic hook that sends
    `version`, rolls back on error and shows a toast with 撤銷. Undo is the
    inverse PATCH.
  - **Finance fields:** included in the optimistic project shape (admins
    only, per D7).
- **Vocabulary (D5).** `needs_review` reads 待確認 / "To confirm" (zh-CN
  待确认) everywhere. The nouns of the review workspace stay 審核.
- **Task detail (v2).**
  - **Layout:** field rows, subtasks and activity. On desktop it opens in
    the right detail panel, with a status control, description and comment
    input.
  - **聯繫人 (contacts):** add and remove task contact links. Each change
    shows a toast with undo.
  - **Grants:** desktop grants keep 始終允許 (always allow).
  - **Review:** 要求修改 opens the comment input instead of acting silently.
- **Calendar (v2).**
  - **Views:** day, week and month, with the unscheduled tray.
  - **Desktop:** adds 今天 and click-to-create.
  - **Moves:** follow `docs/calendar.md` with undo; only the timeline edits
    plan dates.
- **⌘K search.** Covers tasks, comments, companies and contacts. On desktop
  the results open inside the active layout.
- **R1 release checklist** (`pnpm release:stack`, `pnpm release:checklist`):
  - **Production-mode stack:** builds, migrates and seeds a local stack on
    private ports.
  - **Checklist:** runs plan §6.0 on phone and desktop in en and zh-HK.
  - **MCP round trip:** a real `@modelcontextprotocol/client` session calls
    every tool. The round trip is shared with `pnpm mcp:smoke`.
  - **Result:** 32/32 checks passed, and all 38 MCP tools completed the round
    trip.

## Missing

- 時間線 (timeline) and 關係圖 (relations) views: M16, now on branch
  `m16-timeline`.
- 相關方 (stakeholders) and the 公司 · 聯繫人 screens: M15.
- Mind map: M18.
- Checklist items skipped with a recorded reason:
  - SMS sign-in, because SMS is disabled locally;
  - the owner/role-change mail, which needs `RELEASE_MAIL_LOG` or a verified
    demo account;
  - the rate-limit probe (`RELEASE_SKIP_RATE_LIMIT`), because Better Auth
    rate-limits repeated sign-ins in production mode.

## Open decisions

None blocking. Notes from the checklist run:

- **Unverified email:** the demo account's address is not verified.
- **Digest radio:** it needed a retry while a save was in flight.
- **Phone status:** it shows "done" slightly before the API confirms it.

They are tracked for M19 QA.

## Validation

| Check | Result |
| --- | --- |
| `pnpm lint`, `typecheck`, `licence:check` | green |
| `pnpm test` | 683 / 683 |
| `pnpm build`, `build:server` | green |
| `pnpm perf:budget` | Today 193,325 B / 204,800 B |
| `pnpm e2e` | 141 / 141 |
| `pnpm mcp:smoke` | passed |
| `pnpm perf:lcp` (median of 3) | en 792 ms, zh-CN 1020 ms, zh-HK 980 ms (limit 2000) |
| `pnpm perf:lighthouse` | en 92/100/100, zh-CN 93/100/100, zh-HK 94/100/100 (performance / accessibility / best practices) |
| `pnpm release:checklist` | 32 / 32; MCP round trip 38 / 38 tools |
| Visual suite | Baselines recaptured on CI's Chromium with `visual-baselines.yml` (source `09de9e0`) and committed with this milestone |

One local unit failure was investigated and found not to be a code defect.
`prototype-seed.integration.test.ts` counted 10 roles where it expects 11.
`taff_test` was missing fixture link `nw 9` and its role: a test version from
before the restore step removed them at 01:13. Re-inserting the two rows,
exactly as the test's restore step does, made the file pass 7/7. CI uses a
fresh database.

## Captures

- **Prototype references:** `docs/ui/reference-v2/`, for example
  `phone-projects-board-*`, `phone-projects-list-*`, `desktop-board-*`,
  `desktop-list-*`, `phone-task-detail-*`, `desktop-detail-panel-*`,
  `phone-calendar-{day,week,month}-*`, `desktop-calendar-*`,
  `phone-search-*` and `desktop-palette-*`.
- **App captures:** the committed baselines under
  `e2e/__screenshots__/ui-parity.spec.ts/<project>/`, namely
  `projects.png`, `projects-list.png`, `task-detail.png`, `calendar.png`,
  `calendar-week.png`, `calendar-month.png` and `search.png`.
