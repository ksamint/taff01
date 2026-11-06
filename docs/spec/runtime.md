# Spec: runtime recovery

Living product specification for Node API/worker recovery and deployment
configuration (PR #82). Change this file with the behavior it describes.

Status: v0.2.20 candidate; no production activation in this change.

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
| RT-2.3 | scripts/apuch-compose.test.ts; scripts/valkey-rehearsal.mjs |
| RT-2.5 | Dockerfiles; non-root image smoke; release closeout |

## Open decisions

- Production activation and observation follow the v0.2.20 release, after v0.2.19.

## Sources

- [Agent access](agent-access.md)
- [Hardening audit](../audits/runtime-20261031.md)
- [Statement deadline evidence](../audits/2026-10-31-statement-timeout.md)
- [Release closeout](../release-closeout.md)
