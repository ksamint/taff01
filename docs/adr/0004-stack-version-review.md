# 0004 — Stack version review (October 2026)

## Status

Accepted and applied on 2026-10-08. The user approved every proposed row
("apply all") and asked for the most advanced supported versions. Rows marked
"scheduled" wait on an upstream date and are tracked in
[the upgrade plan](../upgrade-plan.md).

## Context

The standing rules fixed major versions that were current when written. The user
asked whether each pinned version was still the best choice. Upstream status was
checked on 2026-10-08 against official release pages and the npm registry.

| Component | Before | Upstream on 2026-10-08 | Applied |
| --- | --- | --- | --- |
| Node | 22 | 24 Active LTS (maintenance from 2026-10-20). 26 becomes LTS on 2026-10-28. 22 EOL 2027-04-30. | 24. Scheduled: 26 after 2026-10-28. |
| pnpm | 10 | 12.10 current (12.0 on 2026-08-26). | 12.10 with its default supply-chain policies (`minimumReleaseAge`, `allowBuilds`). |
| Turborepo | 2.11 | 2.x current; 3.0 in preparation. | Unchanged. |
| TypeScript | 5.9 | 7.0.2 GA (native compiler; no JS API until 7.1, expected 2026-11). | 7.0.2. Next 16.4 type-checks through the `tsc` CLI by default, so the missing JS API does not matter. `types: ["node"]` is now explicit because TS 6+ no longer auto-includes `@types/*`. |
| Next.js | 16.4 | 16.4.0 is the latest stable. | Unchanged. |
| React | 19.3 | 19.3.0. | Unchanged. |
| Tailwind | 4.3 | 4.3.3. | Unchanged. |
| TanStack Query | 5.104 | React adapter still 5.x. | Unchanged. |
| Hono | 4.13 | 4.13.13; `@hono/node-server` 2.1 (adds a `websocket` server option). | `@hono/node-server` 2. |
| better-auth | 1.7.7 | 1.7.x. | Unchanged. |
| MCP SDK | `@modelcontextprotocol/sdk` (planned) | v1 (1.32) is maintenance-only; v2 is `@modelcontextprotocol/server` and `client` 2.3 (spec 2026-07-28). | Phase 2 uses the v2 packages. |
| Drizzle ORM | 0.45.4 | 0.45.x stable; 1.0 at release candidate. | Unchanged. Scheduled: 1.0 when final. |
| PostgreSQL | 16 | 18.6 current; 19 at beta 4, GA targeted late October 2026. | 18 (`postgres:18-alpine`; the image keeps the cluster under `/var/lib/postgresql`). Migrations, seed and the integration tests were run on PostgreSQL 18.4. Scheduled: 19 after GA. |
| Redis | `redis:7.2-alpine` (BSD) | Redis 7.4+ is RSAL/SSPL and 8 adds AGPL; Valkey 9.1 is the BSD-3 fork. | Valkey 9 (`valkey/valkey:9-alpine`). `REDIS_URL` keeps its name because ioredis and BullMQ speak the `redis://` scheme. |
| BullMQ | 5.81 | 6.3.11 (pluggable backends; `ioredis` is now an explicit peer). | 6.3 with the ioredis backend. The PostgreSQL backend is a separate decision (ADR to come) because it would remove the Valkey service and move MCP rate limiting to PostgreSQL. |
| pino | 9.14 | 10.4. | 10. |
| i18next / react-i18next | 25 / 16 | 26.4 / 17.0 (`initImmediate` became `initAsync`). | 26 / 17. |
| Biome | 2.5 | 2.5.15. | Unchanged. |
| Vitest | 3.2 | 5.0.3. | 5.0 (config renamed to `vitest.config.mts`). |
| Playwright | 1.64 | 1.64. | Unchanged. |
| Caddy | 2 | 2.x. | Unchanged (Phase 4). |

## Decision

Apply the table above. Keep following upstream on the schedule in the upgrade
plan. Dependency licences stay as before: everything added is MIT, Apache-2.0,
BSD or ISC (Valkey is BSD-3-Clause).

## Consequences

Contributors need Node 24 and pnpm 12. Existing local PostgreSQL 16 volumes are
not readable by 18; development data is recreated with `docker compose down -v`,
`pnpm db:migrate` and `pnpm db:seed`. pnpm 12 refuses packages younger than its
release-age policy and dependencies whose build scripts are not listed under
`allowBuilds` in `pnpm-workspace.yaml`.
