# Upgrade plan

Companion to [ADR 0004](adr/0004-stack-version-review.md). This file is the
living schedule: what was applied, what is scheduled, how each move is made and
how it is validated. Update it whenever a row changes.

## Applied on 2026-10-08

| Component | From | To | Code impact |
| --- | --- | --- | --- |
| Node | 22 | 24.21 | `.node-version`, `engines`. No source changes. |
| pnpm | 10 | 12.10 | `packageManager`; `pnpm-workspace.yaml` gained `allowBuilds` (replaces `onlyBuiltDependencies`) and `minimumReleaseAgeExclude`. Lockfile regenerated under the release-age policy. |
| TypeScript | 5.9 | 7.0 | `types: ["node"]` in `tsconfig.base.json`. Next 16.4 type-checks through the `tsc` CLI by default. |
| Vitest | 3.2 | 5.0 | Config renamed to `vitest.config.mts`. |
| PostgreSQL | 16 | 18 | Compose image and volume path. Migrations unchanged. |
| Redis | 7.2 | Valkey 9 | Compose service renamed `valkey`; `REDIS_URL` unchanged. |
| BullMQ | 5 | 6.3 | `ioredis` is now an explicit dependency of the worker. Worker code unchanged. |
| @hono/node-server | 1 | 2.1 | `serve({ fetch, port, hostname })` unchanged; the new `websocket` option is used by the Phase 2 realtime hub. |
| pino | 9 | 10 | None. |
| i18next / react-i18next | 25 / 16 | 26 / 17 | `initImmediate: false` became `initAsync: false`. |
| @types/node, @types/react | 22 / 19.2 | 24 / 19.3 | None. |

Validation on the upgraded stack: Biome, TypeScript 7 typecheck of six packages,
39 Vitest tests against PostgreSQL 18.4 (embedded binaries), production Next
build, six Playwright mobile tests in en and zh-CN, BullMQ 6 worker reaching
ready against a Redis-protocol server.

## Scheduled

| When | Move | How | Validation |
| --- | --- | --- | --- |
| After 2026-10-28 | Node 24 → 26 LTS | `.node-version`, `engines`, CI image, Dockerfiles. | Full check set. |
| After PostgreSQL 19 GA (targeted late October 2026) | 18 → 19 | Compose image; run migrations on a fresh volume; confirm `postgres` driver and Drizzle have no 19-specific issues. | `pnpm db:migrate`, `pnpm db:seed`, `pnpm test`. |
| November 2026 (TypeScript 7.1) | Nothing to change; 7.1 restores the JS API for tools that need it. | `pnpm up typescript`. | `pnpm typecheck`, `pnpm build`. |
| When Drizzle 1.0 is final | 0.45 → 1.0 | Read the 1.0 migration guide; regenerate migration snapshots. | Integration tests. |
| Phase 2 decision | BullMQ PostgreSQL backend | Separate ADR: it would remove Valkey, move MCP rate limiting into PostgreSQL and change the worker's backend factory. | Load test of job throughput and rate-limit accuracy. |
| When BullMQ documents support | ioredis 5 → 6 | 6.0.0 shipped on 2026-10-07; BullMQ 6 declares `ioredis >=5` but has not released against 6. Bump the worker and API together. | `pnpm test`, `pnpm mcp:smoke`, worker reaches ready. |
| With each Node major | `@types/node` | Tracks the runtime major (24 now), not the newest types package (26). | `pnpm typecheck`. |
| Monthly | Minor and patch bumps | `pnpm up --latest` within the fixed majors; pnpm's release-age policy delays packages younger than its cutoff. | Full check set. |

## Procedure for any version move

1. Branch from `main`, bump the manifest(s), run `pnpm install` (never edit the lockfile by hand).
2. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e` and `pnpm mcp:smoke` once it exists.
3. State the licence of any new dependency in the commit message. GPL, AGPL, SSPL and commercial licences are refused; LGPL is excluded; MPL-2.0 is allowed only for the two components listed in ADR 0003.
4. Record the move in this file and, for a major, in a short ADR.

## Rollback

Every move is one commit. Reverting the commit and running `pnpm install`
restores the previous lockfile. For PostgreSQL, keep the previous volume until
the new major has run the integration suite; data directories are not downward
compatible.

## Local development data after the PostgreSQL move

A PostgreSQL 16 volume cannot be opened by 18. Compose uses a distinct
`postgres18_data` volume mounted at `/var/lib/postgresql`, preserving the old
`postgres_data` volume. Before upgrading an existing PostgreSQL 16 service,
make a restricted local logical backup:

```sh
umask 077
docker compose exec -T postgres pg_dump -U taff -d taff > /tmp/taff-pg16.sql
docker compose up -d --wait
docker compose exec -T postgres psql -U taff -d taff < /tmp/taff-pg16.sql
pnpm db:migrate
```

Make the dump while the old container is still running, before recreating it
with the new image and volume. Fresh installs need no restore; use the README
quick start. Keep the old volume and protected backup until the new database
has passed validation. Never use `docker compose down -v` as an upgrade step.
