# M17 — AI brief, suggestions and Ask taff

Branch `m17-brief` from `m16-timeline` (2026-10-14). Plan §2.4 item 12,
§4.4, §5 D6/D7 and §6.1 M17; ADR 0016 (rules-first brief and the disabled
model path); backend from Phase B (`docs/milestones/16-18-phase-b-backend.md`).
Prototype: Team Tasks Module Plan.dc.html 240–285 and 626–646; references
`docs/ui/reference-v2/phone-ai-brief-*` and `desktop-ai-brief-*`.

## What works

- **Routes.** Phone `/brief` is a full-screen modal `<dialog>` over 我的
  (focus trap, Escape, close button, focus back on the 我的 › AI 簡報 row).
  Desktop `/brief` moves to `/me?tab=brief`. Phone 我的 has the AI 簡報 row
  and desktop Me the AI 簡報 tab (收件箱 · AI 簡報 · 智能體 · 設定, arrow keys),
  both with the prototype's dot when suggested actions wait.
- **Brief** (`src/components/brief-view.tsx`, lazy; display model in
  `src/lib/brief-model.ts`, queries in `src/lib/brief-queries.ts`), over
  `GET /api/brief?scope=all` (every membership):
  - eyebrow "Daily brief · date" from the server's civil `today`;
  - greeting with the signed-in member's name (morning / afternoon /
    evening by the hour in the member's zone);
  - summary sentences built only from codes and numbers: on-track share,
    the worst project and its first reason, agents working, deliverables
    waiting (`brief.summary.*`, `brief.reason.*`);
  - tiles: due today, agents working, awaiting your confirmation (reviews +
    decidable grants + pending suggestions);
  - risk and slip forecast per project in the server's order: organization,
    name, level badge, reason sentences (blocked task, behind task, slip of
    the named milestone, dependency conflict, or "on track for"), delivery %
    and, only when the server sends finance (`finance:read`, D7), contract
    amount and fees collected with `Intl` compact currency; forecast date
    and slip days. A row opens the project timeline (switching organization
    when needed). Portfolio totals per currency (never summed across
    currencies; delivery weighted by contract amount);
  - suggested actions: a review opens `/tasks/:id/review`; a grant opens the
    task (its run panel holds the existing grant controls with expiry and
    始終允許) or the agent profile; an agent proposal opens a sheet that
    shows exactly what applying does (the subtasks, or the new start and
    duration, and the agent's own reason) with 套用 / 略過, sent with the
    suggestion's version. No one-tap approve or grant, no simulated
    progress, no static "insight"; a footer says the brief is built by
    fixed rules and no AI model is used.
- **Ask taff.** The ask field and five Try chips post to `POST /api/ask`
  (no workspace id, so the model path is never used from this screen). The
  answer renders in a polite live region: the question, a heading per
  intent (count, or "nothing is blocked" etc.), linked items (project
  timeline, task, review, grant's task, agent), and "Answered from your
  workspace data by fixed rules". An unknown question lists what can be
  answered. 429 shows `errors.rate_limited`. Works with no `AI_*` env.
- **Backend (additive, no migration).** `GET /api/brief` and `POST /api/ask`
  add optional `labels` (workspace name and key, project, task number and
  title, milestone and agent names) for exactly the ids they mention, read
  from the caller's memberships only (`loadLabels` in
  `packages/core/src/assistant.ts`). MCP `brief.get` and the model context
  are unchanged (no labels).
- **Strings.** `brief.*`, `ask.*` and `errors.rate_limited` in en, zh-HK and
  zh-CN (111 keys each, key parity test green). zh-HK follows the
  prototype table where it has a string; Chinese sentences join without
  spaces.

## Test ids

New: `me-brief`, `brief-dot`, `me-tab-brief`, `brief-overlay`,
`brief-view`, `brief-close`, `brief-greeting`, `brief-text`, `brief-stats`,
`brief-stat-dueToday|agents|toConfirm`, `brief-risks`, `brief-portfolio`,
`brief-risk` (`data-project`, `data-level`), `brief-risk-reason`,
`brief-actions`, `brief-action` (`data-kind`), `brief-action-open`,
`brief-proposal-subtasks`, `brief-proposal-apply`, `brief-proposal-dismiss`,
`ask-input`, `ask-send`, `ask-try-atRisk|needsMe|blocked|dueThisWeek|agents`,
`ask-answer`, `ask-heading`, `ask-text`, `ask-item`. No existing id changed;
`e2e/support/test-id-contract.md` regenerated.

## Decisions

- **Tiles.** The prototype's first tile, 進行中任務, has no count in the
  brief; it shows 今天到期 (`counts.dueToday`) instead of adding a new
  count. The third tile counts everything waiting for the reader, which the
  summary's "deliverables" sentence narrows to reviews.
- **Labels on the REST read only.** Titles and names come with the brief so
  the screen needs no per-workspace reads; they never reach the model or
  MCP.
- **No `@modal` intercept for `/brief`.** It grew Today's initial JS by
  about 1.4 KB; the route renders 我的 under the overlay itself instead.
- **Applying a proposal has no undo**: there is no inverse API (Phase B
  report). The sheet is the confirm step, and the toast says 已套用 / 已略過.
- **Totals weight delivery by contract amount**, rounded; a unit test shows
  the arithmetic.
- **Model path (D6)** is the Phase B adapter (ADR 0016), env-gated and
  per-workspace opt-in, off by default. This milestone adds no UI for it.

## Missing / deferred

- An admin switch for the workspace's `ai_enabled` (API exists:
  `GET|PATCH /api/workspaces/:id/ai`); Ask from the brief asks across all
  memberships and so always answers by rules.
- The prototype's "Who has the heaviest load?" question (no `load` intent in
  the rules router).
- Visual baselines for the brief (CI's `visual-baselines.yml`), Lighthouse
  and LCP runs, and the M19 288-context accessibility audit.
- Undo for an applied split or reschedule (needs an inverse API).

## Validation

| Check | Result |
| --- | --- |
| `pnpm lint`, `typecheck`, `licence:check` | green |
| `pnpm test` (private `taff_br_test`) | 78 files, 848 tests green |
| `brief-model.test.ts` | 15 tests: Northwind on 2026-10-08 renders exactly `buildPlanModel(northwind())` (medium, blocked by NW-144, 69 % delivered, 40 % collected, forecast Oct 15); slip names the v2.4 milestone (2 days, Oct 12 fixture); totals HK$1.64M / HK$692K / 42 % / 54 % |
| `assistant.integration.test.ts` | labels only with `{ labels: true }`, outsider sees none of the workspace |
| `pnpm build`, `build:server` | green |
| `BUDGET_PORT=3815 pnpm perf:budget` | Today 194,385 B / 204,800 (M16 rebuilt here: 193,534; +853 B in Next's shared runtime chunk) |
| `e2e/brief.spec.ts` | 9/9 (3 tests × en, zh-CN, zh-HK) on the private stack |
| `e2e/me.spec.ts`, `e2e/today.spec.ts` (all locales) | 3/3 and 12/12 |
| `e2e/accessibility.spec.ts` (en) | 1/1 |

Private stack: DB `taff_br_dev` / `taff_br_test`, API 3801, web dev 3800
(`CI=` so Playwright reuses them). Manual captures (phone and desktop, en
and zh-HK, light and dark) were compared with the reference-v2 brief
captures; they are not committed.
