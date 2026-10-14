# M16 — Timeline and relations graph

Branch `m16-timeline` from `m15-crm` (2026-10-14). Plan §3, §4.1, §4.3,
M16, D9 and D10; ADR 0015 (planning implementation notes and the M16
relations graph notes); backend from M12 and Phase B
(`docs/milestones/12-planning-crm-backend.md`, `16-18-phase-b-backend.md`).

## What works

- **Timeline** — `/projects/[id]?view=timeline` (lazy `TimelineView`,
  `src/components/timeline-view.tsx`, `src/styles/timeline.css`). A
  hand-rolled SVG Gantt over `GET /api/projects/:id/timeline`; the client
  renders the server's model and never recomputes it.
  - Day and week zoom; the view opens three days before today. Week labels,
    day numbers, weekends and the today tick come from pure helpers in
    `src/lib/timeline-geometry.ts`.
  - Rows in the server's order, subtasks indented by `depth`, parent rows as
    summary bars, milestones as diamonds at the end of their day.
  - Bars filled for people and dashed for agents, progress fill, a red
    border when blocked, a dashed red border when an incoming dependency
    conflicts, a gold ring on the critical path (toggle 關鍵路徑, on by
    default), red arrows for conflicting links.
  - Risk level and reason codes localized from `timeline.risk.*`, forecast
    end, slip days and delivery percent; the finance row (amount, collected,
    collected %, `Intl` currency) shows only when `risk.finance` and a
    contract amount are present (admins, D7).
  - **Drag to move** a bar or milestone (`PATCH /api/tasks/:id/plan` with the
    plan `version`, absent before the first plan; parent bars send
    `shiftChildren: true`, D10; milestones `PATCH /api/milestones/:id
    {version, date}`). **Resize** the right edge. **Link** by dragging from
    the dot at a bar's end onto another row, or in 連線模式 by picking the
    predecessor and then the successor. **Click an arrow** to remove it.
  - Every change toasts (已改期 / 已調整工期 / 已加入依賴 / 已移除依賴) with
    撤銷, whose undo calls the inverse API: the plan PATCH with the *new*
    version and the old dates, `DELETE /api/dependencies/:id` for an added
    link, and `POST /api/dependencies` from the deleted row returned by
    DELETE. A 409 (cycle) shows 會形成循環依賴，未加入; a duplicate is
    caught on the client with 依賴已存在 and never sent.
  - Writes are optimistic on the timeline cache (`applyPlanChange` shifts a
    subtree like the server does), roll back on error, and invalidate the
    `timeline`, `milestones`, `graph`, `tasks`, `task`, `calendar`,
    `task-calendar` and `brief` families when settled.
  - **Keyboard and form alternative.** Each row label is a button with a
    screen-reader label (reference, title, dates, duration, worker,
    progress and flags); ↑/↓ move the selection and focus. The selection
    footer edits start date and duration (milestones: date; parent duration
    follows its subtasks), lists predecessors with named remove buttons,
    adds a predecessor from a select, and links to 在任務中打開 and 在關係圖
    顯示. Hit targets for resize and link handles are 24 px on desktop and
    44 px on phone; rows are 36 / 44 px.
  - Rows virtualize past 200 (`visibleRows`, 8 rows overscan); arrows draw
    only when one end is in the window.
- **Relations graph** — `/projects/[id]?view=relations` (lazy
  `RelationsView`, `src/components/relations-view.tsx`,
  `src/styles/relations.css`) over `GET /api/workspaces/:id/graph`.
  - Layouts in `src/lib/graph-layout.ts`: **結構 (layered)** columns
    contact → company → workspace → project → task → person/agent, tasks in
    reading order with subtasks indented, other columns at the mean height
    of their neighbours and spread apart; **自由 (force)** a deterministic
    simulation (FNV-1a hash + mulberry32 seed, pairwise repulsion, springs,
    centring, 260 cooling steps, 80 past 400 nodes). Both are independent of
    input order.
  - Pan by dragging, wheel zoom around the cursor (non-passive listener),
    two-finger pinch, zoom in/out and 適應畫面 buttons. Labels stay 12 px on
    screen at any zoom and hide below 55 % zoom except the selection.
  - Layer chips (全部, 人員 ↔ 任務, 任務依賴, 項目 ↔ 公司, 聯絡人 — the CRM
    chip only when `crmVisible`) filter on the client; the graph is fetched
    once per scope. Structural nodes always show; people and CRM records
    show through a visible edge.
  - Scope select: this project (default when one is selected) or the whole
    workspace. Query key `["graph", workspaceId, projectId | "workspace"]`.
  - Inspector: kind, reference, status, role or detail, 在任務中打開 and
    在時間線打開 (`?view=timeline&task=` selects the row), and the relations
    list (edge label by direction, e.g. 依賴 / 被依賴). With nothing
    selected it lists every node in reading order. Choosing from a list
    selects the node, centres it and moves focus to the inspector heading,
    so every node is reachable by keyboard.
  - **以列表顯示** renders the same nodes, relations and actions without the
    canvas.
