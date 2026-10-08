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

## Remaining work and open decision

The application is not complete. Phase 2 still needs agent tokens, validated MCP
tools and smoke tests, per-token Redis limits, review Inbox, agent output approval,
WebSocket fan-out and query invalidation. Phase 3 adds calendar/dragging, recurrence,
board/list views, IndexedDB persistence and PWA installation. Phase 4 adds production
packaging, Caddy and all CI/performance gates.

The fixed Next/Tailwind stack contains transitive MPL-2.0 components while the
original requirements ban copyleft dependencies. Optional LGPL image optimization
was excluded. The required MPL components still need a user decision documented in
`adr/0003-transitive-license-decision.md`. The user explicitly authorized committing
and pushing Phase 1 on 2026-10-08; the policy decision remains open.

Per the original checkpoint rule, await review before starting Phase 2. The overall
goal remains active. This checkpoint is not a claim that the complete app is delivered.
