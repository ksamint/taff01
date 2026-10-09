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

## Performance (M7 acceptance)

`pnpm perf:lcp` measures the signed-in Today route on the production build
with Playwright and CDP: 1.6 Mbps down, 750 Kbps up, 150 ms RTT, 4× CPU
slowdown, HTTP cache cleared, service worker blocked (a first visit), median
of three runs. The first honest measurement was 2,012 ms, with the Chinese
locales at 3.3 s. The timeline showed why, and each cause is fixed:

| Cause | Fix |
| --- | --- |
| `/api/me` started only after the JavaScript had downloaded and run | The root layout preloads it with the HTML |
| Returning browsers fetched their locale file and first reads late | An inline head script preloads the stored locale and the last workspace's tasks and members |
| The first socket open invalidated every family with cancellation, aborting and repeating the initial reads | The first open only marks families stale; later opens, which follow a disconnect, refetch |
| The first identity record purged queries fetched under the same cookie | Only an identity change or a sign-out purges |
| The demo workspace rendered 82 task cards with a member select each (1,790 DOM nodes) | Today renders 20 cards and a "Show N more" button |
| Web fonts competed with the JavaScript on the slow link and shifted the layout | `font-display: optional`: a slow first visit keeps the system font, later visits use the cached fonts |

Result on this container (shared 4-core sandbox, Chromium 141):

| Locale | LCP median | Limit |
| --- | --- | --- |
| en | 1,944 ms | 2,000 ms |
| zh-HK | 2,340 ms | 2,000 ms |

English passes with a small margin. The Chinese locales still miss by about
0.3 s: after hydration the page spends one render and layout pass applying
the locale before the list pass, and CJK text shaping with this container's
fallback font costs 2.5× the Latin layout. Both cost less on a phone with
PingFang or Noto Sans CJK installed, but that is not measured. Open work,
in order of expected gain: cut the 200 KiB of route JavaScript (the shared
schema chunk and i18next are 38 KiB together), render the locale from a
cookie on the server to remove the locale pass, and measure on a device.
The `font-display: optional` change means the first visit on a slow link
shows the system font; revert the three declarations in `tokens.css` to
`swap` if brand fidelity on first paint matters more than 100–150 ms.

## Validation

| Check | Result |
| --- | --- |
| `pnpm lint` | 166 files clean |
| `pnpm typecheck` | 6 packages |
| `pnpm test` | 392 passed (27 files) on PostgreSQL 18.4 and Valkey |
| `pnpm build` | standalone output |
| `pnpm perf:budget` | 195.7 KiB gzipped Today JavaScript (budget 200 KiB) |
| `pnpm licence:check` | 201 packages, 6 documented exceptions |
| `pnpm build:server` | api, worker and migrate bundles run |
| `pnpm mcp:smoke` | passed against the dev API |
| `pnpm e2e` | see below |
| `pnpm perf:lcp` | en 1,944 ms; zh-HK 2,340 ms (over) |

`pnpm e2e` on the final code: 75 passed in en, zh-CN and zh-HK (10.1 min).
Two environment notes from the earlier runs: the offline-shell case needs
Playwright's service-worker network emulation flag, which the config now
sets, and this sandbox drives Chromium 141 with a temporary `@playwright/test`
1.56 install because the pinned 1.64 cannot navigate that browser; the
committed pin stays 1.64 and CI installs its matching browser.

The three Docker images could not be built here (no Docker in the sandbox);
the CI `images` job builds them on every push.

