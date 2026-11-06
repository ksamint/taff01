# 0026 — Backend migration to Rust

Date: 2026-11-01. Status: accepted (owner override). Follows ADR 0004 and the
"propose stack changes in an ADR, don't just swap" rule in `instruction_v0.md`.

## Context

The owner directed that the backend move from TypeScript to Rust ("rust is the
way"), superseding the earlier strangler-only recommendation (a Rust projection
worker beside a permanent TypeScript core). The executable, phase-by-phase
plan is `docs/rust-migration-guide.md`. This ADR records the new
decision and the constraints that keep the migration safe.

The backend today is three Node packages:

- `packages/core` — ~15.5k LOC, the only database-touching code, a `Core`
  facade over ~30 domain modules (permissions, agent tokens, OAuth, SMS, email,
  calendar/recurrence, CRM, planning, timeline, relations, mind, brief/AI,
  notifications, workspace lifecycle) on Drizzle + `postgres` + better-auth +
  ioredis/BullMQ + RRule.
- `apps/api` — ~3.1k LOC of Hono REST (~95 routes) and MCP (Streamable HTTP)
  adapters, WebSocket realtime, rate limiting.
- `apps/worker` — ~120 LOC BullMQ consumer.

`packages/db` holds the Drizzle schema and 40 SQL migrations; `packages/schemas`
(~4.3k LOC Zod) is the single definition of every API body, MCP tool argument
and shared client type, imported directly by the Next.js web client.

## Decision

The backend is migrated to Rust incrementally, module by module, behind the
existing PostgreSQL schema and wire contract. The hard constraints are:

1. **The database schema is the contract.** Rust components read/write the
   exact tables and migrations in `packages/db`; no schema fork. Migrations
   keep their numbering and remain applied by the same mechanism until the
   Rust cutover owns them.
2. **One schema source of truth.** Zod already emits JSON Schema (the MCP layer
   uses `zod/v4/core` `toJSONSchema`). That generated JSON Schema becomes the
   contract consumed by Rust (`serde` derives + a JSON Schema validator). The
   web client keeps importing the Zod variants; Rust validates against the
   generated schema so the two cannot silently drift. This is not a duplicate
   source — it is one source (Zod) with two target codegens.
3. **No new capability and no new database owner.** Until a module is cut over,
   `packages/core` remains the authority for auth, sessions, permission
   (`can`), OAuth, SMS, email and realtime. Rust modules replace behavior in
   place; they do not add code paths a person or agent lacks.
4. **Licenses.** `backend/deny.toml` is the enforced Cargo allow-list: MIT,
   Apache-2.0, BSD-2-Clause, BSD-3-Clause and ISC, plus MIT-0 (borrow-or-share), Unicode-3.0, Zlib,
   CC0-1.0 and OpenSSL for the existing dependency graph, and MPL-2.0 under
   ADR 0003. Alternative licences are accepted only when an allowed option
   applies. `ryu-js` is Apache-2.0 OR BSL-1.0; this project selects Apache-2.0.
   SQLx uses native certificate roots, so bundled CDLA-licensed CA data is not
   introduced. Font OFL licences are managed with the font assets, separately
   from Cargo. No GPL/AGPL/SSPL/LGPL-only or commercial dependency; each new
   dependency is named with its licence in the commit.
5. **Parity before cutover.** Each migrated module carries a parity test
   asserting identical output to the existing `Core` across the three locales
   and representative time zones. Dates leave Rust as UTC instants + raw wall
   data; the web client formats, preserving the "never format server-side in a
   fixed zone" rule and avoiding ICU-vs-`chrono` drift.

## Phases

1. **Foundation (this change).** A `backend/` Cargo workspace; a crate
   `taff-domain` for pure logic and `taff-db` for SQLx read models;
   `taff-core` remains a compatibility facade. A JSON-Schema consumer and
   `pnpm rust:fixtures` bridge the TypeScript source. `pnpm rust:gate` runs
   locally with Rust 1.97.1, including migrated test-database parity, licence
   checks and regeneration diff. No CI or runners.
2. **Pure logic.** Calendar recurrence (`calendar-recurrence.ts` → `rrule` +
   `chrono-tz`), permissions matrix, canonical JSON, token hashing — each with
   a parity test importing the Node golden output.
3. **Mutation core.** Task/project/CRM/planning writes in Rust, still emitting
   `taff_changes` NOTIFY and writing `activity` rows with the actor.
4. **Adapter layer.** Replace `apps/api` Hono with `axum`, keep the REST and
   MCP (Streamable HTTP) shapes byte-compatible; keep the WebSocket hub.
5. **Auth/workers.** better-auth parity (sessions, username, SMS, OAuth 2.1)
   and the BullMQ worker replacement, last, as the highest-risk surface.

## Consequences

- `packages/core`, `apps/api` and `apps/worker` stay authoritative and running
  in production until each phase completes and its local parity gate passes.
- The Next.js web client and `packages/schemas` are unchanged except for the
  generated JSON-Schema artifacts it may also consume.
- `instruction_v0.md` stack section is updated to describe the Rust target and
  the migration-in-progress state.
- Rollback at any phase: the Node package for that module remains until cutover.

## Foundation status (2026-11-06)

The phase 0/1 work in the access-and-completion goal introduces no backend
runtime cutover. Node remains the session, signature, permission and database
mutation authority. The stateless summary renderer is separately authorized
by ADR 0029.

The local gate consumes generated actor/action/resource cases and a fixed
clock, JSON-Schema for the current MCP registry, recurrence rejection cases,
timezone conversions, IEEE-754 canonical-number cases and disposable Node
SQL fixtures. `taff-domain` has no SQLx, Axum or Tokio dependency; SQL stays
in `taff-db`. Remaining recurrence expansion, series shifting, complete ICU
zone-name canonicalization and signed-wire parser parity remain prerequisites
for their respective later cutovers. In particular, serde_json's Unicode
string domain must be reconciled with JavaScript lone-surrogate input before
Rust accepts signed JSON; numeric parity alone does not authorize a verifier.

Source for the numeric formatter and licence: [ryu-js](https://github.com/boa-dev/ryu-js).
