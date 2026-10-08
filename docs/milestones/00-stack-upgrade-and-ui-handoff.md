# Milestone 00 — Stack upgrade and UI handoff (2026-10-08)

## What works

- Phase 1 approved and merged (pull request 1).
- Stack upgraded per ADR 0004: Node 24, pnpm 12, TypeScript 7, Vitest 5,
  PostgreSQL 18, Valkey 9, BullMQ 6, @hono/node-server 2, pino 10, i18next 26.
- The approved Team Tasks prototype and the TABLE AI design system are vendored
  in `docs/ui/prototype/`; `docs/ui/README.md` maps every screen to routes, data
  and milestones.
- Standing rules updated: new stack line, UI source of truth, three locales,
  milestone reviews without blocking gates. The agent prompt is
  `docs/agent-goal.md`.

## Validation evidence

| Check | Result |
| --- | --- |
| `pnpm install` (pnpm 12.10, Node 24.21) | Passed under the release-age and build-approval policies |
| `pnpm lint` | Passed |
| `pnpm typecheck` (TypeScript 7.0.2) | Six packages passed |
| `pnpm db:migrate` + `pnpm db:seed` on PostgreSQL 18.4 | Passed |
| `pnpm test` (Vitest 5.0.3) | 39 passed, nine against PostgreSQL 18 |
| `pnpm build` | Production web build passed |
| `pnpm e2e` | Six passed (en, zh-CN); run with a temporary Playwright 1.56 shim because this container ships Chromium 141 |
| BullMQ 6 worker | Reached ready against a Redis-protocol server |

Valkey itself and the `postgres:18-alpine` image could not be started here
(no Docker); PostgreSQL 18 was validated with the embedded binaries and Valkey is
protocol-compatible with the Redis 7 server used for the worker check.

## Missing

Everything from M1 on. The web app still uses the Phase 1 placeholder styling;
`zh-HK` strings do not exist yet.

## Open decisions

- BullMQ's PostgreSQL backend (would remove Valkey); decide in an ADR during M2.
- Dark theme needs brand review (carried from the prototype audit).
