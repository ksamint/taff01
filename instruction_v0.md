# Taff — standing rules for coding agents

Taff is an open-source (MIT), performance-first, AI-native task and calendar app where humans and AI agents work as one team. Mobile web (H5 / PWA) first. Bilingual zh-CN and en.

## Architecture in five lines

- `packages/core` is the **only** code that touches the database. `apps/api` REST routes and MCP tools are thin adapters over it. If you find yourself writing SQL or Drizzle queries outside `packages/core` or `packages/db`, stop and move it.
- `packages/schemas` (Zod) is the single definition of every API body, MCP tool argument and shared client type. Never duplicate a shape.
- Members are people **or** agents (`members.kind`). A task's `owner_id` is always a person; `worker_id` may be an agent. Agent output waits in `needs_review` until a person approves.
- Every mutation runs in one transaction, writes an `activity` row with the actor, and emits Postgres `NOTIFY taff_changes`. The WebSocket hub in `apps/api/realtime` fans that out; the web app invalidates TanStack Query caches on receipt.
- Permissions go through one function: `can(actor, action, resource)` in `packages/core/permissions`. Add a table-driven test for every new rule.

## Stack (fixed — propose changes in an ADR, don't just swap)

Node 24 (26 once it is LTS on 2026-10-28) · pnpm 12 · Turborepo 2 · TypeScript 7 · Next.js 16 App Router · React 19 · Tailwind 4 · shadcn/ui on the TABLE AI design tokens · TanStack Query 5 (IndexedDB persist) · @schedule-x/react 4 · i18next 26 · date-fns 4 + rrule · Hono 4 + @hono/node-server 2 · better-auth 1.7 · @modelcontextprotocol/server + client 2 (Streamable HTTP, spec 2026-07-28) · ws · pino 10 · Drizzle ORM + `postgres` driver · PostgreSQL 18 · Valkey 9 + BullMQ 6 · Biome 2 · Vitest 5 · Playwright · Docker Compose + Caddy 2.

Versions were reviewed on 2026-10-08 (`docs/adr/0004-stack-version-review.md`); the follow-up schedule is in `docs/upgrade-plan.md`.

## UI and UX source of truth

`docs/ui/prototype/` holds the approved Team Tasks prototype and the TABLE AI design system (tokens, fonts, component inventory). Build every screen from it: Today, Calendar (day/week/month, drag, unscheduled tray), Projects board and list, Task detail, Review workspace, Inbox, Agent profile and permissions, Me/Settings, MCP page, Search (⌘K), Organizations, and the desktop layout. `docs/ui/README.md` maps each screen to routes, data and phases. Use the design tokens through Tailwind `@theme`; never introduce a second palette.

## Performance budget (CI fails if broken)

- Mobile Today route: initial JS ≤ 200 KB gzipped, LCP ≤ 2 s on simulated 4G, Lighthouse performance ≥ 90.
- Lists, board and calendar render from cache first, then reconcile. Mutations are optimistic with rollback.
- No new client dependency over 20 KB gzipped without an ADR.

## i18n

- Every user-facing string goes through i18next. Keys live in `apps/web/locales/{en,zh-CN,zh-HK}/*.json`. Add all three locales in the same commit (ADR 0005).
- Dates and numbers are formatted with the user's locale and time zone (`users.locale`, `users.tz`); never format on the server with a fixed zone.
- Leave room for longer English labels; test every locale in Playwright.

## Security

- Agent tokens: store only `hash = sha256(token + TOKEN_PEPPER)`; show the raw token once. Never log tokens or Authorization headers.
- `/mcp` is rate-limited per token in Valkey. All MCP tool handlers validate arguments with the shared Zod schema before calling core.
- CORS is locked to `AUTH_URL`. Secrets come only from env; `.env` is git-ignored and `.env.example` lists every variable with a dummy value.

## Commands
```sql
pnpm i                      install
pnpm dev                    web + api + worker with hot reload
pnpm db:migrate             apply Drizzle migrations
pnpm db:seed                demo workspace: 5 people, 3 agents (prototype data)
pnpm test                   Vitest (core, api, schemas)
pnpm e2e                    Playwright, mobile viewport, en, zh-CN and zh-HK
pnpm mcp:smoke              SDK client exercises every MCP tool against local api
pnpm lint && pnpm typecheck Biome + tsc

```

## Working rules

- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Small commits; one logical change each.
- Tests ship with the code: Vitest for core/api, Playwright for the key flows (assign to agent → status → approve from Inbox; drag on calendar; switch language; MCP client round trip) in every locale.
- Design decisions not covered here go in `docs/adr/NNNN-title.md` (context, decision, consequences), then carry on.
- New dependency → state its licence in the commit message. MIT, Apache-2.0, BSD and ISC are fine; copyleft (GPL/AGPL/SSPL) and commercial licences are not.
- Keep the README quick start true at all times.
- No blocking gates. At each milestone: push, write `docs/milestones/NN-title.md` (what works, what's missing, open decisions, validation evidence) and continue with the next milestone. The user reviews asynchronously and redirects by message. Stop only for decisions that change the product contract: licences, deleting data, publishing outside the repository.

## Don'ts

- Don't add an ORM other than Drizzle, a state library other than TanStack Query, or a second CSS system.
- Don't build offline sync in v1; cache-first with reconciliation is enough.
- Don't give agents any code path a person doesn't have.
- Don't hard-code English strings, dates in a fixed time zone, or absolute URLs.

save to instruction_v0.md and achieve the goal, create repo under github org ksamint as taff01, initial git etc