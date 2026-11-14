# Spec: runtime recovery

Living product specification for browser realtime recovery, Node API/worker recovery and deployment
configuration (PR #82). Change this file with the behavior it describes.

Status: API/worker recovery shipped in v0.2.20, source `596272a`; persisted Valkey activation and native acceptance are recorded in [milestone 104](../milestones/104-v0.2.20.md). Bounded browser realtime refresh is implemented for unreleased v0.2.25; see [milestone 129](../milestones/129-realtime-invalidation.md).

## Users and roles

| Role | Can |
| --- | --- |
| Operator | Build, validate and deploy the configured runtime through release closeout |
| Person or agent | Receive the existing sanitized API errors and retry after recovery |

## Requirements

### Shutdown (RT-1)

- RT-1.1 When SIGINT or SIGTERM arrives, the API shall drain HTTP and realtime
  before closing core and every rate limiter; the worker shall drain jobs
  before closing its queue and core. Repeated signals shall reuse one shutdown.
- RT-1.2 When a drain or cleanup fails, the runtime shall still attempt every
  cleanup after all drains settle, then exit nonzero. A hung shutdown shall
  exit nonzero within 25 seconds, before Compose's 30-second stop grace.

### Database and queue recovery (RT-2)

- RT-2.1 Core runtime statements shall default to a 20-second PostgreSQL
  statement timeout. Explicit URL settings shall take precedence; migration
  and maintenance connections shall retain their existing connection policy.
- RT-2.2 Lost or finished transactions shall refuse further statements and
  shall not let escaped queries write through a released connection.
- RT-2.3 Production Valkey shall use a dedicated persisted volume, AOF with
  every-second synchronization and noeviction within its 256 MB memory limit.
- RT-2.4 Database adapter fallback failures shall use the configured logger
  with a constant message instead of printing raw query errors to stderr.
- RT-2.5 Production images shall retain non-root execution, readable migration
  and public assets, private mail mode 0700 and direct signal delivery to Node.

### Browser realtime refresh (RT-3)

- RT-3.1 When matching workspace or user events arrive during a refresh, the browser shall coalesce them into a trailing refresh instead of starting another concurrent batch of reads. Existing active reads shall be joined, with a later refresh to avoid retaining data read before the change.
- RT-3.2 When an optimistic mutation is pending, ordinary event refreshes shall wait until it settles. Socket authentication revocation shall immediately clear session data and revalidate Me, independently of pending writes or ordinary refreshes.
- RT-3.3 On the first socket open, the browser shall revalidate Me and mark other query families stale without refetching them. Reconnection shall refresh the families; stopping the connection shall prevent queued trailing refreshes and stale socket callbacks.

## Non-functional

- PostgreSQL, Valkey, existing schemas and neighboring services retain their
  deployment ownership boundaries. Configuration ships with v0.2.20 only.
- Activating the persistent Valkey volume shall preserve existing queue state
  through verified backup/restore; the isolated RDB restore rehearsal covers
  waiting jobs, delayed jobs and scheduler continuation.
- Tracked Postgres.js and Better Auth patches retain Unlicense and MIT;
  Nodemailer retains MIT-0. Frozen installation and the licence gate apply.

## Out of scope

- Immediate SQL cancellation on browser disconnect, total transaction or pool
  queue deadlines, host-loss recovery guarantees and a Rust authority cutover.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| RT-1 | apps/api/src/shutdown.test.ts; runtime-faults.mts |
| RT-2.1 | statement-timeout.integration.test.ts |
| RT-2.2, RT-2.4 | runtime-faults.mts; tracked dependency patches |
| RT-2.3 | scripts/apuch-compose.test.ts; scripts/valkey-rehearsal.mts seven checks on 9.1.2; actual native RDB restore and cold AOF restart parity in [milestone 104](../milestones/104-v0.2.20.md) |
| RT-2.5 | Dockerfiles; non-root image smoke; release closeout |
| RT-3 | apps/web/src/lib/realtime.test.ts: actual QueryObserver burst, independent read, trailing freshness, mutation, cleanup and immediate revocation cases; existing routing/first-open/reconnect cases |

## Open decisions

- Production activation completed after v0.2.19: pinned Valkey 9.1.2, dedicated volume, AOF/everysec/noeviction, actual queued/delayed/scheduler state preserved before writers resumed. See [milestone 104](../milestones/104-v0.2.20.md). Normal operation remains subject to the documented rollback data boundary.

## Sources

- [Agent access](agent-access.md)
- [Hardening audit](../audits/runtime-20261031.md)
- [Statement deadline evidence](../audits/2026-10-31-statement-timeout.md)
- [Release closeout](../release-closeout.md)
