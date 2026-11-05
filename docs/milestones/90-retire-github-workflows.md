# 90 — GitHub workflows removed (2026-11-05)

Owner: "no ci, no github runner forever, we run locally push deploy directly
since we are ts and rust", then "remove the github workflows".

- Removed `.github/workflows/ci.yml`, `approval-checks.yml` and
  `visual-baselines.yml` (the whole `.github` directory). They stay in history
  at `26d20d8`.
- Release verification is the local gate in `docs/release-closeout.md`
  check 1. Visual baselines are captured locally (`docs/ui/README.md`,
  "Local baseline capture").
- `scripts/ui/visual-clock.test.ts` checked that `ci.yml` never preloads the
  visual clock; it now checks the local gate's commands in `package.json`.
- Older plans, goals and milestones that mention the workflows are history and
  are left unchanged.
- Validation: the visual-clock test and `pnpm lint` pass.
