# v0.2.27 — Function-map gaps, new backend in Rust

Status: open. Production is v0.2.26 `f4492d4` ([milestone 156](milestones/156-v0.2.26.md)).
Plan: [0004](plans/0004-function-map-gaps-in-rust.md), which holds the
tasks, the language table and rule N0. This file is the prompt and the
design for each task.

## Prompt (paste to the agent)

```text
Goal: Taff v0.2.27. Work through docs/agent-goal-v0.2.27-function-map-in-rust.md
from top to bottom without stopping. Plan 0004 lists the tasks.
Owner 2026-11-22: "yes for all, … not gate just do it". All plan 0004
decisions are approved. Do not wait for review or approval and do not print
NEEDS-DECISION for anything in this file. Where something is unclear, pick the
option closest to the design below, write it in the milestone, and keep going.
Backend in Rust (backend/crates), screens and tests in TypeScript (apps/web, e2e).
Never widen a Node route (rule N0). One task per branch and PR from the latest
main. Run the fast checks in "Execution mode" and merge yourself on green.
Run the full `pnpm check` once on the release head, then deploy with
docs/runbooks/deploy.md, which rolls back automatically.
Only the AGENTS.md hard limits stop you: shared infrastructure, secrets,
product approval and audit rules, destructive data without a tested backup.
Print one STATUS: line per merged task.
```

## Execution mode (owner, 2026-11-22)

- **No decision stops and no review waits.** The agent merges its own PRs.
- **Per PR (fast checks):**
  - `pnpm lint`, `pnpm typecheck`, and the unit tests of the packages the PR touches.
  - `pnpm check --only rust` for any change under `backend/`.
  - The browser specs the PR adds or changes.
  - Paste each command and its result into the PR body. Mark the table
    "fast checks (plan 0004 mode)" rather than calling it the gate.
- **Per release:** one full `pnpm check` on the exact release head, and its
  table goes in the release PR. A red full check is fixed on that head, never
  skipped. After that, deploy per `docs/release-closeout.md` and
  `docs/runbooks/deploy.md`: before and after snapshots, verify, roll back
  automatically on any failed check, and leave a report in `deploy/reports/`.
- **Order:** F1 → F2 → R0.1 → R0.2 → R0.3 + R0.3a → R0.4 → R0.6 → R0.7 + N1
  → N2 → N3 → N4 → release v0.2.27 → N5 → N6 → N7 → release v0.2.28 →
  Wave 1 timeline reads → N8. Parallel branches are fine wherever a later task
  does not import an earlier one.
- Each task keeps its tests, its spec change, its architecture placement, its
  function-map mark (F3) and a milestone of at most 40 lines.

## Design per task

Paths are relative to `backend/crates/` unless noted. Every new route is in
`taff-api` under a prefix that Node does not serve. Every write uses the
R0.4 helper (one transaction, an `activity` row with the actor, `NOTIFY
taff_changes`), so the Node WebSocket hub refreshes open screens unchanged.
Every authority check calls `can` in `taff-domain/src/permissions.rs`. Add an
action there, and its row in `docs/spec/permissions-matrix.md`, before you use
it. Migrations are additive SQL files that continue after
`packages/db/migrations/0043_*`, each with its Drizzle entry in
`packages/db/src/schema.ts`. Queries use sqlx `query!` with the offline
`.sqlx` data committed.

### F1 · Land the function map
Rebase `claude/trusting-bell-ylwvn9` on `main` and resolve the conflicts
(milestone numbers: keep 157–163). Run the fast checks plus
`pnpm arch:check`, then open the PR and merge it.

### F2 · Inventory reads Rust routes
`scripts/architecture/inventory.ts` collects `.route("<path>", get|post|patch|delete(...))`
from `backend/crates/taff-api/src/**/*.rs` with method and path, and treats
them the same way as the Node routes. Test: a fixture route that is not
placed makes `pnpm test` fail.

### R0.1–R0.6
Follow plan 0002, adjusted as follows:
- R0.3a: `API_RS_PORT` defaults to 3003. Check that no service in the
  compose files or the neighbour snapshot uses it.
- R0.5 (replay) is not needed for this queue. Do it after N4.

### R0.7 · taff-api in production
- Image: `deploy/Dockerfile.api-rs`, a multi-stage build that uses the
  renderer image's pinned Rust toolchain (see commit `70bd48b`).
- Service: `api-rs` in `compose.prod.yaml`. It joins Taff's own network
  only, publishes no host port, has a health check on `/api/health`, and
  takes the same `DATABASE_URL` as the Node API.
- Proxy: in Taff's Caddyfile, one `handle /api/<prefix>/*` per new prefix
  pointing at `api-rs:3003`. Traefik stays as it is.
- Rollback: delete the matcher lines and the service, then redeploy. No
  data changes.
