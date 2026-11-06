# Upgrading Taff to the Rust + TypeScript architecture

Executable companion to [ADR 0026](adr/0026-backend-migration-to-rust.md).
It replaces `docs/rust-backend-plan.md` (which predates the owner decision and
listed `can()` as "never moved to Rust"; the obsolete file is absent). Written 2026-11-01 from the
review of [PR 84](reviews/2026-11-01-pr84-rust-backend-review.md).

## 1. Target architecture

| Layer | Today (TypeScript) | Target | Stays TypeScript? |
| --- | --- | --- | --- |
| Web client | `apps/web` Next.js 16 / React 19 | unchanged | yes |
| Wire contract | `packages/schemas` (Zod) | Zod stays the single source; emits JSON Schema that Rust validates and generates types from | yes |
| Domain logic | `packages/core` (~15.5k LOC) | `backend/crates/taff-domain` (pure) + `taff-db` (sqlx) | no |
| REST + MCP + WS adapters | `apps/api` Hono, `@modelcontextprotocol/server` | `taff-api` on `axum`, same paths and bodies | no |
| Jobs | `apps/worker` BullMQ | `taff-worker` on Valkey streams or `apalis` | no |
| Auth | better-auth 1.7 in `packages/core` | last to move; Rust validates better-auth sessions read-only until cutover | last |
| Migrations | Drizzle SQL files in `packages/db/migrations` (39) | same SQL files, applied by the existing direct deployment path; `sqlx::migrate!` can consume them once renamed | until last Node container goes |
| Database | PostgreSQL 18, one schema | unchanged; no fork | n/a |
| Edge | Caddy `@backend` → `api:3001`, else `web:3000` | Caddy routes paths to `api-rs` progressively | n/a |

Rules that carry over unchanged from `instruction_v0.md`:

- Only the Rust `taff-db` crate touches the database; `taff-api` and the MCP
  handlers are thin adapters. No SQL in adapters.
- Every mutation runs in one transaction, writes an `activity` row with the
  actor and emits `NOTIFY taff_changes`.
- One permission function, `can(actor, action, resource)`, table-tested.
- Rust never formats dates or numbers for a locale. It returns UTC instants
  plus raw wall data and the zone; the web client formats.
- Agents never get a code path a person lacks.
- Only MIT / Apache-2.0 / BSD / ISC (plus the documented permissive
  exceptions); each new crate's licence is named in the commit message.

## 2. Repository layout after the migration

```
backend/
  Cargo.toml                 workspace, resolver 3, edition 2024
  rust-toolchain.toml        pinned stable channel (bump deliberately)
  deny.toml                  cargo-deny licence allow-list
  crates/
    taff-domain/             pure logic: permissions, calendar, tz, security, canonical JSON
    taff-contract/           serde types generated from packages/schemas/generated/*.json
    taff-db/                 sqlx models, transactions, activity + NOTIFY, migrator
    taff-api/                axum: REST, MCP Streamable HTTP, WebSocket hub, rate limit
    taff-worker/             job consumer
    taff-auth/               better-auth session/cookie parity (phase 6)
  tests/parity/              fixtures generated from Node (committed, locally regenerated)
packages/schemas/generated/  JSON Schema emitted from Zod (committed, locally regenerated)
scripts/golden/              TypeScript generators that write the fixtures above
deploy/Dockerfile.rust       multi-stage build for taff-api / taff-worker
```

Do the crate split now, while `taff-core` is small. `axum`, `tokio`,
`tracing-subscriber` move out of the domain crate. `anyhow` stays only for the shared error envelope.

## 3. The contract pipeline (do this once, first)

1. Add `pnpm schema:gen`: runs `toJSONSchema` (zod/v4/core, `jsonSchema7`,
   `io: "input"` and `io: "output"`) for every exported body, response and
   MCP argument schema and writes `packages/schemas/generated/<name>.json`.
   Export one `Record<toolName, ZodSchema>` from `apps/api/src/mcp*.ts` and
   use it for both `registerTool` and the generator, so the tool list cannot
   drift (PR 84 shipped a phantom `workspaces.list`).
2. Generate Rust types from those files into `taff-contract` with `typify`
   (MIT/Apache-2.0) at build time via `build.rs`, or commit the output.
   Keep runtime validation with `jsonschema` at the adapter boundary for the
   same reason the Hono handlers run Zod before calling core.
3. Add `pnpm golden:gen`: runs every `scripts/golden/*.mts` generator and
   writes `backend/tests/parity/*.json`. Each generator emits full cases
   (inputs and expected output), never only booleans.
