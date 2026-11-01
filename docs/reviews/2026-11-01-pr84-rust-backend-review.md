# Review — PR #84 "begin the Rust backend migration (ADR 0026)"

Reviewed 2026-11-01 against base `707161c` (v0.2.16), head `3fdce6e`, 7 commits,
26 files, +7265/−2. Reproduced locally with rustc 1.97.0.

## Verdict

**Direction approved; request changes before merge.** The foundation is sound
(workspace, CI job, error envelope, permissions port) and the parity-gate idea
is the right discipline. But four of the six "parity-gated" slices are not
actually pinned to Node behaviour yet, and two documents in the PR contradict
each other. Items 1–5 below should land in this PR; 6–11 can follow in the
next milestone but must land before any Rust module becomes an authority.

## Reproduced locally

| Check | Result |
| --- | --- |
| `cargo test --workspace --locked` | 14 passed (9 unit, 5 integration) |
| `cargo clippy --workspace --all-targets -- -D warnings` | clean |
| `cargo fmt --all -- --check` | clean |
| `rust-backend` job on the PR (run 41360338801) | success, 1 m 45 s |
| `hash_token("token","pepper")` vs `sha256("tokenpepper")` | identical |
| `DEFAULT_PERMISSIONS`, `capability_scope`, `scope_for`, `OAUTH_SCOPE_CEILING`, `AGENT_STATUSES` vs `permissions.ts` | identical, branch for branch |
| `users` / `workspaces` columns in `schema.rs` vs `packages/db/src/schema.ts` | identical |
| `wall_to_instant` New York fold, New York gap (2026-03-08 02:30 → 07:30Z), Lord Howe gap, Kathmandu | match TypeScript semantics |
| Crate licences (`cargo metadata`, 276 crates) | no copyleft-only crate; see item 6 |

## Must fix before merge

1. **Recurrence golden fixture does not match its generator.**
   `scripts/rust-recurrence-golden.mts` writes a `rejections` array under the
   same object, but the committed `recurrence-golden.json` has only the five
   accepted cases, and `recurrence_parity.rs` deserialises into
   `HashMap<String, String>`, which panics on an array. Regenerating the
   fixture therefore breaks the test. The gate is not reproducible as shipped.
   Fix: emit `{ accepted: {...}, rejected: [...] }`, read both in Rust, assert
   every rejected rule is rejected, and add a CI step that regenerates the
   fixture and runs `git diff --exit-code` (see item 9).

2. **`normalize_rrule` diverges from `ruleFor` on inputs the golden never
   exercises** (probed in a scratch test):
   - `FREQ=DAILY;UNTIL=20200101T000000Z` with a 2026 start is **accepted**;
     TypeScript rejects `until < actualStart`. This is a validation hole.
   - `rrule:freq=daily` is **rejected**; TypeScript strips the prefix
     case-insensitively (`/^RRULE:/i`). `trim_start_matches` is also
     repeated, so `RRULE:RRULE:FREQ=DAILY` is accepted where TypeScript rejects.
   - Zone `+08:00` is **rejected** although the doc comment says fixed offsets
     work. `canonicalCalendarTimeZone` accepts `±HH[:MM]`, and schedules can
     carry them. Rust needs the same fixed-offset path (parse to
     `FixedOffset`, or wrap `Tz | FixedOffset` in one enum).
   The golden has five UTC accept cases; extend it with these and with
   non-UTC anchors (anchor weekday/month/day depend on the zone).

3. **`canonical_json` does not reproduce `JSON.stringify` number formatting.**
   Probe: `{"a":1.0,"b":1e21,"c":-0.0}` renders as `1.0`, `1e+21`, `-0.0`;
   Node renders `1`, `1e21`, `0`. `canonicalJson` feeds HMAC signatures in
   `trusted-review.ts` and `approved-agent-operation.ts`, so a Rust verifier
   would reject valid receipts. Fix: implement ECMAScript `Number::toString`
   (shortest round-trip digits, exponent form outside 1e-7..1e21, `-0` → `0`)
   or reject non-integer numbers until a verifier needs them; add a
   Node-generated golden with floats, nested arrays, unicode and escapes.

4. **MCP schema fixture pins a tool that does not exist on the base.**
   `mcp-tools.json` and `EXPECTED_TOOLS = 34` include `workspaces.list`, which
   is registered nowhere on `main` or on this branch (it belongs to the
   unmerged multi-workspace branch, milestone 82). The API registers 33 tools;
   `MCP_TOOLS` in `mcp-round-trip.ts` has 33. The fixture was generated against
   a different branch than the PR base. Fix: export one
   `Record<toolName, ZodSchema>` from `apps/api/src/mcp*.ts`, use it both for
   `registerTool` and for `mcp-schema-gen.mts`, and derive the count from it.
   Also prefer `@taff/schemas` imports over `../../../packages/schemas/src/…`.

