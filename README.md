# Taff

An open-source, performance-first task and calendar app where people and AI
agents work as one team. Mobile web and PWA first, in Simplified Chinese and English.

## Status

The Phase 1 implementation provides a bilingual mobile Today view, email/password
sign-up and sign-in, personal workspaces, task creation, person ownership and
person/agent assignment. Core owns database access, workspace permissions and
transactional activity/notification behavior. The worker connects to Redis; no
background job handlers are exposed yet.

MCP, the review Inbox, WebSocket fan-out, calendar, recurrence, IndexedDB persistence,
PWA installation and release performance gates are scheduled for later phases.
This is a development foundation, not a production release. Each phase ends with
user review before the next starts.

## Quick start

Install Node 22, pnpm 10 and Docker with Compose, then:

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

Web runs on port 3000 and proxies `/api` to the API on port 3001. PostgreSQL and
Redis bind locally to 55432 and 56379. `AUTH_URL` defines the browser origin;
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
that dedicated database. Mobile Playwright runs both en and zh-CN, verifies real
signup and assignment, language persistence and optimistic rollback. It requires
the seeded demo password and starts the development services if needed. It adds
sample users/tasks to the local app database.

`pnpm build` currently builds the web production bundle. API and worker run from
TypeScript during development; production packaging is a later phase.
`pnpm mcp:smoke` will be introduced with the MCP tools in Phase 2.

## Structure

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js mobile UI, bilingual strings, cache-first queries and optimistic mutations |
| `apps/api` | Thin Hono REST/auth adapters, CORS, validation and sanitized logging |
| `apps/worker` | BullMQ connection and rejection of unsupported jobs |
| `packages/schemas` | Shared Zod schemas and inferred client types |
| `packages/db` | Drizzle schema, migrations, PostgreSQL connection and audit triggers |
| `packages/core` | Business logic, permissions, authentication, transactional operations and seed |

The fixed stack and budgets are specified in [the original requirements](instruction_v0.md).
See [the implementation plan](docs/implementation-plan.md) and
[architecture decisions](docs/adr).

## Contributing

Read [AGENTS.md](AGENTS.md). Use conventional commits and keep changes focused.
Tests accompany behavior changes. Add both locales for every user-facing string.
Never commit credentials. Document every new environment variable with a dummy
value in `.env.example`.

## License

The application source is [MIT](LICENSE). Third-party dependencies retain their
own licenses. The prescribed Next.js and Tailwind stack carries two transitive
MPL-2.0 components, accepted as documented exceptions in
[ADR 0003](docs/adr/0003-transitive-license-decision.md); GPL, AGPL and SSPL
code is not permitted. The local Redis image is pinned to the BSD-licensed 7.2
line for the same reason.
