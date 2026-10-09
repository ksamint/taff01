# Milestone 08 — Audit fixes and production packaging (2026-10-09)

## Audit

Three independent read-only reviews of M3–M7 (core/db/permissions, API/MCP/
realtime/worker, web cache/PWA/i18n/accessibility) produced 2 high, 8 medium
and about 20 low findings. Fixed in this milestone, each with a regression
where it was testable:

| Area | Finding | Fix |
| --- | --- | --- |
| MCP | JSON-RPC batch arrays bypassed the per-call rate limit and the call log | Batches are rejected with 400 |
| MCP | Unbounded `method`/`tool` strings reached `mcp_calls`, even on 429 | Bounded identifiers in the adapter and a Zod-validated call-log entry in core |
| MCP | Token lookup ran before the limiter; every 429 wrote a row and notified the workspace | The limiter runs on a hash of the raw token before any database access; only the first refusal of a window is logged |
| MCP | `tasks.update` ran worker and status as two transactions | New core `updateTaskWork`: both apply or neither |
| MCP | SDK-level argument failures were logged as `ok`; unexpected errors were not logged | Status derives from the JSON-RPC result; non-core errors go to pino |
| Realtime | A member's role change closed every socket in the workspace; one sign-out closed all of a user's devices | Closes are scoped to the affected user and the revoked session id |
| Realtime | No heartbeat, per-user cap or backpressure | 30 s ping/pong, 10 sockets per user, 1 MiB send buffer limit |
| Realtime | Session expiry closed active users; token and call-log events reached non-admins | Expiry re-checks the session and reschedules; `agent_tokens.*`/`mcp_calls.*` go to admins only |
| Realtime | Synchronized reconnect storms | Jittered client backoff |
| Rate limit | INCR and EXPIRE were separate calls | One MULTI with `EXPIRE … NX` |
| Core | An agent could resume a run a person paused | `runs.paused_by`; a person's pause holds until a person resumes |
| Core | An agent could create a task assigned to someone else | `task:create` checks the target worker for agents |
| Core | Foreign task ids leaked existence and versions (404/409 vs 403) and were row-locked before authorization | Non-members get `not_found` before any version check |
| Core | Agents and guests could read any agent's permissions, grants and history | An agent reads only its own profile |
| Core | Quick Add and search accepted non-UUID workspace ids (500) | Validated before core |
| DB | Reviewer, decider, token creator and invite creator kinds were enforced in code only; capability and scope columns accepted any text | Migration 0018: kind triggers and vocabulary checks |
| Web | Users' time zone was never set, so everything ran on UTC; the language chosen at sign-up was overwritten | First signed-in browser sets the zone once, Me has a time-zone select, the pre-sign-up language survives sign-up |
| Web | The service worker and locale files never refreshed after a deploy | Build-stamped versions on the worker URL, its cache name and locale URLs |
| Web | Calendar text at 10–11 px | 12 px floor and 24 px month events |
| Web | Invitation survived sign-out; the board drag handle was a dead keyboard stop | Cleared on sign-out; handle removed from the tab order (the status select is the keyboard path) |

Deferred, recorded in the deployment guide: invitation acceptance relies on
the invitee signing in with the invited email because sign-up has no email
verification (no outgoing email yet); the English server render before the
client applies a Chinese locale; optional versions on three task endpoints.

## Production packaging (M8)

- `pnpm build:server` bundles the API, worker and migrator with esbuild (MIT);
  `deploy/Dockerfile.server` builds one image per target from a flat
  `pnpm deploy` production tree; `deploy/Dockerfile.web` builds the Next.js
  standalone server. `compose.prod.yaml` runs PostgreSQL 18, Valkey 9, the
  migrator, API, worker, web and Caddy 2 with automatic HTTPS;
  `.env.production.example` lists every variable. `docs/deploy.md` is the
  runbook.
- The API binds `API_HOST` (loopback by default, `0.0.0.0` in containers); the
  migrator honours `MIGRATIONS_DIR`.
- `pnpm licence:check` scans every installed manifest (including Next's
  compiled bundles) against the allow list, the two MPL-2.0 exceptions of ADR
  0003 and the hash-verified MIT file of ADR 0006.
- `pnpm perf:lcp` measures Today's LCP on the production build under a
  simulated slow-4G phone (1.6 Mbps, 150 ms RTT, 4× CPU) with Playwright and
  CDP, median of three runs, limit 2 s. It needs no Lighthouse.
- `.github/workflows/ci.yml` runs lint, typecheck, the licence gate,
  migrations, seed, 392 tests on PostgreSQL 18 and Valkey, the web build, the
  server bundles, the bundle budget, Playwright in three locales, the MCP smoke
  against the bundled API, and builds the three images.

## Validation

See the table at the end of this file once the final run completes.
