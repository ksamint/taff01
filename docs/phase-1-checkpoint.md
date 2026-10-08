# Phase 1 checkpoint — 2026-10-08

## Working behavior

- Node 22 / pnpm 10 workspace with web, API and Redis-connected worker.
- Email/password signup provisions a personal workspace and person membership.
- Bilingual mobile Today shows unscheduled tasks and tasks due in the user's zone.
- Create a task with a person owner; assign its worker to a person or agent.
- Shared Zod contracts validate REST inputs and client responses.
- One core permission function enforces workspace and assignment access.
- Database migrations enforce workspace foreign keys and person-only task owners.
- Mutations audit their actor and notify only after the transaction commits.
- Auth writes are audited without copying tokens/passwords into activity or notifications.
- Locale changes persist to the user profile; optimistic task changes roll back on failure.
- Session refresh cookies propagate through the API to the browser.
- Idempotent demo workspace contains five people and three agents.

## Validation evidence

Performed with Node 22.23.3, pnpm 10.34.5, PostgreSQL 16 and Redis 7:

| Check | Result |
| --- | --- |
| `pnpm test` | 39 passed; includes nine real PostgreSQL integration tests |
| `pnpm e2e` | Six passed; mobile English and Simplified Chinese |
| `pnpm lint` | Passed |
| `pnpm typecheck` | All six packages passed |
| `pnpm build` | Production web build passed |
| Clean source copy + frozen install | Passed without existing node_modules |
| Fresh database migrate + seed | Passed in isolated `taff_clean_test` database |
| Clean source copy typecheck + build | Passed |
| Dev lifecycle | Web/API/worker started; stopping dev released both HTTP ports |
| Mobile screenshots | Inspected both languages; no horizontal overflow observed |
| Independent source review | Session-cookie forwarding finding corrected and regression covered |

The production page references 198,624 gzip bytes of modern-browser initial JS
(approximately 194 KiB), excluding the `noModule` legacy polyfill. This is a static
bundle baseline, not a Lighthouse or simulated-network measurement. Aggregate
performance enforcement and full browser measurements remain required before release.

## Re-validation on 2026-10-08 (cloud session)

Re-run from a fresh clone with Node 22.22, pnpm 10.34, a local PostgreSQL 16 and
Redis 7.0 (Docker was unavailable, so the services were started from host binaries):

| Check | Result |
| --- | --- |
| `pnpm i --frozen-lockfile` | Passed |
| `pnpm lint` | Passed (51 files) |
| `pnpm typecheck` | All six packages passed |
| `pnpm db:migrate` + `pnpm db:seed` | Passed; demo workspace created |
| `pnpm test` | 39 passed, including nine PostgreSQL integration tests |
| `pnpm build` | Production web build passed |
| `pnpm e2e` | Six passed (en and zh-CN) after the web-server teardown fix below; run with Playwright 1.56 because the container ships Chromium 141 and the lockfile's Playwright 1.64 needs a newer build |
| Licence scan of every installed manifest | No GPL, AGPL, SSPL or LGPL; two MPL-2.0 components as documented in ADR 0003 |

`pnpm e2e` never exited on Linux: Playwright stops the combined `pnpm dev` runner
with SIGKILL, its detached child servers survived and kept the output pipe open.
The Playwright config now starts the API and web servers as separate web-server
entries so Playwright owns each process group; `pnpm dev` is unchanged.

Turborepo 2.11 appends an agent-guidance block to `AGENTS.md` when it detects an
AI agent; `agentGuidance` is now disabled in `turbo.json` so the instructions file
stays authored by people.

## Remaining work and decisions

The application is not complete. Phase 2 still needs agent tokens, validated MCP
tools and smoke tests, per-token rate limits, review Inbox, agent output approval,
WebSocket fan-out and query invalidation. Phase 3 adds calendar/dragging, recurrence,
board/list views, IndexedDB persistence and PWA installation. Phase 4 adds production
packaging, Caddy and all CI/performance gates, including the licence gate from ADR 0003.

Decisions:

- Closed: the transitive-licence question. The user restated the standing rules
  with the fixed stack on 2026-10-08; ADR 0003 records the stack as retained with
  the two MPL-2.0 components as documented exceptions.
- Applied: the local Redis image is pinned to the BSD-licensed 7.2 line, because
  `redis:7` now resolves to 7.4, which is RSALv2/SSPLv1 and banned by the rules.
- Open: [ADR 0004](adr/0004-stack-version-review.md) proposes version moves
  (Node 24, pnpm 12, TypeScript 6, PostgreSQL 18, Valkey instead of Redis, MCP SDK
  v2 packages, Vitest 4 or 5). The stack is fixed by the rules, so each needs
  the user's approval.
- Open: Phase 1 review. Per the checkpoint rule, Phase 2 starts after the user
  approves this checkpoint.

This checkpoint is not a claim that the complete app is delivered.
