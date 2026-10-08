# Implementation plan

The original requirements are preserved verbatim in `../instruction_v0.md`.
This plan orders their implementation; it does not relax them.

## Phase 0 — Repository foundation

Deliver the Git repository under `ksamint/taff01`, MIT license, source requirements,
agent instructions, runtime version declaration, and this plan.

Acceptance: the saved objective matches the supplied file, the initial commit is
pushed, and the README accurately describes the current state.

Checkpoint: repository ready; application, dependencies, runtime configuration,
and all application validation remain pending. No stack change is proposed.

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

## Phase 2 — Agent collaboration and realtime

Expose shared core operations through thin REST and validated Streamable HTTP MCP
adapters. Implement hashed agent tokens, per-token Redis rate limits, activity,
WebSocket fan-out, cache invalidation, optimistic rollback and the review Inbox.
Agent output stays in `needs_review` until a person approves it. Restrict CORS to
`AUTH_URL` and redact secrets from logs.

Acceptance: SDK smoke tests exercise every MCP tool; permission tests cover each
new rule; Playwright verifies assignment to an agent, status updates and human
approval in both languages. Integration checks cover activity, rollback and
notifications, including failures and unauthorized access.

## Phase 3 — Calendar, task views and PWA

Implement lists, board and Schedule-X calendar using cached data followed by
reconciliation. Add calendar dragging, recurrence with rrule, localized dates and
numbers in the user's time zone, IndexedDB query persistence and PWA support.
Do not add offline mutation synchronization in v1.

Acceptance: mobile Playwright covers calendar dragging and language switching in
zh-CN and en; recurrence and time-zone checks pass; failed optimistic mutations
restore the previous state; the review flow continues to pass.

## Phase 4 — Release validation

Add Docker/Caddy production setup and CI enforcement of lint, types, unit and
integration tests, MCP smoke checks, bilingual mobile flows and performance.
Verify the README from a clean checkout. Review dependency licenses and document
any necessary design decisions in numbered ADRs.

Acceptance: Today initial JavaScript is at most 200 KB gzipped, LCP is at most
2 seconds on simulated 4G and Lighthouse performance is at least 90. CI fails on
budget violations. Deployment instructions are tested; production hosting is a
separate decision.

## Review protocol

At each phase checkpoint, report working behavior, missing requirements, open
decisions and validation evidence. Wait for user review before the next phase.
Resolve routine implementation details within the fixed stack autonomously and
record consequential uncovered design choices in ADRs.