- Add the switch and the rollback steps to `docs/runbooks/deploy.md`.

### N1 · Agent cost of a task and a project (pilot)
- Routes: `GET /api/costs/tasks/:taskId` and `GET /api/costs/projects/:projectId`.
- Response: `{ costMicros, runs, failedRuns, failedCostMicros, durationMs }`.
  It is the sum over `runs`, failed and rework runs included, scoped by
  workspace. A project sums the runs of its tasks.
- Authority: `finance:read` on the project. A task with no project needs
  workspace admin.
- Web: one line "Agent cost" in the task detail run section and one row in
  `ProjectFinancePanel`, in three locales.
- Tests: Rust integration tests against the migrated test database (with and
  without the authority, a failed run included) and one browser case. Leave
  `finance-visibility.spec.ts` untouched; it must stay green.
- Spec: `project-finance.md`, which gains PF-x for the agent cost.

### N2 · Project health update
- Table `project_updates`: `id`, `workspace_id`, `project_id`, `author_id`,
  `health` (`on_track` | `at_risk` | `off_track`), `body` (≤ 2,000 characters),
  and `created_at`. Updates are append-only.
- Routes:
  - `GET /api/project-updates?projectId=` returns the newest first, 20 at a time.
  - `POST /api/project-updates` creates one.
- Authority: the project lead and workspace admins may post; anyone who can
  read the project may read. An agent principal is always refused, and the
  test says so.
- Web: the latest health chip beside the computed risk on the timeline, plus
  a history list with a "Post update" sheet. The computed risk stays visible.
- Spec: `projects.md`.

### N3 · Related and duplicate task links
- Table `task_links`: `workspace_id`, `from_task_id`, `to_task_id`,
  `kind` (`related` | `duplicate`), `created_by`, `created_at`. It is unique on
  the pair and kind. Links run in both directions in reads, and both tasks
  are in the same workspace.
- Routes:
  - `GET /api/task-links?taskId=` lists them.
  - `POST /api/task-links` creates one.
  - `DELETE /api/task-links/:id` removes one.
- Authority: edit authority on both tasks. A deleted or archived task drops
  out of reads.
- Web: a "Links" block in task detail, using the existing task picker.
- Spec: `client-navigation.md`, or a new `tasks.md` written with
  `module-spec`.

### N4 · Acceptance criteria
- Table `task_criteria`: `id`, `workspace_id`, `task_id`, `position`, `text`
  (≤ 300 characters), `checked_by`, `checked_at`.
- Routes, under `/api/task-criteria`:
  - list, create, edit and reorder, for the task's editors;
  - `POST /:id/check` and `/:id/uncheck`, for the reviewer only.
- An agent principal can never check. The existing review decision route and
  its three fixed checks stay unchanged.
- Web: criteria in task detail, and checkboxes on the review screen above
  the decision.
- Spec: `agent-access.md` states that an agent cannot accept its own work.

### Release v0.2.27
Run the full `pnpm check` on the head. Then follow the release closeout
checklist, deploy, verify, and write milestone and deploy report.

### N5 · Time tracking
- Table `time_entries`: `id`, `workspace_id`, `task_id`, `person_id`,
  `minutes` (> 0, ≤ 1,440), `day` (date in the workspace time zone),
  `note`, `created_at`.
- Table `member_rates`: `workspace_id`, `person_id`, `rate_micros_per_hour`,
  `currency`, `valid_from`.
- Authority:
  - A person creates, edits and deletes their own entries.
  - Admins read every entry and set rates.
  - A member reads only their own rate. No agent writes.
- Web: a "Log time" control in task detail and a "My time" list under Me.

### N6 · Budget against actual cost
- Table `project_budgets`: `project_id`, `amount_micros`, `currency`.
- Route: `GET /api/costs/projects/:id/actual` returns the agent cost (N1)
  plus time × the rate valid on each day.
- Authority: `finance:read`. Rate detail is shown to admins only.
- Web: "Budget / Actual" in `ProjectFinancePanel`.

### N7 · Margin
- `GET /api/costs/projects/:id/margin` returns the payments received minus
  the actual cost (N6), each in its own currency. There is no conversion; a
  currency mismatch is reported as an error.
- Web: a row in the finance panel.

### Release v0.2.28
Same procedure as v0.2.27.

### Wave 1 timeline reads, then N8 phases
- Port the timeline GET family to Rust. The replay (R0.5) must show zero
  diffs before the matcher switches.
- Then add `project_phases` (`id`, `project_id`, `name`, `position`,
  `start`, `end`) and the phase rows in the Gantt view.

## Out of scope

- MCP tools for any of these functions. They come in plan 0001 Wave 3.
- Changes to the brief, the digest or any other Node route.
- Teams, goals, portfolios, custom fields, automations and SSO.
