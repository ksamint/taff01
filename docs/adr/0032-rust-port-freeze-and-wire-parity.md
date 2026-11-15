# 0032 — Rust port: freeze, parity at the wire, and a gate for dark code

Date: 2026-11-15. Status: accepted (owner: "yes for all" to the four questions
of the 2026-11-15 review). Builds on ADR 0026 (backend migration to Rust) and
ADR 0030 (TypeScript and Rust only). Plan:
[`docs/plans/0001-rust-backend-port.md`](../plans/0001-rust-backend-port.md).

## Context

ADR 0026 chose Rust for the backend on 2026-11-01. Two weeks later the Rust
side holds its foundation (pure permission, recurrence, time-zone and
canonical-JSON logic, SQL read models, and the renderer, the one Rust service
in production). Over the same period `packages/core` grew from 15,200 to
20,000 source lines while eight releases (v0.2.17 to v0.2.25) shipped, most
of them with new backend behaviour in TypeScript. The migration guide ports one module at a time through six steps,
each with its own golden generator, so about thirty modules queue behind one
another.

## Decision

1. **Freeze.** From v0.2.27, new backend behaviour (routes, MCP tools, jobs,
   domain rules) is written in Rust under `backend/`. `packages/core`,
   `apps/api` and `apps/worker` take fixes only.
2. **Parity is proved at the wire.** One replay harness records REST and MCP
   traffic from the existing suites against Node and diffs the Rust port's
   answers. This is the parity test ADR 0026 constraint 5 requires. The
   function-level goldens that exist stay; new ones are written only for pure
   logic the wire cannot isolate.
3. **A lighter gate for dark Rust code.** A pull request that changes only
   `backend/` code which no production route, image or job runs may merge on
   `pnpm check --only rust` plus the replay. Every proxy switch and every
   release needs the full `pnpm check`. Until the replay harness exists the
   full check is required for every pull request. This is an owner exception
   to global agent policy rule 3 (full suite on every commit), limited to
   code that cannot run in production.
4. **Sign-in ports to Rust, last.** No Node sign-in service is kept.
5. **taff01 follows the tda01 Start baseline, version 1**, declared in
   `AGENTS.md`; `pnpm check` is its single check command.

## Consequences

- A feature that needs backend work after v0.2.26 waits for the Rust rails
  (plan Wave 0) or lands in Rust directly. The owner can lift the freeze for
  one named change.
- The replay harness becomes the most important test asset; its route and
  tool coverage is reported before any family is switched.
- Rollback at any wave is unchanged from ADR 0026: the Node code for a family
  stays until the wave that removes it, and a proxy switch reverts in one line.
- The migration guide's §4–5 (per-module checklist and phases) are replaced
  by the plan; its §1–3 stay.
