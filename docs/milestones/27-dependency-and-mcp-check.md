# 27 — Dependency review and MCP health check (2026-10-17)

## Working

- Every framework is on its newest stable major: Node 24 LTS, pnpm 12,
  TypeScript 7.0, Next 16, React 19, Hono 4, Zod 4, better-auth 1.7,
  BullMQ 6, Vitest 5, Biome 2, MCP SDK server/client 2.3.1.
- Patch refresh applied within those majors (see `docs/upgrade-plan.md`).
  `pnpm audit --prod`: no known vulnerabilities.
- MCP: official v2 client smoke passed, covering all 31 tools, rate limit
  (429 at 60/min), revocation (401) and call logging. A raw curl
  `initialize`/`tools/call` round trip also works; README has the recipe.
- README tool count corrected from 30 to 31.

## Missing

- Playwright e2e was not run in this session: the container's preinstalled
  Chromium (build 1194) does not match Playwright 1.64 (build 1248). CI runs it.

## Open decisions (unchanged, scheduled)

- Node 26 after it becomes LTS on 2026-10-28; PostgreSQL 19 after GA.
- Worker ioredis 5 → 6 once BullMQ supports it; Drizzle 1.0 once final.
- Preact 11 and temporal-polyfill 1.0 wait for Schedule-X to support them.

## Validation

lint ✓ · typecheck 6/6 ✓ · licence gate ✓ · Vitest 102 files / 1689 tests ✓ ·
build ✓ · Today initial JS 196,517 B gz (budget 204,800) ✓ · mcp:smoke ✓
