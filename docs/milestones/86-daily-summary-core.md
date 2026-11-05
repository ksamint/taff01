# 86 — Daily summary S1: schema, core, permissions (2026-11-05)

Branch `claude/daily-summary-module-plan-maapa1`. Plan:
[ADR 0027](../adr/0027-shareholder-daily-summary.md), goal S1. Owner: "go
ahead with the defaults".

## Works

- Migration 0038 (additive): `audience_tags`, `project_audience_tags`,
  `audience_recipients`, `daily_summaries` (UPDATE rejected by trigger),
  `summary_shares` (token hash only). All five audited and notified.
- Shared Zod schemas in `packages/schemas/src/summaries.ts`.
- Pure `buildDailySummary` with the timeline's risk, caps, finance and
  names switches, content hash and recipient watermark; golden file in
  `packages/core/src/__fixtures__/summary-golden.json`.
- Core operations for tags, recipients, project tags, list/get/preview,
  share create/list/revoke, public read by token, due-job paging and
  idempotent generation. New `can()` actions with table-driven rows.
- Realtime: the five tables reach admin sockets only.

## Missing

- S2 worker jobs and REST routes, S3 web, S4 release. No route exposes
  this yet, so nothing is reachable in a running app.
- Inbox row, milestone movement, Rust golden script: see the ADR notes.
- Migration 0038 collides with PRs #81/#82 (0038/0039); renumber whichever
  merges second.

## Validation

| Check | Result |
| --- | --- |
| Summary model unit tests | 10 passed |
| Summary integration and access matrix (PostgreSQL 18.6) | 5 passed |
| Permission table | all passed; 34 new summary rows |
| Realtime routing | 12 passed, 3 repeated runs |
| Full `pnpm test` (PG 18.6, Redis) | 1,875 passed, 1 failed (below) |
| Lint, licence gate, typecheck of all six packages | clean |

The failure is `mcp-round-trip.test.ts`: its source scan misses `projects.create`/`edit`.
It fails identically on unmodified `main`. `build:server` passed. Not run: web build,
perf budget, e2e, MCP smoke (no web, route or tool changes).