5. **Documents contradict each other.** `docs/rust-backend-plan.md` says
   permissions (`can`), token hashing and MCP handlers are "never moved to
   Rust" and recommends a projection worker first; ADR 0026 and this PR port
   `can()` and `hash_token`. ADR 0026 also says it supersedes "the earlier
   recommendation in this file", but the file is new. `instruction_v0.md` now
   contains the "Versions were reviewed on 2026-10-08" sentence twice. Fix:
   delete `rust-backend-plan.md` or rewrite it as the executable plan for
   ADR 0026 (`docs/rust-migration-guide.md` in this branch is a candidate),
   and remove the duplicated line.

## Should fix (next milestone, before any Rust authority cutover)

6. **Licence statement is inaccurate.** The PR says "All crates are
   MIT/Apache-2.0". `cargo metadata` shows 276 crates including Unicode-3.0
   (the ICU4X family, 18 crates), Zlib (`foldhash`), CDLA-Permissive-2.0
   (ICU data), Unlicense OR MIT, ISC, BSD-3-Clause, MIT-0, and BSL-1.0 as an
   OR option (`ryu`, `whoami`). `r-efi` offers LGPL-2.1 only as an alternative
   to MIT/Apache. All are acceptable under ADR 0003's spirit, but the npm side
   has a gate with seven documented exceptions and Rust has none. Add
   `deny.toml` with an explicit allow-list, run `cargo deny check licenses` in
   the `rust-backend` job, and record the Unicode-3.0 / Zlib / CDLA exceptions
   in ADR 0003 or 0026.

7. **Permissions parity coverage is thin where it matters.** Fifty cases, but
   none covers the `ask` decision with a grant (allowed, expired, task- or
   run-scoped mismatch), `project:manage` for an agent with
   `approvedProjectOperation`, `token:connect` / `token:revoke`,
   `dependency:edit`, agent `task:assign` / `task:create` `toWorkerId` rules,
   `inbox:*` with `memberId`, `run:request_review`, `files:attach`,
   `suggestion:undo`, `mind:*`, `crm:archive` / `crm:audit`, or
   `canGrantOAuthScopes`. Those are the agent-side branches the project's
   "don't give agents any code path a person doesn't have" rule depends on.
   The Rust test also re-encodes the fifty cases by hand instead of reading
   actor/action/resource from the fixture, so the fixture pins booleans only
   and the two case lists can drift silently. Fix: emit full cases as JSON,
   derive `serde::Deserialize` on `Actor`, `Resource`, `Action` with the
   TypeScript string names, table-drive the Rust test, and inject the clock
   (`now_ms` is documented as overridable but is not).

8. **Timezone slice has no Node-generated golden.** Expected instants in
   `tz.rs` are hand-typed; there is no spring-forward gap case, no fixed
   offset, and no equivalent of `canonicalCalendarTimeZone` (ICU alias
   canonicalisation; `chrono-tz` parses `Asia/Calcutta` but the TypeScript
   returns the canonical `Asia/Kolkata` string). Generate the fixture from
   `calendarWallToInstant` / `calendarCivilTime` for fold, gap, half-hour,
   quarter-hour, fixed offset and alias zones.

9. **CI gaps in the `rust-backend` job.** No `cargo fmt --check`, no licence
   check, no fixture regeneration + diff, actions not SHA-pinned (the approval
   workflow pins its Postgres image by digest), no `rust-toolchain.toml` so
   `stable` floats while the declared MSRV 1.85 is never built, and `Db` /
   `schema.rs` are never executed because the job has no Postgres. Add a
   Postgres service, run `pnpm db:migrate`, and either an integration test or
   sqlx offline `query!` checking against `.sqlx/`.

10. **Crate layout.** `taff-core` depends on `axum`, `tokio`,
    `tracing-subscriber` and `anyhow` without using them; `axum` is an adapter
    concern. The project's layering rule (core touches the DB, adapters are
    thin) should be mirrored now while it is cheap: `taff-domain` (pure, no
    sqlx), `taff-db` (sqlx read/write models), `taff-api` (axum) later.

11. **Milestone record.** `docs/milestones/84-…` records the checkout resync,
    not the Rust work. AGENTS.md asks for working behaviour, missing work, open
    decisions and validation numbers per milestone; add a milestone 85 entry
    for the Rust foundation (14 tests, clippy, fmt, licence tally, deferred
    items).

12. Minor: `lib.rs` says `Db::connect` mirrors `connectDatabase(url, 20_000)`,
    but `connectDatabase` in `packages/db` takes only the URL (`max: 10`); the
    `Db::workspace` doc comment is garbled; `CoreError` has no
    `rate_limited` (429) variant for the MCP limiter the adapter will need.

## Good

- Error envelope (`code`, `status`) matches the Hono handlers exactly.
- `can()` is a faithful branch-for-branch port; reading it next to the
  TypeScript, no decision table differs.
- Fold/gap semantics in `wall_to_instant` match RFC 5545 and the TypeScript.
- Fixtures contain no secrets; `backend/target/` ignored; Biome excludes
  fixtures; Cargo.lock committed and `--locked` used in CI.
- The job runs on hosted runners, so it is green even while the TypeScript
  gates wait for `TAFF_FULL_CI_ENABLED`.
