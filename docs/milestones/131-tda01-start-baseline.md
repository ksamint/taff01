# 131 — tda01 Start baseline and the single check command

Status: tooling and documentation only; no app, schema, environment, dependency or MCP change (38 tools). Production stays v0.2.25 `e5a42c5`.
Base: `main` at `455c549`. Branch `claude/vigilant-gates-hsx1wm`. Owner, 2026-11-15: "yes for all, go ahead with baseline pr". Number 130 stays reserved for XIDING (v0.2.26 plan).
Target: TypeScript (`scripts/check.mts`, `scripts/check-plan.ts` and its test). The plan it records is Rust for the backend.

## Works

- `pnpm check` runs the whole local gate of [release closeout](../release-closeout.md) check 1 in one command: 18 steps, stops at the first failure, starts and stops its own production-mode stack for the SSR, checklist and MCP steps. Spec: [tooling TT-7](../spec/tooling.md#the-single-check-command-tt-7).
- It prints `tree=` first, refuses uncommitted changes and any non-local database URL (names the variable, never the value), and writes `release-reports/check-report.md` for the pull request. `--only`, `--skip` and `--allow-dirty` give `partial`, never `passed`.
- `AGENTS.md` (100 lines) declares `Baseline: tda01 start@1` and ``Check: `pnpm check` ``, a "Stop and report" list, and the owner decisions below.
- New: `.github/PULL_REQUEST_TEMPLATE.md` (no workflow), [plan 0001](../plans/0001-rust-backend-port.md), [ADR 0032](../adr/0032-rust-port-freeze-and-wire-parity.md), [deploy runbook](../runbooks/deploy.md), `deploy/reports/` with the v0.2.25 report transcribed from [milestone 128](128-v0.2.25.md). Closeout check 6 now names the deploy report.
- tda01 audit (`node tools/baseline/src/audit.ts ../taff01 --deploys`, tda01 `d8f843f`): before kernel 4/9, house 2/2, deploy 0/2; after 9/9, 2/2, 2/2, exit 0.
- Test fix found by the first full run: the workspace restore test compared two unordered member reads. It failed in the full suite on a fresh PostgreSQL 18.7 database and passed three times alone. Both reads now order by id.

## Owner decisions recorded (2026-11-15)

- New backend behaviour is Rust from v0.2.27; `packages/core`, `apps/api`, `apps/worker` take fixes only.
- Rust code that nothing in production runs may merge on `pnpm check --only rust` plus the wire replay; until the replay exists, and for every route switch and release, the full check.
- Adopt the tda01 Start baseline version 1. Port sign-in to Rust, last.

## Validation

- A tree cannot hold its own result: the `pnpm check` table for the pull request head is in the pull request body, bound to its tree.
- First run, on tree `c86dd65a248d` (before the test fix), Node 24.22.1, PostgreSQL 18.7, Valkey 9, Rust 1.97.1, cargo-deny 0.20.2: lint, typecheck, licences passed; Rust gate passed (46 tests, SQL parity, fixtures without drift, fmt, clippy, deny); `pnpm test` 2,383 passed, 1 failed (the unordered comparison above), 1 skipped, in 149 files. The run stopped there, as designed.
- `scripts/check-plan.test.ts`: 9 tests, including that every command the closeout names is a step and that `AGENTS.md` keeps the two baseline lines.

## Missing

- `pnpm check` has not yet run on the operator machine (macOS, Node 26). The stack steps and the image steps were first exercised in a cloud container; see the pull request body for what ran there.
- There is still no single deploy command; the runbook says so. tda01's baseline is marked proposed in tda01 itself.
- The replay harness, and everything else in plan 0001, has not started.

## Open decisions

- None new. Pending from before: the four owner checks and H4 (v0.2.26 plan).
