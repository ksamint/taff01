# v0.2.30 to v0.2.33 — Ship the review fix, export and agent reads in Rust

Status: open. Production is v0.2.29 `90062e4` ([milestone 184](milestones/184-v0.2.29.md)).
Plan: [0004](plans/0004-function-map-gaps-in-rust.md), "Decisions of
2026-11-28", which holds the task table. This file is the prompt and the
design for each task. Source of the tasks: the planner's review of `main` at
`30d1e96` on 2026-11-28.

Owner, 2026-11-28: "prepare plan for agent to dev with no gate to complete
current pr and plan". Pasting the prompt below is the owner's word to start.
It covers four production deploys.

## Prompt (paste to the agent)

```text
Goal: Taff v0.2.30 to v0.2.33. Work through
docs/agent-goal-v0.2.30-agent-reads-and-export.md from top to bottom without
stopping. It is on main once PR 139 is merged; until then read it on
origin/claude/sweet-gates-88eygu.
Plan 0004 "Decisions of 2026-11-28" lists the tasks. Owner 2026-11-28:
"dev with no gate". Do not wait for review or approval and do not print
NEEDS-DECISION for anything in that file. Where something is unclear, pick the
option closest to the design, write it in the milestone, and keep going.
Backend in Rust (backend/crates), screens and tests in TypeScript. Never widen
a Node route or add a Node MCP tool. One task per branch and PR from the
latest main. Run the fast checks in "Execution mode" and merge yourself on
green. Run the full `pnpm check` once on each release head, then deploy with
docs/runbooks/deploy.md, which rolls back automatically.
Only the AGENTS.md hard limits and the stops in that file stop you.
Print one STATUS: line per merged task and per deploy.
```

## Execution mode

The mode of the [v0.2.27 goal](agent-goal-v0.2.27-function-map-in-rust.md)
continues unchanged:

- **No decision stops and no review waits.** The agent merges its own PRs.
- **Per PR:** fast checks (`pnpm lint`, `pnpm typecheck`, the unit tests of
  the packages touched, `pnpm check --only rust` for `backend/`, the browser
  specs added or changed). The PR body carries the table, marked "fast checks
  (plan 0004 mode)".
- **Per release:** one full `pnpm check` on the exact release head on the
  operator machine. A red check is fixed on that head, never skipped. Then
  deploy per `docs/release-closeout.md` and `docs/runbooks/deploy.md`, with
  the report in `deploy/reports/`.
- **Order and releases:**
  - v0.2.30: P0 → H1 → V30.
  - v0.2.31: S1 → A2.
  - v0.2.32: R0.5b → A1a → A1b.
  - v0.2.33: A1c → A3.
- Each task keeps its tests, its spec change, its architecture placement and
  a milestone of at most 40 lines, numbered from 186.

## Design per task

