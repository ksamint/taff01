# Rust backend — strangler implementation plan

Proposed as the executable path behind ADR 0026. This assumes the owner wants
a Rust component; if a full rewrite is instead preferred, the ADR's rejection
section records why it is not the default and this plan does not apply.

## Principle

PostgreSQL stays the database owner and the contract. `packages/schemas`
(Zod) stays the single source of every wire shape. A Rust component is a
**projection/worker**, never the auth, session, or permission authority. It
must not expose any capability a person or agent cannot already reach.

## Phase 0 — Scope gate (do this first, smallest)

Pick exactly one candidate from ADR 0026 §"What is acceptable". Recommended
first: the **graph/digest projection worker** (the Neo4j "relationships" idea
from milestone 11, which has been open since M9). It is CPU/IO bound,
read-mostly, has no auth surface, and has a natural parity check.

Deliverable: a `packages/core` TypeScript test that captures the current
projection output as a golden fixture. This fixes the contract before any Rust
exists.

## Phase 1 — Schema read path (Rust, read-only)

- Crate `taff-projector` (MIT), deps documented in each commit:
  `tokio`, `sqlx` (postgres, runtime-tls), `serde`, `serde_json`, `tracing`.
  All MIT/Apache-2.0 — confirm none is GPL/AGPL/SSPL/commercial.
- Connect read-only to PostgreSQL using the same credentials the worker uses;
  honor the 20 s statement timeout and never emit `NOTIFY` or write.
- Read projects/tasks/members/relations and emit the existing projection JSON
  shape, byte-for-byte comparable to the golden fixture.

## Phase 2 — Parity gate

- A Vitest that runs the Node projection and the Rust binary, asserts identical
  output across the seed dataset in all three locales and time zones (dates via
  `chrono`/`time` with IANA tz, matching `Intl` output is the risk area — see
  Risks).
- A `scripts/` runner invokes the Rust binary; CI builds it in a job and runs
  the parity test.

## Phase 3 — Wire it as a worker/blob, not a daemon

- Deploy as a `FROM rust:1.x-alpine` image in `compose.prod.yaml`, replacing
  the specific Node job only after parity is green on `main` CI.
- Keep the Node `apps/worker` for all BullMQ jobs it already owns. The Rust
  component is additive and idempotent (safe to re-run), matching the seed's
  idempotence discipline.

## Out of scope (never moved to Rust)

- `createCore`, permissions (`can`), OAuth, sessions, agent tokens, SMS, email,
  MCP tool handlers, the shared Zod schemas, and the realtime hub. These stay
  the sole authority; the Rust worker calls back into them or reads the schema
  directly.

## Risks

- **Date/number formatting drift.** `Intl` (ICU) vs. Rust `chrono`/`time`
  disagree on some tz/era/calendar edge cases. Mitigation: emit *UTC instants
  and raw data only*; never format for a locale in the Rust worker — let the
  web client format. This also preserves the "never format on the server with a
  fixed zone" rule.
- **Schema drift.** Migrations (40 and counting) must be applied to the Rust
  reader. Mitigation: `sqlx` macros checked against a live DB in CI; the parity
  test fails loudly on drift.
- **License.** Confirm each crate's license in the commit message (standing
  rule). `sqlx` (MIT/Apache-2.0), `tokio` (MIT), `serde` (MIT/Apache-2.0),
  `chrono` (MIT/Apache-2.0), `tracing` (MIT) are all acceptable; verify any
  transitive copyleft before merging.
