# 0026 — Backend migration to Rust

Date: 2026-11-01. Status: proposed. Follows ADR 0004 (stack version review)
and the "propose stack changes in an ADR, don't just swap" rule in
`instruction_v0.md`.

## Context

The owner asked to plan moving the backend from TypeScript to Rust. The
current backend is three Node packages inside a pnpm/Turborepo monorepo:

- `packages/core` — ~15.5k LOC. The only code that touches the database.
  `createCore(options)` returns a `Core` facade over ~30 domain modules
  (permissions, agent tokens, OAuth, SMS, email, calendar/recurrence, CRM,
  planning, timeline, relations, mind, brief/AI suggestions, notifications,
  workspace lifecycle). Uses Drizzle ORM + `postgres` driver, better-auth,
  ioredis/BullMQ, RRule, Zod.
- `apps/api` — ~3.1k LOC. Hono 4 REST (~95 routes) and MCP (Streamable HTTP)
  adapters, WebSocket realtime fan-out, rate limiting.
- `apps/worker` — ~120 LOC. BullMQ job consumer.
- `packages/db` — Drizzle schema + 40 SQL migrations.
- `packages/schemas` — ~4.3k LOC of Zod. The single source of every API
  body, MCP tool argument, and shared client type, imported directly by the
  Next.js web client.

This is not a green-field service; it is a mature system with 1,872 tests, a
realtime Postgres `NOTIFY taff_changes` pipeline, a workspace/agent permission
model, OAuth 2.1, SMS and email delivery, and a live production deployment.

## Decision

We do **not** rewrite the backend in Rust. We record why, and define the
only form in which a Rust component is acceptable if the owner still wants it.

### Why a full rewrite is rejected as the default

1. **Shared-schema contract breaks.** `packages/schemas` (Zod) is imported by
   the web client to validate/type every mutation and read on the browser
   side (optimistic cache, forms). A Rust backend must either:
   - duplicate these schemas in Rust and keep them in lock-step by hand (two
     sources of truth, guaranteed drift), or
   - generate one from the other (JSON Schema → `serde` derives), which works
     for plain validation but cannot express the refinement logic and
     cross-field rules already embedded in the schemas (calendar civil-time,
     planning finance deltas, suggestion undo versions).
2. **better-auth / OAuth / MCP parity.** The backend depends on better-auth
   (session, username, SMS plugins), the MCP SDK v2 Streamable-HTTP server,
   and a custom OAuth 2.1 authorization server. None has a drop-in, licensed
   Rust equivalent. Reimplementing them is a large, security-sensitive
   surface with no existing tests to port.
3. **Realtime.** Postgres `NOTIFY` + WebSocket fan-out and TanStack-Query
   cache reconciliation are tuned to the current architecture. A Rust
   rewrite must reproduce that latency budget or regress the live app.
4. **Risk vs. value.** ~24k LOC of bug-fixed, tested domain logic would be
   rebuilt. The performance and reliability goals the owner wants can be met
   more cheaply (see below) without accepting that risk. No measured
   PostgreSQL-pool bottleneck, worker stall, or runtime fault in `docs/audit`
   is attributable to the TypeScript runtime itself.

### What is acceptable

A Rust component is acceptable only as a **strangler**, introduced beside the
TypeScript backend, behind the existing API contract, and only for a missing,
isolated capability the Node backend cannot host. Candidate seams, in order
of low risk:

1. **A job/reconciliation worker** for CPU-bound batch work (e.g. graph
   projection, digest/materialized-view rebuilds) that reads PostgreSQL
   directly and writes back through the same schema. It does not own auth,
   sessions, or the shared Zod contract.
2. **A query-only read cache / projection materializer** for hot analytics
   read paths, consumed by `apps/api` over the same REST shapes.
3. **Edge compute helpers** (image/PDF/font) called over HTTP, already
   deployable as a separate image.

Any such component must reuse the SQL schema as the contract, expose no
capability the Node backend does not, and carry a table-driven parity test
against the existing `Core` output.

## Consequences

- No backend swap. The TypeScript/Drizzle/better-auth stack remains the
  database owner and the single source of schema truth.
- If a Rust strangler is pursued, it is scoped and scheduled like a new
  milestone (an ADR for its license — e.g. `sqlx`/`tokio` are MIT/Apache-2.0 —
  and a parity test before merge).
- The performance/robustness motivations are instead addressed on the
  existing stack (connection-pool sizing, statement timeouts already added in
  milestone 83, worker backpressure, read-path projections).
