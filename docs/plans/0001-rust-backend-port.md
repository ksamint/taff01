# 0001 · Port the backend to Rust

- **Status:** in force (owner, 2026-11-15: "yes for all"). Nothing below has
  started. Decisions: [ADR 0026](../adr/0026-backend-migration-to-rust.md),
  [ADR 0032](../adr/0032-rust-port-freeze-and-wire-parity.md).
- **Replaces** the per-module order of
  [the Rust migration guide](../rust-migration-guide.md) §4–5. Its target
  architecture, crate layout and carried-over rules (§1–3) still hold.
- **Not this plan:** the current release work is
  [v0.2.26](../agent-goal-v0.2.26-xiding-and-hygiene.md).

## What is being built, and for whom

The same Taff, with one backend language. People and agents who use Taff see
no change: every REST route, MCP tool, realtime event and database row stays
as it is. The operator gains one runtime to deploy and one place for database
code. Developers and coding agents stop maintaining two implementations.

Measured on `main` at `455c549` (source lines without tests):

| Part | Path | Lines | Today | Target |
| --- | --- | --- | --- | --- |
| Web client | `apps/web` | 33,700 | TypeScript | stays TypeScript |
| Wire contract | `packages/schemas` | 6,700 | TypeScript (Zod) | stays; emits the JSON Schema Rust reads |
| Scripts, tools, browser tests | `scripts`, `e2e` | 9,500 | TypeScript | stays TypeScript |
| Domain core | `packages/core` | 20,000 | TypeScript | Rust: `taff-domain`, `taff-db` |
| REST, MCP, WebSocket (159 routes, 38 tools) | `apps/api` | 3,800 | TypeScript | Rust: `taff-api` (axum) |
| Database schema, 44 migrations | `packages/db` | 2,000 | TypeScript (Drizzle) | Rust: sqlx on the same SQL files |
| Job worker | `apps/worker` | 300 | TypeScript | Rust: `taff-worker` |
| Image renderer | `backend/crates/taff-render` | 2,700 | Rust, in production | done |
| Permissions, recurrence, time zones, canonical JSON | `taff-domain`, `taff-core` | 2,000 | Rust, tested, not serving | the authority at cutover |
| Font subsetter | `scripts/ui/subset-fonts.py` | 1 file | Python | Rust (ADR 0030) |

The core held 15,200 lines on 2026-10-31 and 20,000 on 2026-11-15. The port
cannot finish while that number grows, which is why the first rule is a freeze.

## Out of scope

- Any change to the web client, the wire contract's shapes or the database
  schema beyond what a release already needs.
- A second database, a schema fork, or new capabilities for agents.
- Rewriting what already works in Rust (`taff-render`).
- Dates: no schedule is promised until Wave 0 has measured replay coverage
  and how many port PRs the local gate validates per day.

## Rules

1. **Freeze.** From v0.2.27, new backend behaviour is written in Rust.
   `packages/core`, `apps/api` and `apps/worker` take fixes only.
2. **Compare at the wire.** One replay harness records every REST and MCP
   request and response while the existing suites run against Node, replays
   them against the Rust port and diffs the JSON. Function-level goldens stay
   only where they exist: permissions, recurrence, canonical JSON, time zones.
3. **Generate shapes.** `pnpm schema:gen` covers every REST body and response;
   Rust types come from that JSON Schema; sqlx checks each query against the
   migrated database.
4. **Switch per route family at the proxy.** One Caddy matcher per path
   prefix. Switching back is the same line and touches no data. The matcher is
   Taff's own route file; any other proxy change is a stop for the owner.
5. **Gate.** A PR that changes only `backend/` code which no production
   route, image or job runs merges on `pnpm check --only rust` plus the
   replay. Every route switch and every release needs the full `pnpm check`.
   Until the replay exists, every PR needs the full check.

## Waves

One task per PR. A wave's tasks may run in parallel unless marked serial.

| Wave | Work | Acceptance |
| --- | --- | --- |
| 0 · rails (serial) | Schemas for every REST body; `taff-contract` types; `taff-api` skeleton on its own port with health, the error envelope and read-only validation of existing sessions; the write helper (one transaction, the `activity` row, `NOTIFY taff_changes`); the replay harness; a proxy switch rehearsed in the local stack | Replay of the recorded suites against Node itself diffs to zero; the harness reports the share of routes and tools it covers; no production traffic reaches Rust |
| 1 · reads | Every GET, by family: tasks, projects, members and Today; calendar; companies and contacts; timeline, relations and mind; inbox and notifications; summaries, audit and access matrix | Per family: zero replay diffs in en, zh-CN and zh-HK, then the proxy switch under the full check |
| 2 · writes | Mutations by family: tasks and agent runs; CRM; planning; summaries; timeline; mind and relations; calendar; notifications; view export calls the renderer in process | Per family: zero replay diffs, identical `activity` rows and `taff_changes` events, permission table tests green |
| 3 · agents | The 38 MCP tools with their families; the WebSocket hub; the per-token rate limit | `pnpm mcp:smoke` passes against Rust; realtime browser tests pass |
| 4 · identity (serial) | Sessions, username and phone sign-in, OAuth 2.1 server, token policy, SMS, e-mail, the worker | Access-change rule in `AGENTS.md`: every operation that issues, extends or re-enables access tested with the lowest role; rollback rehearsed |
| 5 · removal | Delete `packages/core`, `apps/api`, `apps/worker` and Drizzle; sqlx owns migrations; port the font subsetter | One clean release with no Node backend process; no Python file left |

## Stop and print `NEEDS-DECISION`

- A replay diff that cannot reach zero without changing shipped behaviour
  (recommend keeping the shipped behaviour, with an ADR).
- Anything that would change a neighbour's proxy route, DNS or shared ports.
- A crate whose licence is outside `backend/deny.toml`.
- Any step of Wave 4 that would sign people out or re-issue tokens.

## Owner decisions

- 2026-11-15, "yes for all": freeze new TypeScript backend features from
  v0.2.27; dark Rust PRs merge on the Rust gate plus replay, full gate at each
  switch; adopt the tda01 Start baseline version 1; port sign-in to Rust, last.
