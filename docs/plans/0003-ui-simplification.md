# 0003 · Agent queue: fix the screen-review findings and simplify the UI

- **Status:** ready for the local dev agent (owner, 2026-11-19: "how we
  optimize UI to simplify it"). Groups P, S and Q may start now. Group D
  waits for the owner. Nothing below has started.
- **Who executes:** the local dev agent on the operator machine. The planner
  (Claude) updates this file on a branch; the agent adopts it in its own PRs.
- **Reads first:** `AGENTS.md`, then
  [plan 0002](0002-agent-queue-fixes-and-rust-rails.md), "How to work this
  queue". The same rules apply here: one task per branch and PR, gate **F**,
  the `STATUS:` and `NEEDS-DECISION:` lines, and the list of moves that never
  pass a gate.
- **Source:** the Taff Screen Review of 2026-11-17
  (<https://claude.ai/artifact/8k9CTwV13ucWVQKtmeAA9d>, owner only): 31 screens
  of `main` at `96d037e`, production build, seeded 北風科技 and a XIDING
  organization, phone 412 × 915 (Pixel 7, zh-HK) and desktop 1440 × 900.
  Finding numbers F1–F15 below are that review's. Every number in this file
  was measured there.
- **Runs beside** plan 0002 and v0.2.26. Task S5 here replaces 0002 G2; the
  other 0002 tasks keep their order.

## Limits for every task

- **Web client only:** `apps/web`, `e2e`, locale files and specs. The backend
  is frozen for new behaviour (ADR 0032). If a task cannot meet its acceptance
  without a new route, response field or MCP tool, stop and print
  `NEEDS-DECISION`.
- **No authority change.** No task shows a control, row or link to a role that
  cannot already open its target. Test each moved link with the lowest role.
- **Budgets:** Today ships 192.8 of 200 KiB of JavaScript. No task raises it
  and none adds a dependency.
- **Reproduce first** on a production build. A finding that does not reproduce
  is closed with the evidence, not fixed.
- **Visual references:** a layout task changes committed references. Replace
  them in the same PR and put the before and after captures and the reason in
  the PR body.
- **Three locales** (en, zh-CN, zh-HK) for every new or changed string and
  every phone test.
- **Spec:** change the named spec in the same commit. Where none covers the
  screen, add the requirement to `docs/spec/client-navigation.md`.
- Sizes below are CSS pixels on the 412 × 915 phone profile.

## P · Wrong numbers and wasted requests (do these first)

| ID | Task | Tests | Acceptance | Gate |
| --- | --- | --- | --- | --- |
| P1 | **F5.** One project shows 交付進度 0% in its header and export image (the saved field, spec `projects.md` PR-1.5) and 交付進度 69% in the timeline risk line, the timeline finance strip and the AI brief (computed from tasks). Keep the saved field as 交付進度. Rename the computed value in the client (locale keys `timeline.delivery` and `brief.finance.delivery`; `projects.deliveryProgress` stays) to 任務完成度 / Task completion. If a 69% string comes from the API or the renderer, stop. | A case on the seeded project asserting the two labels differ wherever both values can appear | No screen shows two different numbers under one label; spec `projects.md` and `project-finance.md` name both values | F |
| P2 | **F1.** A cold load of Today makes 13 API calls: tasks, members, runs, me and workspace access twice each, inbox three times. Board and Organizations repeat the same pairs. Find the trigger and keep the first response. Lead, not a conclusion: `staleTime: 0` in `m3-queries.ts`, `m5-queries.ts`, `queries.ts` and `notification-queries.ts` makes server-hydrated data refetch on mount. | A browser case that counts GETs per URL during a cold load with no realtime event sent, for Today, a board and `/orgs` | No URL is requested twice; Today makes at most 6 API calls. Realtime refresh, session revocation and CN-2 behaviour unchanged (`realtime.spec.ts`, `optimistic-m3.test.ts` stay green untouched) | F |
| P3 | **F2.** Each board card calls `useTaskAccess` (`projects-scene.tsx:1312`), so a 12-card board makes 12 calls to `/api/tasks/:id/access`. Request it when the card's ⋯ menu opens or a drag starts. | Board case: zero access calls on load, one when a menu opens; a member without edit authority still cannot move or edit a card | Board cold load drops from 28 API calls to at most 9 with P2 | F |
| P4 | **F3.** `/orgs` calls `useAgent` per member row (`organizations-view.tsx:56`): 6 calls for 3 agents. Render the row from the members list and load the profile only when the row needs a field the list lacks. If the list lacks a field the collapsed row shows, stop. | `/orgs` case counting `/api/agents/:id` calls on load | Zero per-agent calls on load; `/orgs` at most 10 API calls with P2 | F |
| P5 | **F6.** 今天到期 on Today lists every open task with no due date (six of six in XIDING). The rule is `!task.dueAt \|\| …` in `apps/web/src/lib/today.ts`. Split the list into 今天到期 and 未定日期, the second collapsed with its count. | `today.spec.ts`: an undated task appears only under 未定日期 | A task without a due date never sits under 今天到期 | F |

## S · Simplify the heaviest screens

| ID | Task | Tests | Acceptance | Gate |
| --- | --- | --- | --- | --- |
| S1 | **Phone timeline (F8).** Contract amount, received and progress appear twice (the `timeline-finance` strip, then `ProjectFinancePanel`), and the chart starts at about 770 px, under the bottom bar. Keep the one-line strip; open the full panel from it (tap or disclosure, closed by default on a phone). Desktop unchanged. | `timeline.spec.ts` and `project-finance.spec.ts`: the panel's actions (編輯財務, 記錄收款) stay reachable; `finance-visibility.spec.ts` untouched and green | First chart row starts above 480 px; finance hidden from the same roles as today | F |
| S2 | **Phone project header (F8).** Six rows precede the first card, which starts at about 323 px: organization, 項目/公司/聯繫人, title, view tabs, stage and progress, status tabs. Put the organization name on the title row; show 項目/公司/聯繫人 only on the projects index; move stage and progress into the title's existing menu, keeping the stage-only control for a project lead (PR-2.3); make the view switcher one control. | Phone cases: every view still opens; companies and contacts open in at most two taps from a project; a lead changes stage; CN-3.1 still holds | First card starts above 240 px; spec `projects.md` PR-1.5 reworded for where progress shows | F |
| S3 | **Board card.** Each card spends a full row (`projects-card-footer`) on the drag handle and the ⋯ menu; a card with a title, a date and one person is about 145 px tall. Move both controls into the card's first row. | Existing drag, keyboard-move and menu cases; touch targets stay 44 px | Footer row gone; the same card is at most 120 px tall, or the reached number is reported with the reason | F |
| S4 | **Phone task detail.** Eight full-height property rows and the contacts block precede the description. Order: title, description, then 狀態, 負責人, 執行者, 截止日期; put 安排日程, 優先級, 項目, 標籤 behind one 更多 row whose closed label lists the values that are set. | Task-sheet cases: each property is still editable; `task-contacts.spec.ts` green | The description's first line is visible without scrolling for a task with a one-line title | F |
| S5 | **One settings header (F11, replaces 0002 G2).** Three back-link styles are in use and `/orgs/summaries` and `/digests` have no side gutter. Use the bordered `back-link` header of `/me/notifications` and the page gutter on `/me/mcp`, `/orgs`, `/orgs/access`, `/orgs/audit`, `/orgs/summaries`, `/summaries`, `/digests` and `/agents/:id`. | Phone case per route: header present, content inside the gutter, no horizontal scroll | One back-header component; every listed route uses it | F |
| S6 | **Me hub.** 我的 mixes work with configuration and one row is labelled 設定 › MCP (`me.mcpSettings`). Order it as work (收件箱, AI 簡報, 智能體), then one 設定 group with a plain-named row for each settings page the viewer can already open, then 偏好設定. Routes do not change. | `me.spec.ts`: member, guest and admin each see only rows whose page they can open | No breadcrumb-style label; no settings page reachable only through another settings page | F |

## D · Waits for the owner (do not start)

Printed on 2026-11-19: `NEEDS-DECISION: merge mind map and relations into one
graph view, and move Sectors and stakeholders out of the per-project view
list? — recommend yes`.

| ID | Change if the owner says yes |
| --- | --- |
| D1 | Mind map and relations become one 關係圖 view with a mode toggle; `?view=mind` and `?view=relations` keep working. |
| D2 | Sectors opens from the projects index (it already ignores the selected project) and leaves the project view list. |
| D3 | Stakeholders moves into the project's info menu and leaves the view list. |

## Q · Polish (after P and S, any order)

| ID | Task | Acceptance | Gate |
| --- | --- | --- | --- |
| Q1 | **F7.** Calendar day view: an event carried over from the previous night covers the 08:00 label. Give carried-over events a band above the time grid. | The first hour label is never covered, phone and desktop | F |
| Q2 | **F9.** Sectors: one empty state explaining tagging when no task is tagged; two or three columns on desktop; a fixed label column for the two indicator lines. Spec `operation-templates.md`. | No six-empty-block view; desktop uses the full width | F |
| Q3 | **F10.** The six XIDING setup tasks list in reverse template order on the board and Today. Sort these lists by task number when ages tie, or stop if only creation order can fix it. | Board and Today show template order | F |
| Q4 | **F12.** Audit log on a phone: stack each row as a card and give `members.insert`-style names a localized label where spec `audit.md` has one. | No one-character columns; no clipped change column | F |
| Q5 | **F13.** Hide the keyboard hint row of search on touch devices. | Hint absent on the phone profile, present on desktop | F |
| Q6 | **F14.** Mind map: the two centre labels overlap. Offset the centre label. The exported image shares this geometry: if the fix changes shared geometry, stop. | No overlapping labels at default zoom on the seed map | F |
| Q7 | **F15.** Desktop Today stops near 970 px of 1440. Put 今天到期 in a second column from 1280 px. | No blank right third at 1440 px; phone unchanged | F |
| Q8 | **F4.** Fonts transfer 155–370 KB per signed-in cold load and have no budget. Report which subsets Me (370 KB), Sectors and Audit load and why, preload only the common one, and add font bytes to `scripts/bundle-budget.mts` at the values reached. Do not change `scripts/ui/subset-fonts.py`. | Me loads no more font bytes than Today; `fonts.test.ts` green | F |

## Stop and report

Everything in `AGENTS.md`, "Stop and report", the list in plan 0002, and for
this queue: any task that needs a backend change; any change to who can see
or do something; removing or renaming a route or a `?view=` value; a JavaScript
or font budget that would have to rise.

After P5 and S6 print `NEEDS-DECISION: release P and S as v0.2.26 with the
0002 G fixes — recommend yes`. Release steps are `docs/release-closeout.md`.

## Amendments

- 2026-11-19: queue written by the planner from the 2026-11-17 screen review
  (`main` at `96d037e`). F8 is covered by S1 and S2, F11 by S5.
- 2026-11-19: owner approved D1, D2 and D3. Existing view URLs retain
  their entry points.
