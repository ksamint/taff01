# 0024 — Node 26 runtime

Date: 2026-10-27. Status: accepted. Follows ADR 0004 and `docs/upgrade-plan.md`.

## Context

Node 24 has been the runtime since 2026-10-08. Node 26 enters LTS on
2026-10-28; 26.12.1 (2026-10-21) is a security release on that line. The
upgrade plan scheduled the move for after the LTS date. The owner asked to
start it now: the 26.x builds are the same release line before and after
the LTS label.

## Decision

- `.node-version` is 26, so CI (`checks`, `browser`, visual baselines) runs
  on the newest 26.x. The production images build `FROM node:26-alpine`.
- `engines.node` stays `>=24 <27`, so a contributor or the M1 Pro live
  harness on Node 24 still installs; Node 26 is the tested runtime.
- `@types/node` follows the runtime major: 24.19.2 → 26.6.5.
- No source change. Node 26 refuses `--env-file` inside `NODE_OPTIONS`;
  the repository passes it only on the launching `node` command line, which
  is unaffected, and must keep doing so.

## Consequences

- The next release deploys Node 26 images; nothing is deployed by this change.
- ICU 78.3 / CLDR 48 date strings stay inside the bundled font subsets
  (`scripts/ui/fonts.test.ts`).
- Rollback: revert the commit and run `pnpm install`; images rebuild on Node 24.
