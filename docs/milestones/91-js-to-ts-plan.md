# 91 — Review, v0.2.17 deployment status and the JavaScript-to-TypeScript plan (2026-11-05)

Docs-only milestone from `main` `ed84cab`; no code, schema or runtime change.

## What was done

- Reviewed the state after milestones 85–90: the shareholder daily summary
  module (ADR 0027, S1–S4) is merged to `main` as the v0.2.17 candidate, but
  not deployed. No `v0.2.17` tag exists; `docs/deploy.md` has only the
  candidate checkpoint; production still answers like v0.2.16
  (`POST /api/shared-summary` → 401, `/s/<token>` → 200 app shell).
- Answered "is the PRD updated for the daily summary?": the repository has no
  PRD document and Google Drive returned none for Taff. `instruction_v0.md` is
  the standing-rules file and by design is not amended. The product
  requirements for the module live in ADR 0027 (context, decisions, permission
  table), `docs/agent-goal-daily-summary.md`, README "Status" and the v0.2.17
  CHANGELOG entry.
- Inventoried JavaScript: 13 code files, 2,802 lines, beside 456 TypeScript
  files; `docs/ui/prototype*/` assets are out of scope. Open PRs #81, #82 and
  #84 touch none of them (#84 adds one `package.json` script line nearby).
- Wrote the executable plan `docs/agent-goal-js-to-ts.md` (T0 baseline
  typecheck of `scripts/` and `e2e/`, T1 eleven renames, T2 service worker
  built from TypeScript, T3 release v0.2.18) and the upgrade-plan row.

## Missing

- v0.2.17 production deployment, tag and closeout (deploy operator).
- All of T0–T3; the pre-existing error count from T0 is unknown until run.

## Open decisions (defaults in the goal)

Keep `postcss.config.mjs` (Next 16.4.2 reads no `.ts` PostCSS config); native
type stripping for direct `node *.mts` entries; v0.2.18 after the v0.2.17
closeout rather than folded into it. Whether a PRD file should exist at all is
the owner's call; the ADR already holds the requirements.

## Validation

Docs only: `git diff --check` clean; relative links resolve; Next 16.4.2's
`find-config.js` read from the published package. No test, build or e2e run was needed or claimed.
