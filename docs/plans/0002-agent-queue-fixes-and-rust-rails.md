# 0002 · Agent queue: land the baseline, fix the GUI findings, build the Rust rails

- **Status:** ready for the local dev agent (owner, 2026-11-15: "let agent
  continue dev and fix"). Nothing below has started.
- **Who executes:** the local dev agent on the operator machine. The planner
  (Claude) updates this file on a branch; the agent adopts it in its own PRs.
- **Reads first:** `AGENTS.md`, then [plan 0001](0001-rust-backend-port.md)
  and [ADR 0032](../adr/0032-rust-port-freeze-and-wire-parity.md).
- **Runs beside**, not instead of,
  [v0.2.26](../agent-goal-v0.2.26-xiding-and-hygiene.md): its X1–X3 and H1–H4
  keep their order and limits. Do L1 first, then alternate freely; a task
  here never waits for a production step there.

## How to work this queue

One task per branch and PR from the latest `main`. Gate **F** = the full
`pnpm check` reports `passed` on the PR head rebased on `main`; paste
`release-reports/check-report.md` into the PR. Merge your own PR on F.
TypeScript or Rust only; no CI, no runners; milestone ≤ 40 lines per task
group; spec changed in the same commit as behaviour. After each task print
`STATUS: 0002 <id> | PR <url> | <accepted|stopped> | <key numbers> | next: <id>`.
For an owner item print `NEEDS-DECISION: <question> — recommend <option>` and
continue with independent work.

Never to pass a gate: retries, wider tolerances, longer timeouts, skipped or
quarantined tests, edited baselines without a visible reason in the PR.

## L · Land the baseline

| ID | Task | Acceptance | Gate |
| --- | --- | --- | --- |
| L1 | [PR 108](https://github.com/ksamint/taff01/pull/108) passed 14 of 18 steps in a cloud container; the four image builds could not run there. On the operator machine, check out its head, run `pnpm check`, and merge it if the result is `passed`. If a step fails for a reason in the PR's own files, fix it on that branch; if it fails for another reason, stop and report. | `pnpm check` `passed` on Node 26 with all 18 steps; the report table replaces the one in the PR body; `main` holds `AGENTS.md` with `Baseline: tda01 start@1` | F |

## G · GUI findings of the 2026-11-15 review

Seen on a development run of `455c549`, phone 390 × 844, zh-HK. Reproduce
each on a production build first; a finding that does not reproduce is
closed with the evidence, not fixed. Web client only, so the backend freeze
does not apply. Release as v0.2.26 with H1–H4 if any ships.

| ID | Task | Deps | Tests | Acceptance | Gate |
| --- | --- | --- | --- | --- | --- |
| G1 | Review workspace on a phone (`/tasks/:id/review`, `review-view.tsx`): the 交付物 heading and the deliverable card touch the screen edge while the title above keeps the page gutter. Give the layout the same gutter as the title. | L1 | A phone case in three locales asserting the card's left and right edges sit inside the page gutter | No horizontal scroll; desktop unchanged | F |
| G2 | Shareholder summaries list on a phone (`/summaries`, `summaries-view.tsx`): the back link is an unstyled arrow and text in the corner, and the empty card runs edge to edge. Use the bordered back header the other Me pages use and the page gutter. | L1 | Phone case, three locales, empty and one-summary states | Back header matches `/orgs`; empty card inside the gutter | F |
| G3 | `summary.emptyHint` uses a half-width comma in zh-HK and zh-CN (`收件人後,摘要`). Use `，`. Six strings in each locale have a half-width comma or full stop between CJK characters on `455c549`; fix each real one. | — | A locale test that fails on `[一-鿿],[一-鿿]` in zh-CN and zh-HK | Zero matches; font subsets still cover every glyph (`fonts.test.ts`) | F |
| G4 | Visual references for the two newest screens: Sectors (with six tagged tasks seeded in the test) and the Export image dialog, phone and desktop, en and zh-HK, light. | G1, G2 | The pinned Linux visual run, new references committed with their capture manifest | References reviewed by eye and attached to the milestone | F |
| G5 | Desktop `/me` and `/inbox` rendered the identical page. Report whether that is the designed Me hub opening on its Inbox tab. No code change without an answer. | — | — | One line in the milestone; `NEEDS-DECISION` only if it is not by design | — |

## R0 · Rust rails (plan 0001, Wave 0)

Serial, in this order. None of it serves production traffic, so nothing here
changes a route, an image that is deployed, or the database schema. Until
R0.5 merges, every PR needs gate F.

| ID | Task | Deps | Tests | Acceptance | Gate |
| --- | --- | --- | --- | --- | --- |
| R0.1 | `pnpm schema:gen` emits JSON Schema for every REST request body and response and every MCP tool argument into `packages/schemas/generated/`, from the same Zod objects the Node routes parse. `pnpm rust:gate` already fails on drift in that directory. | L1 | A test listing every registered route and tool and failing when one has no generated schema | Coverage 159 of 159 routes and 38 of 38 tools, or the exact list of routes that take no body | F |
| R0.2 | `taff-contract` crate: serde types generated from R0.1 at build time (`typify`, MIT or Apache-2.0); no hand-written shape. | R0.1 | Round-trip of every generated fixture through the Rust types, byte-equal after canonical ordering | Crate builds with `-D warnings`; `cargo deny` clean; licence named in the commit | F |
| R0.3 | `taff-api` crate (axum) on `API_RS_PORT`, default 3002, loopback only: `/api/health`, the shared error envelope, and read-only validation of an existing session cookie against the `sessions` table. It creates, renews and deletes nothing. | R0.2 | Integration tests against the migrated test database: valid, expired, tampered and absent cookie; the envelope equals Node's for 400, 401, 403, 404 and 409 | Not in `compose.prod.yaml`, not in any Dockerfile that is deployed | F |
| R0.4 | Write helper in `taff-db`: one transaction, the `activity` row with the actor, `NOTIFY taff_changes`. Used by no route yet. | R0.3 | The Node-written and Rust-written `activity` row and notification payload for one synthetic mutation are equal, in a disposable schema | Permission check goes through the existing `can` in `taff-domain` | F |
| R0.5 | Replay harness (TypeScript, `scripts/replay/`): record every REST and MCP exchange while `pnpm test`, `pnpm mcp:smoke` and `pnpm e2e` run against Node; replay against a base URL; diff JSON with sorted keys, instants compared as instants, and a written list of fields that are allowed to differ (ids, timestamps, tokens). Recordings stay out of git and hold no secret: redact as `scripts/release-report.ts` does. | R0.3 | Replay against Node itself diffs to zero; a planted one-field change is reported for exactly that route | The harness prints the share of routes and tools it covers; `pnpm check --only rust` plus replay becomes the gate for dark Rust PRs (`AGENTS.md`) | F |
| R0.6 | Proxy switch rehearsal in the local stack only: one Caddy matcher sends `/api/health` to `taff-api`, and removing it sends it back. Document the two lines in `docs/runbooks/deploy.md`. | R0.3 | Local compose run: switch, check, switch back, check | No production proxy file is touched; that stays a stop for the owner until Wave 1 | F |

After R0.6 print `NEEDS-DECISION: start Wave 1 (reads) with tasks/projects/members/Today — recommend yes` and wait.

## Stop and report

Everything in `AGENTS.md`, "Stop and report", and in addition for this queue:
a production proxy or DNS change; a crate outside `backend/deny.toml`; any
step that would write to production other than v0.2.26's X1–X2; a `pnpm check`
that cannot reach `passed` without one of the forbidden moves above.

## Amendments

- 2026-11-15: queue written by the planner after the repository review
  (`main` at `455c549`). Owner decisions of that day are in plan 0001.
