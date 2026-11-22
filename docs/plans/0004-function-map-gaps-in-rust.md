# 0004 · Agent queue: close function-map gaps, new backend in Rust

- **Status:** approved (owner, 2026-11-22: "yes for all … not gate just do
  it"). Nothing here has started. The agent goal is
  [v0.2.27](../agent-goal-v0.2.27-function-map-in-rust.md); it holds the
  prompt, the design per task, and the execution mode.
- **Who executes:** the local dev agent on the operator machine. The planner
  (Claude) updates this file on a branch, and the agent adopts it in its own PRs.
- **Reads first:** `AGENTS.md`, [plan 0001](0001-rust-backend-port.md),
  then [plan 0002](0002-agent-queue-fixes-and-rust-rails.md) "How to work
  this queue". The same rules apply here: one task per branch and PR, gate F,
  and the `STATUS:` and `NEEDS-DECISION:` lines.
- **Source:** the function map on `claude/trusting-bell-ylwvn9` (milestones
  157–163): `docs/benchmark/function-map.md` lists 86 functions in the
  catalog. Taff has 48 of them, 8 partly and 30 not at all. The open decisions
  are in `docs/benchmark/reading/2026-11-20-structure-and-review.md` §4.
- **Owner command, 2026-11-22:** "when we build new functions lets do all in
  rust". This plan applies that command to the backend. The web client stays
  TypeScript (global policy rule 1; plan 0001 table).

## Language per component

| Component | Language | Where |
| --- | --- | --- |
| New routes, domain rules, queries, jobs | Rust | `backend/crates/taff-api`, `taff-domain`, `taff-db` |
| New tables | SQL migration plus its Drizzle entry | `packages/db/migrations`, `packages/db/src/schema.ts` (sqlx owns migrations only after Wave 5) |
| Wire shapes for new routes | Rust types, then JSON Schema emitted from them | `taff-contract` writes into `packages/schemas/generated/` |
| Screens, locales, browser tests | TypeScript | `apps/web`, `e2e` |
| Function map, architecture inventory | TypeScript | `.claude/skills/func-map`, `scripts/architecture` |
| `packages/core`, `apps/api`, `apps/worker` | TypeScript, fixes only | No new route, field or MCP tool |

**Rule N0.** A new function never widens an existing Node route or response.
When a new function belongs to an existing entity (for example a task), it
becomes a new Rust sub-resource under its own path prefix. The client then
reads the two responses side by side.

## F · Land the function map (TypeScript tooling)

| ID | Task | Tests | Acceptance | Gate |
| --- | --- | --- | --- | --- |
| F1 | Rebase `claude/trusting-bell-ylwvn9` on `main` and open its PR. That branch has never run the full gate: milestone 163 records "no Docker daemon". | `pnpm check` | 18/18 steps on the exact tree; table in the PR body | F |
| F2 | `scripts/architecture/inventory.ts` reads only `apps/api`, `packages/core` and `packages/db`. Teach it the axum `.route("…", get/post(…))` calls in `backend/crates/taff-api` so a Rust route must be placed in `scripts/architecture/` like a Node route. | A fixture crate with one route: unplaced, then the test fails | The `AGENTS.md` placement rule holds for Rust routes | F |
| F3 | Mark rule: when an N task ships, its catalog id moves from `no`/`partial` to `yes` in `scripts/architecture/benchmark.ts`, in the same PR, with `where` naming the new OMV objects. | Existing benchmark test | The committed `function-map.md` matches the code | with N |

## R · Rails a production Rust route needs

Plan 0002 R0.1–R0.4 and R0.6 do this work, in its order and under its gates. R0.5
(replay) is needed for the port, not for routes that have no Node twin.
Plan 0004 adds the following:

| ID | Task | Deps | Tests | Acceptance | Gate |
| --- | --- | --- | --- | --- | --- |
| R0.3a | `API_RS_PORT` defaults to 3002, which is the renderer's port (`compose.yaml`, `compose.prod.yaml`). Choose a free port for `taff-api` before R0.3 merges. | R0.3 | Local compose with renderer and `taff-api` both up | No port shared with the renderer or with any neighbour | F |
| R0.7 | First production Rust process. Add `taff-api` to `compose.prod.yaml` and to its own image. Add one Caddy matcher per new path prefix in Taff's own Caddyfile (plan 0001 rule 4). Neither Traefik nor a neighbour's route changes. | R0.4, R0.6, R0.3a | Deploy runbook dry run: switch, check, switch back, check | Rollback is removing the matcher line and the container; deploy report lists before and after | F + deploy |

R0.7 is approved (owner, 2026-11-22). No decision stop before it.

## N · New functions (Rust backend, TypeScript screens)

Each task delivers the following in one PR. The Rust side is a handler in
`taff-api`, its rule in `taff-domain`, and its queries in `taff-db`. Every
write goes through the R0.4 helper (one transaction, an `activity` row,
`NOTIFY taff_changes`), so the existing Node hub pushes realtime updates.
The web side is screens in three locales (en, zh-CN, zh-HK). The PR also
carries the spec change, the architecture placement and the function-map mark
(F3). Every N task changes production, so each one needs gate F and a deploy.

| ID | Catalog id | Task | Schema | Who | Acceptance |
| --- | --- | --- | --- | --- | --- |
| N1 | `cost-result-including-failed` | Agent cost of a task and of a project: the sum of `runs.cost_micros` over every run, including failed runs and rework, under `/api/costs/…`. Read-only. This is the pilot for R0.7. | none | Roles that read project finance (`finance:read`, spec `project-finance.md`) | Totals equal a SQL sum on the seed; `finance-visibility.spec.ts` unchanged and green; no write path |
| N2 | `person-s-health-update` | A person posts a project health update: on track, at risk or off track, with text. It shows beside the computed risk on the timeline. | `project_updates` | Write: the project lead and admins. Read: anyone who can read the project. An agent cannot post one. | Lowest-role tests for both read and write; the computed risk is still shown; three locales |
| N3 | `other-task-links-related` | Related and duplicate links between two tasks, shown in task detail. | `task_links` | Edit authority on both tasks | A member who cannot edit one side cannot link; links to a deleted task disappear |
| N4 | `acceptance-criteria-stated-task` | Acceptance criteria on a task. The review screen shows them as checks next to the three fixed checks. The review decision route stays unchanged. | `task_criteria` | Edit: the task's editors. Ticking a criterion: the reviewer | An agent run cannot tick a criterion; spec `agent-access.md` names this |
| N5 | `time-tracking` | A person logs time against a task. | `time_entries` | Own entries; admins read all | Prerequisite for N6 |
| N6 | `budget-against-actual-cost` | Project budget compared with the actual cost (N1 agent cost plus N5 time × rate). | budget fields, rates | `finance:read` | Rates are personal data, so this needs a decision |
| N7 | `profit-margin-project` | Margin = payments received − actual cost. | none | `finance:read` | Depends on N6 |
| N8 | `phases-sections-inside-project` | Phases between project and task. The Gantt timeline route is Node, so the timeline can read phases only after Wave 1 ports its reads. | `project_phases` | Project editors | Open decision; after Wave 1 timeline reads |

Not queued: teams, goals, initiatives, portfolios, custom fields,
automations, SSO, native phone apps and integrations. Each one changes the
product contract and needs its own owner decision and plan.

MCP: plan 0001 rules out new agent capabilities, and new MCP tools in Node
would break the freeze. The N functions are therefore REST plus web only.
Agents get them when the MCP tools move to Rust (plan 0001 Wave 3).

## Stop and report

Everything in `AGENTS.md` "Stop and report" and plan 0002, plus three more
cases. First, a task that needs a new field on a Node route (rule N0). Second,
any change to Traefik, DNS or a neighbour container. Third, a role
that would see money it cannot see today.

## Decisions (owner)

2026-11-22, "yes for all", which approves the following:
- N1–N4 for v0.2.27.
- N5–N7 after N1 ships. Hourly rates are visible only to workspace admins;
  a member sees only their own entries and rate. The owner may change this
  default later.
- N8 after the timeline reads are ported to Rust, which approves the Wave 1
  timeline family.
- R0.7: `taff-api` in production for new path prefixes only.
- "Not gate just do it": no decision stops and no review waits in this
  queue. The execution mode in the agent goal replaces plan 0002's "print
  NEEDS-DECISION and wait" after R0.6 for this work.
