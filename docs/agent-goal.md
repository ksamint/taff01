# Agent goal: finish Taff M9 and hand over

> The prototype port from `docs/agent-goal-ui-parity.md` is merged (PR 2,
> 2026-10-10). Two of its items remain and come first here: item 0 below
> (LCP) and the visual baselines named in that goal's closing note.

Paste everything below this line as the goal for a coding agent working in
`ksamint/taff01`. It is self-contained; the files it names are in the
repository.

---

Finish milestone M9 of Taff, an open-source (MIT), performance-first,
AI-native task and calendar app where people and AI agents work as one team,
and leave `main` ready for a production deployment with Docker Compose and
Caddy. Milestones M1 to M8 are merged on `main`; read their reports before
touching code. Work on a branch, push often, and never wait for approval
between steps: the user reviews asynchronously.

Read first, in this order: `AGENTS.md`, `instruction_v0.md`,
`docs/implementation-plan.md`, `docs/milestones/08-*.md` (the audit fixes,
packaging and the performance analysis), the other `docs/milestones/*.md`,
`docs/adr/*.md` (0003 carries the licence decisions, amended for axe-core),
`docs/deploy.md`, `docs/ui/README.md`, `docs/realtime.md`, `README.md`. Read
each package's installed docs under `node_modules` before using an API; the
versions moved in 2026 and training data is stale.

Standing rules that override anything else:

- Architecture: `packages/core` is the only code that touches the database;
  `apps/api` REST and MCP are thin adapters over it. `packages/schemas` (Zod)
  is the single definition of every body, tool argument and client type.
  Every mutation runs in one transaction, writes an `activity` row with the
  actor and emits `NOTIFY taff_changes`. Permissions go through
  `can(actor, action, resource)` with a table-driven test per rule.
- Stack is fixed and installed (Node 24, pnpm 12, Next.js 16, React 19,
  Tailwind 4, TanStack Query 5, @schedule-x, i18next 26, Hono 4, better-auth,
  MCP SDK v2, Drizzle, PostgreSQL 18, Valkey 9, BullMQ 6, Biome 2, Vitest 5,
  Playwright). Propose any stack change in an ADR, never swap.
- Design: the TABLE AI tokens in `apps/web/src/styles/tokens.css` and the
  prototype in `docs/ui/prototype/` are the reference. 44 px touch targets,
  12 px minimum text, visible focus, keyboard alternatives to drag. No second
  CSS system, no second palette.
- i18n: every string through i18next with keys in
  `apps/web/locales/{en,zh-CN,zh-HK}/*.json`, all three in the same commit.
  Dates and numbers in the user's locale and time zone.
- Security: agent tokens stored only as `sha256(token + TOKEN_PEPPER)`, shown
  once, never logged; `/mcp` rate-limited per token in Valkey before any
  database access; JSON-RPC batches rejected; CORS locked to `AUTH_URL`;
  secrets only from env; `.env.example` and `.env.production.example` list
  every variable; never commit secrets.
- Performance budget: mobile Today initial JS ≤ 200 KiB gzipped
  (`pnpm perf:budget`), LCP ≤ 2 s on simulated slow 4G (`pnpm perf:lcp`, run
  it with `LCP_LOCALE=en`, `zh-CN` and `zh-HK`), Lighthouse mobile scores
  ≥ 90. No client dependency over 20 KB gzipped without an ADR.
- Licences: MIT, Apache-2.0, BSD, ISC. Never GPL, AGPL, SSPL, LGPL or
  commercial. The only MPL-2.0 exceptions are `lightningcss`, `@vercel/og`
  and, as a devDependency only, `axe-core` for Lighthouse (ADR 0003).
  `pnpm licence:check` enforces this; state the licence of each new
  dependency in its commit message.
- Working rules: conventional commits, small and one change each; tests ship
  with the code; design decisions in `docs/adr/NNNN-title.md`; keep the
  README quick start and `docs/deploy.md` true.

Validation before every push, all green:
`pnpm lint && pnpm typecheck && pnpm licence:check && pnpm test && pnpm build
&& pnpm build:server && pnpm perf:budget && pnpm e2e && pnpm mcp:smoke`
(`mcp:smoke` needs `pnpm dev` running; `e2e` starts the services itself).
`.github/workflows/ci.yml` runs the same set and builds the three images;
keep it green.

Milestone protocol (no gates): finish an item, validate, push, update
`docs/milestones/09-hardening-and-handoff.md` with what works, what is
missing, open decisions and the validation evidence, then continue. Stop and
ask only for decisions that change the product contract: licences, deleting
data, publishing outside the repository, or a stack change.

Decisions already taken (do not reopen): Traditional Chinese (Hong Kong) is
the source Chinese and ships beside Simplified and English; agent icon
`sparkles`; review policy per agent defaulting to "always review"; Valkey
instead of Redis; MCP SDK v2; bearer agent tokens remain the MCP contract
until an authorization server is chosen; `font-display: optional` on the web
fonts (a slow first visit shows the system font); Today renders 20 cards
and a "Show more" button.

M9 scope, in this order, each with acceptance:

