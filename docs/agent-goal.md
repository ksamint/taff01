# Agent goal: build Taff from the approved prototype

Paste everything below this line as the goal for a coding agent working in
`ksamint/taff01`. It is self-contained; the files it names are in the repository.

---

Build Taff, an open-source (MIT), performance-first, AI-native task and calendar
app where people and AI agents work as one team, from the approved prototype in
`docs/ui/prototype/` on the stack and rules in `instruction_v0.md`. Deliver the
milestones M1 to M9 defined in `docs/implementation-plan.md`, in order, without
waiting for approval between them. The result must be ready for user testing on
phones (H5 / PWA) and desktop, and deployable with Docker Compose and Caddy.

Read first, in this order: `AGENTS.md`, `instruction_v0.md`,
`docs/implementation-plan.md`, `docs/ui/README.md`,
`docs/ui/prototype/audit-and-upgrade-plan.md`, `docs/adr/*.md`,
`docs/upgrade-plan.md`, `docs/milestones/*.md`, `README.md`. Then open
`docs/ui/prototype/team-tasks.dc.html` through a static server and walk every
screen in both languages before writing UI code; its inline script is the
behavioural reference (data in `PEOPLE`, `AGENTS`, `ORGS`, `PERMS`,
`REVIEW_CHECKS`, `MCP_SCOPES`, `TOOLD`).

Standing rules that override anything else:

- Architecture: `packages/core` is the only code that touches the database;
  `apps/api` REST and MCP are thin adapters over it. `packages/schemas` (Zod) is
  the single definition of every body, tool argument and client type. Members
  are people or agents; a task's owner is always a person; a worker may be an
  agent; agent output waits in `needs_review` unless the agent's review policy
  says otherwise (ADR 0005). Every mutation runs in one transaction, writes an
  `activity` row with the actor and emits `NOTIFY taff_changes`. Permissions go
  through `can(actor, action, resource)` with a table-driven test per rule.
- Stack (fixed, already installed and validated): Node 24, pnpm 12, Turborepo 2,
  TypeScript 7, Next.js 16 App Router, React 19, Tailwind 4, shadcn/ui on the
  TABLE AI tokens, TanStack Query 5 with IndexedDB persistence, @schedule-x/react,
  i18next 26, date-fns + rrule, Hono 4 + @hono/node-server 2, better-auth,
  @modelcontextprotocol/server and client 2 (Streamable HTTP, spec 2026-07-28),
  ws, pino 10, Drizzle + postgres driver, PostgreSQL 18, Valkey 9 + BullMQ 6,
  Biome 2, Vitest 5, Playwright, Docker Compose + Caddy. Read each package's
  installed docs under `node_modules` before using an API; the versions moved in
  2026 and training data is stale. Propose any stack change in an ADR, never swap.
- Design: implement the prototype faithfully. Tokens from
  `docs/ui/prototype/_ds/table-ai-design-system/tokens/` through Tailwind
  `@theme`; Manrope and Noto Sans TC; Lucide icons; agent icon `sparkles`;
  square cards, 2px controls, hairlines, gold at most 8% of a view; 44px touch
  targets, 12px minimum text, focus management, keyboard alternatives to drag.
  No second CSS system, no second palette.
- i18n: every string through i18next with keys in
  `apps/web/locales/{en,zh-CN,zh-HK}/*.json`, all three in the same commit.
  Dates and numbers in the user's locale and time zone, never a fixed zone on
  the server.
- Security: agent tokens stored only as `sha256(token + TOKEN_PEPPER)`, shown
  once, never logged; `/mcp` rate-limited per token in Valkey; every MCP tool
  validates with the shared Zod schema before calling core; CORS locked to
  `AUTH_URL`; secrets only from env; `.env.example` lists every variable.
- Performance budget: mobile Today initial JS ≤ 200 KB gzipped, LCP ≤ 2 s on
  simulated 4G, Lighthouse ≥ 90; cache first then reconcile; optimistic
  mutations with rollback; no client dependency over 20 KB gzipped without an
  ADR. No offline sync in v1.
