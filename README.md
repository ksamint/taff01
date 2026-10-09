# Taff

An open-source, performance-first task and calendar app where people and AI
agents work as one team. Mobile web and PWA first, in English, Simplified Chinese
and Traditional Chinese (Hong Kong).

## Status

Phase 1 provides a mobile Today view, email/password sign-up and sign-in,
personal workspaces, task creation, person ownership and person/agent
assignment. Milestone 01 adds the TABLE AI design system, light and dark themes,
the Calendar, Projects, Inbox and Me routes and three locales (en, zh-CN, zh-HK).
Milestone 02 adds agent tokens, the `/mcp` Streamable HTTP endpoint with five
tools over core, a per-token rate limit, a call log and the MCP settings page.
Milestone 03 adds agent runs, actual events and artifacts, scoped permissions and
expiring grants, a review workspace with comments and checklist, and a managed
Inbox. MCP includes `files.attach` and run controls.
Milestone 04 adds authenticated workspace WebSockets, cache reconciliation after
disconnects, and optimistic writes with rollback across tasks, runs, reviews,
permissions, Inbox and settings.
Milestone 05 adds versioned task editing, real subtasks and comments, project
boards and lists, authorized search, editable Quick Add parsing, organizations,
single-use invitations and admin/member/guest roles.
Milestone 06 adds day/week/month calendars, moves and resizes with Undo,
atomic slot creation, an unscheduled tray and agent time. Calendar intervals
and bounded recurrence have their own saved time zone and preserve task
deadlines. MCP exposes twenty tools.
Milestone 07 is a progress checkpoint: authenticated IndexedDB persistence,
public-only PWA caching, notification preferences and recipient-scoped daily
digests are implemented. Core owns database access, workspace permissions and
transactional activity/notification behavior; BullMQ retries digest generation.
All 75 production browser cases pass.
Milestone 08 fixes the findings of a full audit of M3–M7 (atomic MCP task
updates, batch rejection, limiter before token lookup, scoped socket closes,
heartbeats and caps, person-held run pauses, agent task creation limits,
database kind and vocabulary checks, browser time zone, versioned service
worker and locale caches) and adds production packaging: server bundles,
Docker images, a production compose file with Caddy, a licence gate, an LCP
measurement on simulated slow 4G and a GitHub Actions pipeline.
Lighthouse's axe-core dependency (MPL-2.0) still needs the licence decision of
ADR 0003; `pnpm perf:lcp` covers the LCP limit without it.
See [the deployment guide](docs/deploy.md) and the M8 milestone report.

Open items for release: OAuth 2.1 metadata on `/mcp` (needs an authorization
server decision), outgoing email for invitations, the M9 accessibility and i18n
pass, prototype seed data and release notes. Milestone reports record working
behavior and validation; development continues while they are reviewed.

## Quick start

Install Node 24, pnpm 12 and Docker with Compose, then:

```sh
git clone https://github.com/ksamint/taff01.git
cd taff01
pnpm i --frozen-lockfile
cp .env.example .env
```

Edit `.env`: choose a local PostgreSQL password and use the same URL-encoded
password in `DATABASE_URL` and `TEST_DATABASE_URL`. Set `AUTH_SECRET` to at least
32 random characters (for example, generate one with `openssl rand -hex 32`).
Choose an 8–128 character `DEMO_PASSWORD`; the seed uses it for the five demo people.
Keep the local URLs and ports unless you also update the corresponding service
configuration. Never use the example secret values in production.

