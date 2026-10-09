# Implementation plan

The original requirements are preserved verbatim in `../instruction_v0.md`.
This plan orders their implementation; it does not relax them.

## Phase 0 — Repository foundation

Deliver the Git repository under `ksamint/taff01`, MIT license, source requirements,
agent instructions, runtime version declaration, and this plan.

Acceptance: the saved objective matches the supplied file, the initial commit is
pushed, and the README accurately describes the current state.

Checkpoint accepted by the user’s resume instruction. Repository ready; the
application implementation follows in Phase 1. No stack change is proposed.

## Phase 1 — Runnable vertical slice

Create the pnpm/Turborepo workspace using the fixed stack. Add shared schemas,
Drizzle migrations, core permission checks and transactional mutation helpers.
Every mutation records activity with its actor and emits `taff_changes` in the
transaction. Implement authentication and a minimal bilingual Today route with
task creation and assignment. Provide Docker Compose for PostgreSQL and Redis,
dummy environment documentation, migration and demo seed commands.

Acceptance: clean setup works using documented commands; core permission and
mutation tests pass; web, API and worker start; the demo workspace has five people
and three agents. Task owners are people and worker assignments accept agents.

Phase 1 is recorded in [the checkpoint](phase-1-checkpoint.md), approved by the
user on 2026-10-08 and merged through pull request 1. The licence decision is
closed in [ADR 0003](adr/0003-transitive-license-decision.md); the stack was
upgraded per [ADR 0004](adr/0004-stack-version-review.md) and
[the upgrade plan](upgrade-plan.md). The UI source of truth is
[docs/ui](ui/README.md).

## Milestones from Phase 2 on

There are no blocking gates. Each milestone ends with a push and
`docs/milestones/NN-title.md` (what works, what is missing, open decisions,
validation evidence); work continues with the next milestone while the user
reviews. The agent prompt that drives this is `agent-goal.md`.

### Phase 2 — Agent collaboration and realtime

- **M1 Design system foundation.** TABLE AI tokens mapped to Tailwind `@theme`,
  Manrope and Noto Sans TC, Lucide icons, restyled shadcn primitives, the phone
  shell (Today, Calendar, Projects, Inbox, Me) and the desktop shell (sidebar),
  light and dark themes, three locales with the prototype's strings. Acceptance:
  Today renders from the prototype's design in all locales on a phone viewport
  and on desktop; Playwright screenshots per locale; bundle still within budget.
- **M2 Agent tokens and MCP.** `agent_tokens` with peppered SHA-256 hashes and
  scopes, shown once; `/mcp` Streamable HTTP on `@modelcontextprotocol/server`
  with tools `tasks.list`, `tasks.create`, `tasks.update`, `calendar.schedule`,
  `inbox.request_review` and `files.attach` validated by the shared Zod schemas
  and calling core; per-token rate limit in Valkey; `mcp_calls` log; the MCP page
  (endpoint, token show-once, regenerate and revoke with confirm, undo and log,
  client config, scopes, call log); `pnpm mcp:smoke` with
  `@modelcontextprotocol/client`. Acceptance: the smoke test exercises every tool
  and the rate limit; `can()` has table-driven tests for agent scopes.
- **M3 Agent runs and review.** `runs` and `run_events` (steps, tool calls, files,
  duration, cost); start, pause, resume and cancel; agent profile with
  permissions Allow / Ask / Deny, scoped expiring grants with history and a
  review policy (default always review); review workspace with deliverable
  preview, sources, test results, the three-item checklist, approve and request
  changes with comments; Inbox with All / Reviews / Blockers, unread, snooze,
  grouping and badge; Today's agents-at-work card. Acceptance: Playwright flow
  assign to agent → status → approve from Inbox in all locales; `can()` tests for
  every permission decision.
- **M4 Realtime and optimistic cache.** `NOTIFY taff_changes` → WebSocket hub in
  `apps/api/realtime` (on `@hono/node-server`'s websocket option) → TanStack
  invalidation; every mutation optimistic with rollback. Acceptance: two browsers
  converge within a second; failed mutations restore the previous state.

### Phase 3 — Planning depth and PWA

- **M5 Task model and views.** Editable fields (title, owner, due date and time,
  priority, project, labels, subtasks), projects board with drag between columns
  and list with filters and sorting, Search (⌘K) over tasks, comments and
  settings, organizations (create, invite, roles, switch), quick add with
  editable parsed fields. Acceptance: Playwright covers board drag and search.
- **M6 Calendar.** `@schedule-x/react` day, week and month; drag to move; drag
  edge to resize; tap empty slot to create; unscheduled tray; agent background
  lane; rrule recurrence; user time zone everywhere. Acceptance: Playwright drag
  flow in all locales; recurrence and time-zone unit tests.
- **M7 Cache, PWA and notifications.** TanStack IndexedDB persistence (cache
  first, then reconcile), PWA manifest and service worker (no offline sync),
  notification preferences, daily digest job on BullMQ, performance budget script
  (initial JS ≤ 200 KB gzipped, LCP ≤ 2 s on simulated 4G, Lighthouse ≥ 90).
  Acceptance: budget script passes on the Today route. Done: `pnpm perf:budget`
  passes and `pnpm perf:lcp` (Playwright + CDP throttling, no Lighthouse)
  passes in English (1.94 s); zh-CN and zh-HK measure 2.34 s and stay open
  (route JavaScript diet, server-rendered locale; see milestone 08). The
  Lighthouse score waits on the axe-core (MPL-2.0) licence decision of ADR 0003.

### Phase 4 — Release

- **M8 Production and CI.** Docker images for web, API and worker; Caddy;
  production compose; CI running lint, typecheck, unit and integration tests, e2e
  in all locales, MCP smoke, licence gate and performance budget; OAuth 2.1
  metadata for `/mcp`; security pass (CORS, rate limits, token redaction);
  README quick start verified from a clean checkout. Done in M8: server bundles,
  the three Dockerfiles, `compose.prod.yaml` with Caddy, `.github/workflows/ci.yml`,
  the licence gate and the audit security pass. Open: OAuth 2.1 metadata (needs
  an authorization server decision; bearer tokens remain the contract until
  then), outgoing email for invitations, a clean-checkout quick-start run.
- **M9 Hardening and handoff.** Lighthouse CI audit of Today (axe-core
  approved dev-only, ADR 0003 amendment) with mobile performance,
  accessibility and best-practice scores ≥ 90; Chinese-locale LCP ≤ 2 s
  (route JavaScript diet, server-rendered locale); accessibility pass
  against the floor in `docs/ui/README.md`; i18n QA in all locales;
  prototype seed data; release notes; clean-checkout quick start verified.

## Review protocol

Report working behavior, missing requirements, open decisions and validation
evidence in `docs/milestones/` at every milestone, then continue. Resolve routine
implementation details within the fixed stack autonomously and record
consequential design choices in numbered ADRs. Stop only for decisions that
change the product contract: licences, deleting data, publishing outside the
repository.
