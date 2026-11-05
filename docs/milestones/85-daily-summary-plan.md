# 85 — Daily summary module: review and plan (2026-11-05)

Docs-only milestone from `main` `707161c` (v0.2.16); no code, schema or runtime change.

## What was done

- Reviewed the three open PRs (#84 Rust foundation, #82 stability audit,
  #81 multi-workspace tokens) and the unfinished items from
  `docs/frontend-v2-plan.md` §10, milestones 36–82 and the deploy
  checkpoints: `docs/reviews/2026-11-05-pr-and-plan-review.md`.
- Answered "do we have a daily summary module?": no. The per-member daily
  digest (M7) and the rules-based brief (M17) exist; neither is tagged for
  an audience, shareable or watermarked.
- Designed the module: `docs/adr/0027-shareholder-daily-summary.md`
  (audience tag = shareholder + organization, project tagging, immutable
  per-recipient daily summary built by a pure function on the plan model,
  recipient-bound watermark and content hash, in-app and signed share-link
  delivery with revocation, permission table, access-matrix rule).
- Wrote the executable goal with milestones S1–S5:
  `docs/agent-goal-daily-summary.md`.
- Updated `docs/upgrade-plan.md`: PostgreSQL 19 GA moved to 2026-11-19,
  TypeScript 7.1 timing, and a feature-rollout table sequencing the summary
  module against PRs #81, #82 and #84.

## Missing

- All implementation (S1–S4) and the phase-2 items (PDF, e-mail, MCP read
  tools, weekly roll-up).
- Verification of PR #84 review items 2, 3, 5 and 6–12 on its current head.
- The `Cache-Control: private` SSR fix noted in PR #84's resync milestone.

## Open decisions (defaults proposed in ADR 0027)

Audience type default; finance off per recipient; names on per recipient;
agents denied in v1; e-mail and PDF in phase 2; retention by tag archive;
migration number after PRs #81/#82 merge.

## Validation

Docs only: `git diff --check` clean; relative links resolve. No test, build or e2e run was needed or claimed.