4. Local gate: `pnpm rust:gate` regenerates fixtures before Rust tests, runs
   fmt, clippy, locked tests and cargo-deny, and diffs every generated fixture
   path. It loads the local .env, requires TEST_DATABASE_URL and forces SQL
   parity against an explicitly loopback `_test` database. No CI or runners.

## 4. The per-module port checklist

Every module moves through the same six steps; a module is "ported" only when
all six are done and recorded in a milestone.

1. **Golden**: a generator in `scripts/golden/` that imports the TypeScript
   function and writes inputs + outputs, including rejection cases, all three
   locales where relevant and at least America/New_York, Australia/Lord_Howe,
   Asia/Kathmandu, a fixed offset and an ICU alias for anything with a zone.
2. **Port** into `taff-domain` (pure) or `taff-db` (data), with `serde`
   derives that use the TypeScript field names.
3. **Table-driven Rust test** that deserialises the fixture and asserts every
   case; no hand-copied literals.
4. **Adapter unchanged**: the Node adapter still calls the Node function.
   Nothing in production changes yet.
5. **Shadow** (for anything with I/O): the Rust path runs alongside and logs
   mismatches; zero mismatches for a full seed + MCP smoke run.
6. **Milestone entry** in `docs/milestones/` with validation numbers.

## 5. Phases, commands and exit criteria

### Phase 0 — land PR 84 clean

Fix the five blocking items in the review (fixture/generator mismatch, the
`normalize_rrule` divergences, `canonical_json` number formatting, the phantom
MCP tool, contradictory docs). Exit: the local Rust gate passes with the
regeneration diff step; no runtime or authority change.

### Phase 1 — foundation hardening (1 milestone)

- Split crates as in §2; pin Rust 1.97.1 and enforce deny.toml, fmt and clippy.
- Execute SQL read models against Node-generated disposable fixtures in the
  existing local PostgreSQL test database. Node applies the existing migrations
  and owns fixture writes/cleanup; Rust only reads. The local gate fails if the
  database prerequisite is missing rather than silently skipping SQL parity.
- Permissions: generated full actor/action/resource cases for every registered
  action, role, capability/grant branches, fixed-clock expiry and OAuth scopes.
- Canonical JSON: ryu-js for ECMAScript number formatting, serde_json
  float_roundtrip parsing, deterministic IEEE exponent/sign samples, UTF-16
  object-key ordering and Node byte comparisons.
- Recurrence normalization and timezone conversions: Node accepted/rejected
  fixtures cover reviewed UNTIL, prefix, anchor-zone and fixed-offset cases.

Exit for the foundation tranche requested by the access-and-completion goal:
crate boundaries, toolchain/licence gate and live SQL read-model parity pass
locally. No Rust backend authority or shadow traffic is enabled.

The remaining pure-port tranche is still required before its runtime cutover:
expandCalendarSchedule over 24 months/five zones, shiftCalendarSeries,
canonicalCalendarTimeZone's complete ICU alias behavior, summary/enrollment
planner ports and signed-wire parsing (including lone UTF-16 surrogates).
Their Node goldens remain authoritative; normalization fixtures alone do not
claim enumeration parity.

### Phase 2 — read path in Rust, shadow mode (2 milestones)

- `taff-db`: read models for members, tasks, projects, calendar, inbox, CRM,
  planning, timeline. Same SQL semantics as the Drizzle queries (ordering,
  pagination, archived filters).
- `taff-api` serves `GET` routes under a second port (`API_RS_PORT=3002`).
- Caddy gets a second matcher; start with `/api/health`, then one read route
  family at a time (`/api/tasks`, `/api/projects`, `/api/workspaces`…).
- Shadow: for each route, a script replays the Vitest API fixtures and the
  seed workspace against both ports and diffs JSON (sorted keys, dates as
  instants). Exit per route family: zero diffs across the seed in `en`,
  `zh-CN`, `zh-HK` and the five zones.
- Sessions: Rust validates the better-auth session cookie read-only (look up
  `sessions` by token, check expiry) so read routes work with existing logins.
  No session creation in Rust yet.

### Phase 3 — mutation core (2–3 milestones)

- Transactions in `taff-db`: write, `activity` row with actor, `NOTIFY
  taff_changes` with the same payload the hub expects.
- Port one write family at a time in the order of blast radius: comments →
  tasks → calendar → projects → CRM/planning → suggestions/runs/grants.
