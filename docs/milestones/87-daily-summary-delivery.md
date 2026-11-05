# 87 — Daily summary S2: worker, REST, public share route (2026-11-05)

Plan: [ADR 0027](../adr/0027-shareholder-daily-summary.md), goal S2. Follows [86](86-daily-summary-core.md).

## Works

- Worker: `summary-scan` every minute pages due recipients and enqueues
  `daily-summary` jobs with stable ids beside the digest jobs.
- Fourteen session routes for tags, recipients, project tags, summary
  list/read/preview and share create/list/revoke. All validate with the
  shared schemas and call core; every rule stays in `can()`.
- Public `POST /api/shared-summary`: no session, token in the body only,
  two Valkey limits before the database, `private, no-store`, `noindex`,
  `no-referrer`, the same 404 for every miss, origin check kept.
- All fourteen routes are in the PostgreSQL actor matrix; the public route
  has its own case (no session, foreign cookie or agent bearer; revoke ends it).
- Live run on the local stack: REST setup, then the running worker generated
  the summary in one scan (next run midnight Hong Kong), share read publicly,
  revoked to 404, 31st read in a minute got 429. The token is in neither log.

## Missing

- S3 web (pages, watermark layer, project chips), S4 release.
- No MCP tool (ADR decision 4); no new environment variable.

## Validation

| Check | Result |
| --- | --- |
| REST adapter tests | 21 passed |
| Worker processor tests | 2 new, 4 total passed |
| Authorization matrix (PostgreSQL 18.6) | 772 passed |
| Full `pnpm test` | 1,955 passed, 1 failed (pre-existing on `main`, see 86) |
| `pnpm mcp:smoke` against the local API | passed |
| Lint, licence gate, typecheck of six packages, `build:server` | clean |

Not run: web build, perf budget, e2e (no web changes yet).