0. LCP ≤ 2 s in every locale, before anything else. After the prototype
   port the signed-in Today route measures about 2.3–2.5 s in en and
   2.5–2.7 s in zh-HK on the production build over simulated slow 4G
   (`pnpm perf:lcp`, ±150 ms run to run; `LCP_TRACE=1` writes the Chrome
   trace, `LCP_DEBUG=1` prints the LCP element). The budget is 2,000 ms.
   `docs/milestones/10-ui-parity.md` ("Still open") records the trace
   reading; the causes, in the order they cost time:
   - The layout's client chunk (`app/layout-*.js`) is not among the initial
     scripts in the HTML, so hydration waits one extra round trip for it,
     then another for the cache-persistence chunk that it imports. Both
     must be in the initial script list or inlined into a chunk that is.
   - After the scripts arrive (~1.7 s on slow 4G) the shell spends about
     650 ms on the main thread before the first list paints: hydration,
     the session confirmation request, then a second render from the
     query cache. Render the first Today paint from the data the server
     already has (`initialMe`, the preloaded tasks and calendar reads) in
     one pass, and let session confirmation gate writes, not the paint.
   - The Chinese font still loads through CSS on an English visit; keep it
     to `lang="zh-*"` only. `font-display: optional` stays.
   - Only then cut JavaScript further: split `@taff/schemas` so Today
     ships only the schemas it parses, lazy-load i18next resources and
     non-Today code, and read the chunk list from `pnpm perf:budget`.
   Measure after each change, in all three locales, and keep the number in
   the milestone report. Acceptance: `LCP_LOCALE=en`, `zh-CN` and `zh-HK`
   `pnpm perf:lcp` medians ≤ 2,000 ms over three runs each on the
   production build, `pnpm perf:budget` still green, every Playwright flow
   still passing.
1. Lighthouse in CI. Add `lighthouse` as a devDependency (its `axe-core`
   dependency is the approved MPL-2.0 exception; the gate already allows it)
   and a `pnpm perf:lighthouse` script that audits the signed-in Today route
   on the production build with the mobile preset in en, zh-CN and zh-HK,
   failing below 90 on performance, accessibility and best practices. Run it
   in `ci.yml` after `perf:budget`. Acceptance: the script and CI pass; the
   report JSON is uploaded as a CI artifact.
2. LCP guard. With item 0 green, make `pnpm perf:lcp` fail CI in all three
   locales when a median exceeds 2,000 ms, so the number cannot drift back.
   Acceptance: the gate runs in `ci.yml` after `perf:budget` and is green.
3. Accessibility pass against the floor in `docs/ui/README.md`: every
   interactive element reachable and operable by keyboard, visible focus,
   names on icon-only buttons, dialogs trap focus and restore it, live
   regions for optimistic results and errors, 44 px targets on phone,
   contrast at AA in light and dark. Fix what Lighthouse accessibility and a
   manual keyboard walk of every route find. Acceptance: Lighthouse
   accessibility ≥ 90 in all locales and a Playwright keyboard-only flow that
   creates a task, assigns it, opens it and approves a review in all locales.
4. i18n QA: no hard-coded strings (grep every JSX text node and `title`,
   `aria-label`, `placeholder`), key parity across the three files with a
   test that fails on a missing or extra key, Chinese typography (full-width
   punctuation, no orphaned Latin plural rules), plural and count forms,
   dates and numbers through `Intl` in every view, `lang` attribute follows
   the locale. Acceptance: the parity test and a Playwright screenshot of
   every route in every locale committed under `docs/ui/screenshots/`.
5. Prototype seed data: extend `pnpm db:seed` so a fresh database shows the
   prototype's people, agents, organizations, permissions, grants, review
   items, tasks, projects, calendar entries and digests from
   `docs/ui/prototype/team-tasks.dc.html` (`PEOPLE`, `AGENTS`, `ORGS`,
   `PERMS`, `REVIEW_CHECKS`, `MCP_SCOPES`, `TOOLD`), idempotent and safe to
   re-run, with the demo credentials from `.env.example`. Acceptance: seed on
   an empty database, then every route has content in every locale and the
   e2e suite still passes.
6. Outgoing email for invitations: add an SMTP sender (nodemailer, MIT)
   behind an `EMAIL_*` env group with a logging fallback when unset; send the
   invitation link and verify the invitee's address on acceptance; document
   the variables in both env examples and `docs/deploy.md`. Acceptance:
   integration test with a fake transport; the invite flow e2e passes with
   the fallback.
7. Release readiness: run the README quick start and `docs/deploy.md` from a
   clean checkout and fix every gap; write `CHANGELOG.md` with the M1–M9
   release notes; tag `v0.1.0` only when every validation command and CI are
   green; write `docs/milestones/09-hardening-and-handoff.md` with the final
   evidence and the list of open decisions (OAuth 2.1 authorization server,
   BullMQ PostgreSQL backend ADR, scheduled upgrades in
   `docs/upgrade-plan.md`).

Scheduled upgrades to apply when their dates arrive, per
`docs/upgrade-plan.md`: Node 26 after 2026-10-28, PostgreSQL 19 after GA,
TypeScript 7.1 in November, Drizzle 1.0 when final.