```sh
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [the local app](http://localhost:3000). Sign in as `alex@taff.local` using your
`DEMO_PASSWORD`, or create a new account. The demo workspace has five people and
three agents. Re-running the seed preserves existing accounts, passwords and tasks.
Changing `DEMO_PASSWORD` after seeding does not reset existing passwords.

Web runs on port 3000 and proxies `/api`, including `/api/realtime` WebSockets,
to the API on port 3001. PostgreSQL 18 and
Valkey 9 bind locally to 55432 and 56379. `AUTH_URL` defines the browser origin;
`API_INTERNAL_URL` defines the web-to-API proxy target. `.env.example` documents all
configuration. Secrets stay in the ignored `.env` file.

Stop `pnpm dev` with Ctrl-C. Stop the local data services with `docker compose stop`;
the PostgreSQL volume persists. Do not delete the volume unless you intend to erase
local data.

## Validation

Create a separate test database, then run:

```sh
docker compose exec -T postgres createdb -U taff taff_test
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm e2e
```

Create `taff_test` only once. `pnpm test` loads `.env` when present. PostgreSQL tests
skip visibly without `TEST_DATABASE_URL` and reject names that do not end in
`_test`; use a database distinct from `DATABASE_URL`. These tests create data in
that dedicated database. Mobile Playwright runs en, zh-CN and zh-HK, verifies real
signup and assignment, language persistence and optimistic rollback. It requires
the seeded demo password and starts the development services if needed. It adds
sample users/tasks to the local app database.

`pnpm build` builds the web production bundle; `pnpm perf:budget` then measures
the Today page's gzipped JavaScript against the 200 KiB budget, and
`pnpm perf:lcp` measures Today's Largest Contentful Paint on the production
build under a simulated slow-4G phone (median of three runs, limit 2 s; set
`CHROMIUM_PATH` to use a system browser). `pnpm licence:check` verifies every
installed package against the licence policy. API and worker run from
TypeScript during development; `pnpm build:server` bundles them, with the
migrator, for the production images described in
[the deployment guide](docs/deploy.md).
`pnpm mcp:smoke` connects the official MCP client to the running API, exercises
every tool, measured events, artifacts, grants, review changes, the rate limit
and revocation; run it with `pnpm dev` up. Agents must submit their own real
outputs: assigning or starting a run does not launch an LLM or simulate progress.
Run duration and cost limits pause further submissions from reported metrics;
external runtimes must enforce their own process limits. See
[the agent run contract](docs/agent-runs.md) for versioned inputs and scope rules.
See [the realtime contract](docs/realtime.md) for socket authorization and cache
reconciliation behavior.
See [the planning contract](docs/planning.md) for task versions, invitations,
permissions, search and Quick Add behavior.
See [the calendar contract](docs/calendar.md) for separate intervals,
whole-series editing, recurrence limits and DST behavior.

## Structure

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js mobile UI, three locales, cache-first queries and optimistic mutations |
| `apps/api` | Thin Hono REST/auth adapters, workspace WebSocket fan-out, `/mcp` Streamable HTTP, rate limiting, validation and sanitized logging |
| `apps/worker` | BullMQ 6 connection to Valkey and rejection of unsupported jobs |
| `packages/schemas` | Shared Zod schemas and inferred client types |
| `packages/db` | Drizzle schema, migrations, PostgreSQL connection and audit triggers |
| `packages/core` | Business logic, permissions, authentication, transactional operations and seed |

The fixed stack and budgets are specified in [the standing rules](instruction_v0.md).
See [the implementation plan](docs/implementation-plan.md), [the upgrade plan](docs/upgrade-plan.md),
[the UI specification](docs/ui/README.md) and [architecture decisions](docs/adr).
Coding agents start from [the agent goal](docs/agent-goal.md).

## Contributing

Read [AGENTS.md](AGENTS.md). Use conventional commits and keep changes focused.
Tests accompany behavior changes. Add all three locales for every user-facing string.
Never commit credentials. Document every new environment variable with a dummy
value in `.env.example`.

## License

The application source is [MIT](LICENSE). Third-party dependencies retain their
own licenses. The prescribed Next.js and Tailwind stack carries two transitive
MPL-2.0 components, accepted as documented exceptions in
[ADR 0003](docs/adr/0003-transitive-license-decision.md); GPL, AGPL and SSPL
code is not permitted. The queue and rate-limit store is Valkey (BSD-3) rather
than Redis 7.4+ (RSAL/SSPL) for the same reason.
