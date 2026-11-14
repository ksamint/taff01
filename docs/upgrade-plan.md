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

## Node 26 applied on 2026-10-27

| Component | From | To | Code impact |
| --- | --- | --- | --- |
| Node | 24 | 26.12 | `.node-version`, both Dockerfiles `node:26-alpine`; `engines` keeps `>=24 <27`. No source changes ([ADR 0024](adr/0024-node-26-runtime.md)). |
| @types/node | 24.19 | 26.6 | None. |

Node 26 refuses `--env-file` in `NODE_OPTIONS`; pass it only on the launching
`node` command, as the package scripts do.

## Calendar dependencies applied on 2026-10-09

| Component | Version | Licence and integration |
| --- | --- | --- |
| Schedule-X React | 4.1.0 | MIT; calendar rendering stays on the Calendar route. |
| Calendar, controls, events service, theme, translations | 4.9.1 | MIT; BCP47 locale values and private CSS-safe event identifiers adapt the shared calendar DTOs. |
| Drag/drop and resize | Exact 3.7.3 | MIT; bound aliases bridge the three renamed v4 drag entry points. Resize's complete MIT `LICENSE` is verified by its recorded hash. |
| Temporal polyfill | Exact 0.3.2 | MIT; matches the calendar peer, with ISC `temporal-spec`. |
| Preact and signals | 10.29.8 / 2.11.3 | MIT; Schedule-X's rendering peers. |
| RRULE | 2.8.1 | BSD-3-Clause; core expands bounded local-time recurrence. Node ESM imports its CommonJS default before extracting `RRule`. |

[ADR 0006](adr/0006-calendar-schedules-and-free-gestures.md) records the free
plugin pins and the Calendar-route size exception. Today retains its 200 KiB
initial JavaScript limit. Core's PostgreSQL tests and the official MCP smoke
exercise schedules against the running Node 24 API; real browser gestures
verify the legacy plugin bridge.

## Patch refresh on 2026-10-17

`pnpm up -r` within the fixed majors: Next 16.4.2, React 19.3.1, better-auth
1.7.10, Hono 4.13.13, @hono/node-server 2.1.5, Zod 4.6.7, BullMQ 6.3.15,
TanStack Query 5.104.3, react-i18next 17.0.20, Tailwind 4.3.3, Vitest 5.0.5,
Turbo 2.11.8, Playwright 1.64.1 and smaller bumps. No new dependencies or
licences. Releases younger than pnpm's release-age cutoff were held back.
Validation: lint, typecheck, licence gate, 1689 Vitest tests on PostgreSQL 18,
production build, Today budget 191.9 KiB, `pnpm mcp:smoke` against the bundled API.

## Scheduled

| When | Move | How | Validation |
| --- | --- | --- | --- |
| After PostgreSQL 19 GA (RC 1 shipped 2026-10-15; GA moved from 2026-10-29 to 2026-11-19) | 18 → 19 | Compose image; run migrations on a fresh volume; confirm `postgres` driver and Drizzle have no 19-specific issues. Pin the CI image by digest as the approval workflow does. | `pnpm db:migrate`, `pnpm db:seed`, `pnpm test`. |
| TypeScript 7.1 (beta October 2026; release candidate and stable expected in the second half of November) | Nothing to change; 7.1 restores the programmatic API for tools that need it. Take the stable, not the RC. | `pnpm up typescript`. | `pnpm typecheck`, `pnpm build`. |
| When Drizzle 1.0 is final | 0.45 → 1.0 | Read the 1.0 migration guide; regenerate migration snapshots. | Integration tests. |
| Phase 2 decision | BullMQ PostgreSQL backend | Separate ADR: it would remove Valkey, move MCP rate limiting into PostgreSQL and change the worker's backend factory. | Load test of job throughput and rate-limit accuracy. |
| When BullMQ documents support | ioredis 5 → 6 (worker) | 6.0.0 shipped on 2026-10-07; BullMQ 6 declares `ioredis >=5` but has not released against 6. The API already runs ioredis 6 for the rate limiter; the worker stays on 5 until BullMQ confirms 6. | `pnpm test`, `pnpm mcp:smoke`, worker reaches ready. |
| With each Node major | `@types/node` | Tracks the runtime major (26 now). | `pnpm typecheck`. |
| Monthly | Minor and patch bumps | `pnpm up --latest` within the fixed majors; pnpm's release-age policy delays packages younger than its cutoff. | Full check set. |

