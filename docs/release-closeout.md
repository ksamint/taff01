# Release closeout checklist

The single source for what a deploy must prove before tagging and releasing
the native lock. Goals and prompts reference this file instead of restating it
(AGENTS.md). Each check names where its evidence comes from; a check whose
source was not recorded cannot be required after the fact. Record a missing
source as a process gap in the milestone and fix the capture step below.

## Captured during the deploy (before and right after replacement)

| Evidence | When | Source |
| --- | --- | --- |
| Pre-deploy snapshot of every container: id, image, created, startedAt, health | Under the lock, before backups | Docker inspect, sanitized for `scripts/deploy/neighbor_preservation.py` |
| Exclusive database dump and env backup, mode 0600 | Before migration | Deployment log |
| Migrator exit code and migration journal | Migration | Deployment log |
| Replaced api/web/worker/render: container id, image id, startedAt, restartCount | Right after replacement | Docker inspect, recorded beside the image ids |
| Local checklist, live acceptance, MCP smoke counts | Before and after replacement | Playwright and smoke output |
| Worker scheduler readiness: the `Worker ready` line, logged only after every job scheduler (`daily-digest-scan`, `daily-summary-scan`) is registered | Right after replacement | Worker container log since its startedAt |

## Closeout checks (still under the lock)

1. The local gate passed on the exact deployed SHA, run by the operator on
   a clean checkout. GitHub CI and runners are retired (owner, 2026-11-05: "no
   ci, no github runner forever, we run locally push deploy directly since we
   are ts and rust"). The gate is `pnpm lint`, `pnpm typecheck`,
   `pnpm licence:check`, `pnpm test`, `pnpm build`, `pnpm build:server`,
   `pnpm perf:budget`, `pnpm e2e` (en, zh-CN, zh-HK), and
   `SSR_PRODUCTION=1 pnpm e2e e2e/ssr-session.spec.ts --grep "production SSR HTML is private"` against
   the local production stack (Next's development server always sends only
   `no-store`), `release:stack` then
   `release:checklist`, `pnpm mcp:smoke` against that stack, and the four
   image builds (`deploy/Dockerfile.server` with `TARGET=api` and
   `TARGET=worker`, `deploy/Dockerfile.web`, `deploy/Dockerfile.render`). Once `backend/` exists, add
   `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` and
   `cargo test --locked`, `cargo deny check licenses` and regeneration of all
   Node fixtures with a clean diff (`pnpm rust:gate`). Source: the command output, with pass and fail
   counts, recorded in the release milestone. A check that cannot run is
   listed there as not run, never as passed.
   For v0.2.20, also complete the supplemental checks required by
   [tooling TT-3](spec/tooling.md#operator-scripts-tt-3) and the
   [Access and Completion plan, C6 and D](agent-goal-access-and-completion.md):
   `node scripts/valkey-rehearsal.mts` must pass its seven isolated checks;
   `pnpm mcp:smoke` must pass refresh rotation and family-reuse revocation;
   and the local Linux Playwright comparison must pass all six C6 cases using
   `pnpm e2e --config playwright.delivery-visual.config.ts --update-snapshots=none`
   with its configured `PW_TEST_CONNECT_WS_ENDPOINT`. Record their output and
   counts beside this release's generic gate evidence.
2. Replaced services: image ids equal the recorded ones, running, healthy;
   container ids and startedAt equal the post-replacement record (no restart
   since acceptance).
3. Preserved services: `neighbor_preservation.py` against the pre-deploy
   snapshot reports no unexplained drift (Caddy, Valkey, PostgreSQL start time,
   neighbors).
4. Public checks named by the release (health, and for MCP OAuth the
   authorization-server metadata and the `/mcp` 401 `resource_metadata`).
5. Annotated tag `vX.Y.Z` on the deployed SHA, verified on origin.
6. Docs-only commit pushed to `main`: `docs/deploy.md` checkpoint and
   `docs/milestones/NN-vX.Y.Z.md` (≤ 40 lines), after `pnpm lint` passes on
   it. Owner decisions and pending checks are quoted there and in the receipt.
7. Receipt written; `deployment.done` holds the accepted SHA only (pending
   items live in the receipt and milestone, never in `deployment.done`).
8. Keeper logs `LOCK_RELEASED` and removes its owner file; an independent
   nonblocking flock probe acquires the lock and sees the accepted images
   running and the API healthy.

Checks that need a person (for example a Claude.ai sign-in) are listed as
pending with exact steps when the owner accepts that; they never hold the lock
and run later without it.
