# Milestone 04 — Realtime and optimistic cache

## Working behavior

- PostgreSQL transactional notifications flow through the core-owned listener,
  a Hono WebSocket hub and TanStack Query invalidation. No database access was
  introduced in the API or browser.
- Same-origin `/api/realtime` upgrades require a valid person session, configured
  origin and workspace membership. Registration is followed by reauthorization
  to cover handshake revocation races. Membership changes, revoked/expired
  sessions and database listener reconnects close affected connections.
- Only strict routing metadata is sent, scoped to the selected workspace or
  affected user. Auth maintenance events are suppressed. Changes during
  authorization are latched and flushed after authorization succeeds.
- The browser owns one socket per authenticated workspace, disposes it on
  workspace/session changes, uses bounded reconnect backoff and refetches after
  reconnect. Reads reconcile without polling or simulated changes.
- Task/run controls, review/comments, Inbox, profile/permissions/grants, token
  management and locale settings use optimistic cache changes with snapshots
  and rollback. Incoming invalidation waits for writes to settle. Credentials
  and raw tokens appear only after successful server authorization.
- Session authorization refreshes immediately on socket closure, including
  during a pending write. Account/workspace-access changes clear protected
  caches before rendering and reject late callbacks from the previous scope.
  Shared write controls prevent cross-page snapshots from overlapping.

The direct API dependency `ws` 8.22.0 and development types `@types/ws` 8.18.2
are MIT licensed and implement the prescribed stack. Unused direct API database
and Drizzle dependencies were removed. Migration 0008 changes only audit routing
metadata and preserves existing application data.

## Validation

| Command | Evidence |
| --- | --- |
| `pnpm lint` | 102 files pass Biome |
| `pnpm typecheck` | All six packages pass TypeScript 7 |
| `pnpm test` | 176 tests across thirteen files pass, including PostgreSQL 18 |
| `pnpm build` | Production Next.js build succeeds |
| `pnpm e2e` | All 33 browser tests pass across en, zh-CN and zh-HK (1.6 minutes) |
| `pnpm mcp:smoke` | All twelve tools, measured evidence, grants, human review, rate limit and revocation pass |
| `pnpm perf:budget` | Today: 197,609 bytes gzip, 193.0 KiB, below 200 KiB |

Core regression coverage uses PostgreSQL 18 to prove committed delivery,
rollback silence, malformed-payload rejection, isolated callback failures,
targeted profile events, real listener reconnection and reliable unsubscribe.
Actual WebSocket tests cover anonymous/cross-origin/originless/nonmember
rejection, workspace/user isolation, revoked membership/session closure,
expiry, unsolicited/oversized messages and both handshake races.

A focused independent review found handshake races, stale session caches,
overlapping rollback snapshots and deferred logout behind pending writes. Each
was repaired with regression coverage; final source review has no remaining
consequential finding.

Browser regressions prove two-context task/run/profile convergence within one
second, reconciliation after a disconnected write, rejected mutations across
all write families, cross-page controls while a write is pending, and remote
logout before releasing a held write. A second account cannot render the first
account's cached private task; late old-scope callbacks cannot restore it.

## Missing work and decisions

M5–M9 remain: the complete task/project/organization model and search, full
calendar and recurrence, IndexedDB/PWA/notifications, production/CI, release
accessibility and locale QA, and prototype seed data. No offline write queue or
durable event replay is implemented; reconnect refetches current authorized
state after notifications lost during a disconnection.

No open licence, deletion, publication or stack decision. Continue to M5.