## Feature rollout: shareholder daily summary (ADR 0027)

Design: [ADR 0027](adr/0027-shareholder-daily-summary.md). Goal:
[agent-goal-daily-summary.md](agent-goal-daily-summary.md). Review of the
work it waits on: [2026-11-05 review](reviews/2026-11-05-pr-and-plan-review.md).

| Order | Move | How | Validation |
| --- | --- | --- | --- |
| 0 | Merge or rebase the open PRs: #81 (migration 0038), #82 (0039), then #84 (CI and `instruction_v0.md`). | Re-enable `TAFF_FULL_CI_ENABLED` for the merges or record the owner's replacement evidence per `release-closeout.md`. | Eight-job CI green on each merge, or the recorded alternative. |
| 1 | Fix `Cache-Control: private` on authenticated SSR HTML (open item from PR #84's resync note). | Own small PR off `main`. | `ssr-session.spec.ts` green in en, zh-CN, zh-HK. |
| 2 | S1 schema, core, permissions, access matrix. | Next free migration number; additive; no backfill. | `pnpm test`; permission table rows; access-matrix test after role loss. |
| 3 | S2 worker jobs, REST, public share route, rate limit. | Same BullMQ queue; `summary-scan` every minute. | Route tests; processor test; `pnpm mcp:smoke` unchanged (33 or 34 tools). |
| 4 | S3 web: project tags, admin page, recipient pages, public watermarked page. | Lazy routes; CSS watermark; three locales per commit. | `pnpm perf:budget` Today ≤ 200 KiB; public page ≤ 50 KiB recorded; Playwright share flow in three locales; visual baselines. |
| 5 | S4 release as `v0.2.17`. | Candidate checkpoint in `deploy.md`; closeout per `release-closeout.md`. | Checklist evidence; `summary-scan` ready in the worker log; no production recipient created by the deployer. |
| 6 | S5 phase 2 on the owner's decision: PDF (`pdf-lib`, MIT), e-mail link, MCP read tools, weekly roll-up. | Each its own ADR amendment and release. | Licence stated per dependency; access matrix extended. |

Status 2026-11-05: rows 2–4 are done (milestones 86–88) and row 5's
candidate is prepared (milestone 89); production deployment and closeout are
pending. Rows 0 and 1 are not done. From row 4, the public page's 50 KiB
target is missed (187.5 KiB, ADR 0027 notes S3) and the visual baselines are
pending.

Interplay with ADR 0026 (Rust): the module is written in `packages/core`
TypeScript, which stays the authority. `buildDailySummary` is a pure
function with a Node-generated golden fixture so it joins `pnpm rust:fixtures`
when the Rust port reaches it; snapshot numbers are integers or decimal
strings to keep canonical JSON parity trivial.

## Release sequence after v0.2.17 (2026-11-05)

Plan: [agent-goal-access-and-completion.md](agent-goal-access-and-completion.md);
access design [ADR 0028](adr/0028-organization-wide-agent-grants.md).

| Order | Release | Move | Validation |
| --- | --- | --- | --- |
| 1 | v0.2.17 | Operator deploy, tag and closeout of the merged candidate. | `release-closeout.md`. |
| 2 | v0.2.18 | Land PR #81 (migration → 0039); ADR 0028 policy and enrollment (0040); MCP `workspaceId` on every tool, `workspaces.list`; Twin enrolled in every organization; SSR `Cache-Control: private`. | Access-change matrix after role loss; `pnpm mcp:smoke` 34 tools; `ssr-session.spec.ts` three locales. |
| 3 | v0.2.19 | Access matrix: `/orgs/access` and `/admin/access`; generated `docs/spec/permissions-matrix.md`; summary text and image renders (Rust `taff-render` service, migration 0041, `SUMMARY_RENDER_URL`), MCP `summaries.*` read tools with scope `summaries:read` (ADR 0029); CHANGELOG backfill v0.2.15–16. | `e2e/access.spec.ts` and `summaries.spec.ts` three locales; `pnpm rust:gate` render goldens; Today ≤ 200 KiB; four image builds. |
| 4 | v0.2.20 | JavaScript-to-TypeScript T0–T3; small open items C1–C6. | Table below. |
| — | no release | PR #82 rebased (0041) and merged on its evidence; Rust phase 0 (PR #84 rebased, local `pnpm rust:gate`) and phase 1. | `cargo fmt/clippy/test/deny`, fixture diff clean. |
| 5 | v0.2.21 | Designed summary report: shared display layout, colour Rust image (`image-2`), structured text (`text-2`); Python ports P1–P4 (ADR 0030). Plan: [agent-goal-v0.2.21-report-design-and-ports.md](agent-goal-v0.2.21-report-design-and-ports.md). | Three locale image and text goldens reviewed; `pnpm rust:gate`; policy test allow-list shrinks; neighbour check dual-run identical. |

## Release sequence after v0.2.24 (2026-11-14)

Languages stay per [ADR 0030](adr/0030-typescript-and-rust-only.md) (TypeScript
and Rust only) and [ADR 0026](adr/0026-backend-migration-to-rust.md) (backend to
Rust module by module). Targets: sector view — TypeScript (`packages/schemas`,
web client); view exports — TypeScript core/API/MCP/UI with the existing Rust
`taff-render`; no new Rust crate, migration or dependency in this release.

| Order | Release | Move | Validation |
| --- | --- | --- | --- |
| 1 | v0.2.25 | Merged on `main`: timeline export (PR #100), calendar export (PR #101), closeout docs (PR #99). Add the 營運視圖 / Sectors view ([operation templates](spec/operation-templates.md)). Fix any P0/P1 finding from the pre-release review of #99–#101 first. | Full local gate on the exact tree (`release-closeout.md` check 1), including `pnpm rust:gate` and the four image builds; Today ≤ 200 KiB. |
| 2 | v0.2.25 | Operator deploy from the deploy machine per `deploy.md`, automatic rollback to `ff411c6` on a failed check, closeout. | `release-closeout.md` checks 2–7. |
| 3 | after closeout | Create organization **XIDING** on behalf of an existing system administrator through the normal core `createWorkspace` (Organizations → create, or the accepted native operator invocation recorded in `deploy.md`). No direct SQL, promotion, password reset or token. | Organization inventory shows XIDING active beside Table AI, 侍天TIANSIGHT and APUCH; each system admin holds its protected admin membership; one default agent; zero tokens issued; Sectors view opens on a phone. |
| — | later | S3 graph view export (separate integration); project-level sector tags only with an ADR and migration. | Its own goal. |

## Tooling move: TypeScript-only sources (v0.2.20)

Plan: [agent-goal-js-to-ts.md](agent-goal-js-to-ts.md). Thirteen JavaScript
files remain beside 456 TypeScript files; `docs/ui/prototype*/` assets stay.

| Order | Move | How | Validation |
| --- | --- | --- | --- |
| 0 | v0.2.19 closeout recorded (sequence above). | Deploy operator, per `release-closeout.md`. | Tag `v0.2.19` on origin. |
| 1 | T0: type-check `scripts/` and `e2e/` in the gate. | Root `tsconfig.scripts.json`; fix pre-existing errors first. | `pnpm typecheck` clean; error count in the milestone. |
| 2 | T1: eleven `.mjs`/`.cjs` → `.mts`. | Native type stripping (Node ≥ 24); references updated in the same commit. | `pnpm test` (harness, capture, visual-clock tests), `pnpm e2e`. |
| 3 | T2: service worker from `src/sw/sw.ts`, `public/sw.js` generated. | esbuild in the web `build`/`dev` chain; `sw.js` git-ignored. | `persistence.spec.ts` PWA case in three locales; `/sw.js` headers on the candidate stack. |
| 4 | T3: v0.2.18. | Candidate checkpoint in `deploy.md`; full local gate; closeout. | Gate counts recorded; only `postcss.config.mjs` remains JavaScript. |

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