- **Wiring** — `projects-view.tsx` lazy-imports both views; `PLANNED_VIEWS`
  is now only `["mind"]`. Queries in `src/lib/timeline-queries.ts` and
  `src/lib/graph-queries.ts`, mutations in `src/lib/mutations/timeline.ts`.
- **Strings** — `timeline.*` and `relations.*` in en, zh-CN and zh-HK
  (zh-HK from the prototype strings table where it has them).

## Test ids

New: `timeline-view`, `timeline-pick-project`, `timeline-empty`,
`timeline-zoom-day|week`, `timeline-critical`, `timeline-link-mode`,
`timeline-link-hint`, `timeline-risk`, `timeline-finance`, `timeline-row`
(`data-id`), `timeline-bar` (`data-id`, `data-start`, `data-end`),
`timeline-bar-body`, `timeline-bar-resize`, `timeline-bar-link`,
`timeline-dependency` (`data-from`, `data-to`), `timeline-dependency-hit`,
`timeline-footer`, `timeline-start`, `timeline-duration`, `timeline-save`,
`timeline-predecessor`, `timeline-predecessor-remove`,
`timeline-add-predecessor`, `timeline-add-predecessor-submit`,
`timeline-open-task`, `timeline-show-relations`; `relations-view`,
`relations-layout-layered|force`, `relations-layer-all|people|dependencies|org|crm`,
`relations-scope`, `relations-as-list`, `relations-node` (`data-key`),
`relations-node-hit`, `relations-zoom-in|out`, `relations-fit`,
`relations-inspector`, `relations-inspector-title`, `relations-node-button`,
`relations-relation`, `relations-open-task`, `relations-open-timeline`,
`relations-list`, `relations-list-node`, `relations-list-open-task`,
`relations-list-open-timeline`, `relations-empty`. No existing id changed.

## Decisions

- **No library.** Gantt and graph are hand-rolled SVG; no new client
  dependency, so no ADR. The force layout is a fixed-step synchronous
  simulation rather than an animated one: deterministic output, testable,
  and no frame loop.
- **Fetch all layers once.** The chips filter on the client, so toggling a
  layer is instant and does not refetch.
- **Duplicates are caught on the client** from the cached model; the server
  409 is shown as the cycle message (the API does not distinguish cycle and
  duplicate in its error code).
- **Undo of a first plan** sets the plan back to the default dates the
  timeline showed (there is no "delete plan" API); the visible result is
  the same.
- **Dates** are civil dates from the server (`today` already in the
  member's zone, ADR 0015) formatted with `Intl.DateTimeFormat` in UTC so
  the browser's zone cannot shift them.
- **Toast copy** follows the prototype (`T.moved`, `T.resized`,
  `T.depAdded`, `T.depRemoved`, `T.cycle`, `T.depExists`).

## Missing / deferred

- Milestone create, rename and archive UI (the API exists; the timeline
  only moves milestones and links them).
- The portfolio mode (`T.portfolio`, several projects on one timeline) and
  the project select inside the timeline toolbar; the projects header
  already switches projects.
- Visual baselines for both screens (generated on CI's Chromium through
  `visual-baselines.yml`, plan rule) and a Lighthouse pass.
- Arrow keys do not nudge dates directly; the footer form is the keyboard
  path. Arrows on the canvas are not tab stops (the footer lists and
  removes predecessors).
- The graph has no node dragging; positions come only from the layouts.
- Fractional `behindDays` from the plan model show as-is (e.g. 落後 1.5
  天).

## Validation

- `pnpm lint` — clean (406 files).
- `pnpm typecheck` — 6/6 packages.
- `node --env-file=.env node_modules/vitest/vitest.mjs run apps/web scripts`
  — 26 files, 152 tests, including `timeline-geometry.test.ts` (date ↔ x,
  snapping, scale, ticks, arrows, virtualization, optimistic subtree moves)
  and `graph-layout.test.ts` (layer filter, reading order, layered columns,
  determinism of both layouts, fit and zoom). Test-id contract regenerated.
- `pnpm build` — passes.
- `BUDGET_PORT=3915 pnpm perf:budget` — Today initial JS 193,534 B gzipped
  (budget 204,800; M15 was 193,453, +81 B of chunk map for the two new lazy
  chunks).
- Private stack (DB `taff_tl_dev`, API 3901, web dev 3900):
  `e2e/timeline.spec.ts` — 9/9 passed (3 tests × en, zh-CN, zh-HK, Pixel
  7): mouse move with undo, resize, footer edit with arrow-key selection and
  undo; dependency by drag, by link mode and by form; arrow-click removal
  with undo; cycle rejected with the 409 toast; open a task from the
  inspector (reached from the relations list by keyboard) and from "as
  list". `e2e/crm.spec.ts` and `e2e/accessibility.spec.ts` (en) still pass.
- Manual screenshots on the Northwind seed (desktop light, phone dark)
  checked against `docs/ui/reference-v2/*timeline*` and `*relations*`.