- Licences: MIT, Apache-2.0, BSD, ISC. Never GPL, AGPL, SSPL, LGPL or commercial.
  State the licence of each new dependency in its commit message.
- Working rules: conventional commits, small and one change each; tests ship
  with the code (Vitest for core, api and schemas; Playwright for the key flows
  in all three locales); design decisions in `docs/adr/NNNN-title.md`; keep the
  README quick start true; never commit secrets.

Validation before every push: `pnpm lint && pnpm typecheck && pnpm test &&
pnpm build && pnpm e2e`, plus `pnpm mcp:smoke` once it exists. A push that
turns these red is not done.

Milestone protocol (no gates): finish a milestone, run the validation, push to
the working branch, write `docs/milestones/NN-title.md` with what works, what is
missing, open decisions and the validation evidence, then start the next
milestone immediately. The user reviews asynchronously and may redirect by
message. Stop and ask only for decisions that change the product contract:
licences, deleting data, publishing outside the repository, or a stack change.

Decisions already taken (do not reopen): Traditional Chinese (Hong Kong) is the
source Chinese and ships beside Simplified and English; agent icon `sparkles`;
review policy per agent defaulting to "always review"; Valkey instead of Redis;
MCP SDK v2 packages; the two MPL-2.0 components of Next and Tailwind are the
only copyleft exceptions; the combined `pnpm dev` runner stays and Playwright
starts services per entry.

Milestones, in order, with acceptance (details in `docs/implementation-plan.md`
and the route table in `docs/ui/README.md`):

1. M1 Design system foundation: tokens, fonts, icons, restyled primitives,
   phone and desktop shells, light and dark themes, three locales seeded from
   the prototype. Acceptance: Today matches the prototype on phone and desktop
   in every locale; Playwright screenshots; bundle within budget.
2. M2 Agent tokens and MCP: hashed scoped tokens; `/mcp` with the six tools over
   core; Valkey rate limit; `mcp_calls`; MCP page; `pnpm mcp:smoke`.
   Acceptance: smoke test exercises every tool and the limit; `can()` tests for
   scopes.
3. M3 Agent runs and review: runs with events; start, pause, resume, cancel;
   agent profile with Allow / Ask / Deny permissions, scoped expiring grants with
   history and review policy; review workspace with checklist, approve and
   request changes; Inbox with tabs, unread, snooze, grouping; Today's
   agents-at-work card. Acceptance: Playwright assign → status → approve from
   Inbox in all locales.
4. M4 Realtime and optimistic cache: `NOTIFY` → WebSocket hub → TanStack
   invalidation; every mutation optimistic with rollback. Acceptance: two
   browsers converge within a second.
5. M5 Task model and views: editable fields, subtasks, labels, board with drag,
   list with filters and sorting, Search (⌘K), organizations with invites and
   roles, quick add. Acceptance: Playwright board drag and search.
6. M6 Calendar: @schedule-x day, week, month; drag to move and resize; tap to
   create; unscheduled tray; agent background lane; rrule; time zones.
   Acceptance: Playwright drag in all locales; recurrence and time-zone tests.
7. M7 Cache, PWA and notifications: IndexedDB persistence, PWA manifest and
   service worker, notification preferences, daily digest on BullMQ,
   performance budget script. Acceptance: budget script passes on Today.
8. M8 Production and CI: Docker images, Caddy, production compose, CI with
   every check and the licence gate, OAuth 2.1 metadata for `/mcp`, security
   pass, README verified from a clean checkout.
9. M9 Hardening and handoff: accessibility floor, i18n QA, prototype seed data,
   release notes.

Scheduled upgrades to apply when their dates arrive, per `docs/upgrade-plan.md`:
Node 26 after 2026-10-28, PostgreSQL 19 after GA, TypeScript 7.1 in November,
Drizzle 1.0 when final.
