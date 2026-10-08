# 0004 — Stack version review (October 2026)

## Status

Proposed on 2026-10-08. Awaiting the user's decision on each row marked
"proposed". Items marked "applied" were required by existing rules and have
been applied without changing the fixed stack.

## Context

The standing rules fix major versions that were current when written. The user
asked whether each pinned version is still the best choice. Upstream status was
checked on 2026-10-08 against official release pages and release trackers.

| Component | Rule | Installed | Upstream on 2026-10-08 | Recommendation |
| --- | --- | --- | --- | --- |
| Node | 22 | 22.22 | 24 is Active LTS, moving to maintenance on 2026-10-20. 26 becomes LTS on 2026-10-28. 22 is in maintenance, EOL 2027-04-30. | Proposed: move to 24 now and to 26 after 2026-10-28 once Next, pnpm and Playwright confirm support. |
| pnpm | 10 | 10.34 | 12.10 is current (12.0 on 2026-08-26). 11 shipped 2026-04-28. 10 is supported until 2027-04-30. | Proposed: move to 12. Lockfile regeneration needed. |
| Turborepo | 2 | 2.11 | 2.x current; 3.0 is being prepared behind future flags. | Keep 2. |
| TypeScript | 5 | 5.9 | 7.0 GA on 2026-07-08 (native compiler, no JS API until 7.1, expected 2026-11). 6.0 shipped 2026-03-23 as the last JS-based line. | Proposed: move to 6 now; 7 after 7.1 ships and Next's TypeScript CLI mode is stable. |
| Next.js | 16 | 16.4.0 | 16.4.0 is the latest stable (2026-10-06). 17 is unreleased. | Keep 16. |
| React | 19 | 19.3 | 19.3.0 (2026-09-09). No React 20 announced. | Keep 19. |
| Tailwind | 4 | 4.3.3 | 4.3.3 is latest. No v5. | Keep 4. |
| shadcn/ui | — | local copies | Component source is vendored, not a dependency. | Keep. |
| TanStack Query | 5 | 5.104 | React adapter is still 5.x. v6 exists only for Svelte/Solid. | Keep 5. |
| Hono | 4 | 4.13 | 4.13.13 is latest. No Hono 5. | Keep 4. |
| better-auth | — | 1.7.7 | 1.7.x is current. No 2.0. | Keep. |
| MCP SDK | `@modelcontextprotocol/sdk` | not yet added | v1 (1.32) is a maintenance line for spec 2025-11-25 with fixes for about six months from 2026-07-27. v2 is split into `@modelcontextprotocol/server` and `@modelcontextprotocol/client` (2.1) for spec 2026-07-28, with Streamable HTTP. | Proposed: Phase 2 uses the v2 packages. The rule text names the v1 package. |
| Drizzle ORM | — | 0.45.4 | 0.45.x stable; 1.0 is at release-candidate stage. | Keep 0.45; move to 1.0 when final. |
| PostgreSQL | 16 | 16 (compose) | 18.6 is current. 19 is at beta 4 with GA targeted for late October 2026. 16 is supported until 2028-11. | Proposed: move to 18 now (`postgres:18-alpine`; its image stores data under a new path, so the compose volume mount changes). 19 after GA, once the `postgres` driver and Drizzle are verified. |
| Redis | 7 | `redis:7-alpine` → 7.4.x | Redis 7.4 and later are RSALv2/SSPLv1; Redis 8 adds AGPLv3. Both are banned by the standing rules. Redis 7.2.16 (2026-08-17) is BSD-3 with security fixes to 2029-12. Valkey 9.1 is the BSD-3 Linux Foundation fork and reports a Redis-compatible version to clients. | Applied: compose now pins `redis:7.2-alpine` so the service is BSD-licensed. Proposed: replace Redis with Valkey 9, which ioredis and BullMQ use unchanged. |
| BullMQ | 5 | 5.81 | 6.0 shipped 2026-07-30 with pluggable backends including PostgreSQL; the constructor changed. 6.3.x is current. | Keep 5 for Phase 2. Proposed follow-up ADR: BullMQ 6 on the PostgreSQL backend would remove the Redis/Valkey service entirely, leaving only MCP rate limiting to move to PostgreSQL. |
| Biome | 2 | 2.5 | 2.5.x is current. No Biome 3. | Keep 2. |
| Vitest | — | 3.2.7 | 5.0.x shipped September 2026; 4.1.11 is the 4.x line. | Proposed: move to 4.1 or 5.0. |
| Playwright | — | 1.64 | 1.64 is current. | Keep. |
| Caddy | 2 | — | 2.x is current. | Keep 2. |

## Decision

Pending. Applying the proposed rows needs the user's approval because the stack
is fixed by the standing rules. The applied Redis pin is not a stack change: the
rule says Redis 7, and 7.2 is the last BSD-licensed 7.x line.

## Consequences

If approved, the version bumps land as small `chore:` commits after Phase 1
review and before Phase 2 work that depends on them (the MCP package choice in
particular). Each bump re-runs lint, typecheck, tests, e2e and build. If declined,
the current versions stay supported for at least six months, except the Redis
image, which is fixed either way.