### P0 · Adopt the planner branch
[PR 139](https://github.com/ksamint/taff01/pull/139) takes
`claude/sweet-gates-88eygu` onto `main`: this file, the plan 0004 section and
the `AGENTS.md` line. Merge it if it is still open. One more docs PR adds the missing
`CHANGELOG.md` entries for v0.2.27, v0.2.28 and v0.2.29 from milestones 176,
180 and 184, and corrects the status lines of plan 0001 and the v0.2.27 goal.

### H1 · Architecture placement
`scripts/architecture/modules.ts`: the Sign-in pattern `^/api/me` also takes
`/api/members` and `/api/member-rates`. Narrow it to `^/api/me(/|$)`, run
`pnpm arch:gen` and `pnpm arch:map`, and commit the results. Add one test
line that fails if either route returns to Sign-in.

### V30 · Release v0.2.30
Release head: `main` after P0 and H1. The runtime change since v0.2.29 is
`apps/web/src/components/timeline-scene.tsx` (PR 138). Expect no migration,
environment, compose or Caddy change; if the head needs one, stop. Add the
v0.2.30 changelog entry in the closeout docs PR.

### S1 · Sessions stay fresh on the Rust reads
Open follow-up of [milestone 185](milestones/185-plan-0004-review.md). Rust
validates a session read-only and never extends it. Add one browser test: a
session old enough to be renewed opens only the Gantt, and its expiry must
move. If it does not, make the web shell call the Node route that renews, in
`apps/web`. Rust never writes a session (plan 0001 Wave 4).

### A2 · The exported Gantt matches the screen
- Route: `taff-api` serves `GET /api/workspaces/:id/view-image` when
  `view=timeline`. Taff's Caddyfile gains one matcher on method, path and
  `query view=timeline`. Every other view stays on Node.
- Port `buildTimelineLayout` (`packages/schemas/src/timeline-image.ts`) to
  Rust. Golden: the three locale fixtures give the same layout JSON.
  `taff-api` calls `taff-render` in process (plan 0001 Wave 2).
- **Parity first.** For a project with no phases the Rust response equals
  Node's: content hash, headers, the `view.export` audit row, the shared
  export quota in Valkey, and every refusal (guest, unconfirmed, agent
  bearer, bad arguments). Replay shows zero differences in three profiles
  before the matcher switches.
- **Then phases.** `timelineLayoutSchema` gains optional phase spans; Node
  never sets them. Rust reads `project_phases` in saved order and draws the
  spans as `timeline-scene.tsx` does. The content hash covers them. Image
  limits stay: 1600 px wide, at most 4000 px high and 400 KB.
- Health: where the image already shows the computed risk, add the latest
  health update beside it. If it shows no risk, leave health out and say so.
- Spec: `view-export.md` and `projects.md` PR-5; note in ADR 0031.

### R0.5b · Replay covers MCP calls
Second open follow-up of milestone 185. `scripts/replay` records and compares
`tools/list` and every read-only `tools/call` of `pnpm mcp:smoke`, Node
direct against Node through the front of A1b, in the legacy and the modern
protocol. Write exchanges compare status and shape with identifiers masked.

### A1a · The agent principal in Rust, read-only
- `taff-db` and `taff-domain` resolve a bearer token to the same principal
  as `authenticateAgentToken` and `resolveAgentWorkspace`
  (`packages/core/src/index.ts`): token by `hash_token`, agent member,
  workspace (home, a granted `workspaceId`, or the OAuth workspace),
  effective scopes, capabilities and review policy.
- Parity fixtures from Node for every token state on the seed: active,
  revoked token, revoked grant, restored grant, expired access, narrowed
  scopes, archived workspace, `all_organizations` policy, personal workspace.
- Rust never issues, extends or restores access. Nothing serves this yet, so
  it merges on `pnpm check --only rust`.

### A1b · taff-api fronts `/mcp`, pass-through only
- `taff-api` forwards every `/mcp` request to the Node API and returns the
  response unchanged, including the 401 challenge and the 429. It adds no
  authentication, no limiter hit and no call log: Node still does each once.
- `MCP_UPSTREAM_URL` for `api-rs` is an internal address, not a secret.
- Proxy: one matcher for `/mcp` and `/mcp/*` to `api-rs:3003` in Taff's
  Caddyfile. Rollback is removing that line.
- Acceptance: R0.5b shows zero differences; `pnpm mcp:smoke` passes its 69
  assertions through the front; an image tool that runs for seconds is not
  cut short. Record the decision as ADR 0034.

### A1c · Four read tools for agents
- Tools: `tasks.criteria.list`, `tasks.links.list` (argument `taskId`),
  `projects.phases.list`, `projects.updates.list` (argument `projectId`).
  Each takes the optional `workspaceId`, is read-only, needs `tasks:read`,
  and returns the shape of the matching REST read from `taff-contract`.
- The front answers these four itself: one limiter hit on the key Node uses
  (`apps/api/src/rate-limit.ts`), the principal of A1a, the same `can` check
  a person's read passes, one `mcp_calls` row. For `tools/list` it forwards
  to Node and appends the four definitions. Everything else still forwards.
- `api-rs` reads `TOKEN_PEPPER` and the Valkey address from the variables the
  Node API already has in `compose.prod.yaml`. No new secret; no value is
  printed or committed.
- Access tests (`AGENTS.md`, access changes), per tool: with only
  `tasks:read`; without it; after the token is revoked; after the grant is
  revoked; after the workspace is archived; with an id from another
  workspace. Each refusal matches how a Node tool refuses.
- Bookkeeping: `inventory.ts` reads the Rust tools so placement is enforced;
  `mcp-tools.json` and `pnpm mcp:smoke` cover 42 tools; `owner-checks.md`
  expects 42; spec `agent-access.md` gains the rule; the function map notes it.

### A3 · The agent's Gantt image has phases
The front answers `views.image` with `view=timeline` using the export code of
A2 and the agent principal: both `tasks:read` and `summaries:read`, the agent
watermark, the shared quota. Parity with Node first, then phases. Other views
forward to Node.

## Stays closed to agents

Agent cost, budget, margin and member rates (finance is not shown to agents),
posting a health update (N2), ticking a criterion (AA-5.8), and every write
to criteria, links, phases and time entries.

## Stop and report

`AGENTS.md` "Stop and report" and plan 0004, plus:

- a `/mcp` or export difference that cannot reach zero without changing
  shipped behaviour;
- any need for a new secret, or for a secret's value outside the secret path;
- any proxy change outside Taff's own Caddyfile;
- an agent reading money, or any role reading what it cannot read today;
- a task that needs new behaviour in `packages/core`, `apps/api` or
  `apps/worker`.

## Out of scope

Tools for milestones, CRM writes, the mind map, the inbox and Ask. The other
read families of Wave 1, and Waves 2, 4 and 5. Each needs its own plan.