- Access changes rule (AGENTS.md): when a write family moves, enumerate every
  operation that issues, extends or re-enables access (approve, exchange,
  refresh, restore/undo, list, revoke) and test each with the lowest role that
  can reach it, including after that role loses the authority. Port
  `authorization.integration.test.ts` as the Rust table.
- Exit per family: `pnpm test apps/api/src` and `pnpm mcp:smoke` pass with
  `API_INTERNAL_URL` pointed at the Rust port; e2e flows (assign to agent →
  status → approve from Inbox; drag on calendar) green in all locales.

### Phase 4 — MCP and realtime (1–2 milestones)

- MCP Streamable HTTP (spec 2026-07-28) on `axum`; tool argument validation
  against `packages/schemas/generated` (the same schemas the Node server
  advertises); per-token rate limit in Valkey (`fred`, MIT).
- WebSocket hub: `PgListener` on `taff_changes`, fan-out to sockets, same
  frame shape as `apps/api/src/realtime.ts`; the web app must not change.
- Exit: `pnpm mcp:smoke` (official SDK client) green against Rust; realtime
  Playwright flow green.

### Phase 5 — worker (1 milestone)

- `taff-worker` consumes `digest-scan` / `daily-digest` and the other BullMQ
  job names from the same Valkey, or a Rust-native queue once the Node worker
  is gone. Idempotent, safe to re-run.
- Exit: `apps/worker` removed from `compose.prod.yaml`.

### Phase 6 — auth and cutover (1–2 milestones)

- `taff-auth`: better-auth parity for session creation, username, phone +
  password, Tencent SMS, email, OAuth 2.1 authorization server (ADR 0022/0023)
  with the same tables and cookie format, so existing sessions survive.
- Flip Caddy fully to `api-rs`; keep `api` (Node) deployable for one release
  as rollback. Then delete `apps/api`, `apps/worker`, `packages/core`.
- Migrations: keep `packages/db` + Drizzle for schema authoring (TypeScript
  stays in the repo for the web client anyway), or move to plain SQL applied by
  `sqlx::migrate!` with the same numbering. Decide in an ADR; never two runners
  on one database at the same time.

## 6. Dev workflow and tooling

```bash
pnpm dev                 # web + Node api + worker (unchanged)
cargo run -p taff-api    # Rust api on API_RS_PORT (reads the same .env)
cargo test --workspace --locked
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all -- --check
cargo deny check licenses
pnpm rust:gate
```

- `scripts/dev.ts` gains an optional `--rust` flag that also starts
  `cargo watch -x 'run -p taff-api'` (`cargo-watch`, MIT).
- Add `backend/package.json` with `"scripts": {"test": "cargo test …"}` so
  Turborepo can include it in `pnpm test` and `pnpm lint` as part of the same local gate.
- `deploy/Dockerfile.rust`: `rust:1.x-bookworm` builder with `cargo chef`
  layer caching, `gcr.io/distroless/cc` or `alpine` + musl runtime; image
  size and startup time recorded in the milestone.
- Observability: `tracing` with JSON output in the same field names pino uses
  (`level`, `time`, `msg`, `req.id`) so the existing log shipping keeps
  working; never log tokens or `Authorization` headers.

## 7. Risks and how each is bounded

| Risk | Bound |
| --- | --- |
| ICU vs `chrono-tz` drift | Rust emits instants only; goldens cover fold, gap, half-hour, quarter-hour, fixed offset, alias zones |
| `rrule` crate vs JS `rrule` enumeration | 24-month golden per zone before `expandCalendarSchedule` is used by any route |
| better-auth cookie/session format | Phase 2 read-only validation first; creation last; one release of dual deploy |
| Two migration runners | Never; the runner moves in one ADR-backed step |
| Licence creep | `cargo deny` in the local gate with an explicit allow-list; exceptions recorded in ADR 0003 |
| Silent fixture staleness | The local gate regenerates and diffs every fixture before push |
| Partial validation | Run both established Node checks and the local Rust gate against the exact release revision; no CI or runners |

## 8. What not to do

- Do not hand-write a second schema in Rust for anything `packages/schemas`
  defines. Generate it.
- Do not let a Rust module become the authority for auth, sessions or
  permissions before its parity table covers every action and role.
- Do not fork the database schema or add Rust-only tables before Phase 3.
- Do not format dates, numbers or strings for a locale in Rust.
- Do not merge a ported module without its milestone entry and validation
  numbers.
