# 121 — export audit metadata (2026-11-13)

E2 of the [v0.2.24 plan](../agent-goal-v0.2.24-view-export-and-alignment.md).
Production remains v0.2.23; this task introduces no migration or dependency.

## Works

- Each successfully built authorized export snapshot records one `view.export`
  activity row, attributed to the person and the project or workspace, in its
  own transaction with `taff.actor_id`. It emits no realtime notification.
- Details contain only scope, locale, content hash, project count, finance
  visibility and the trusted adapter's channel. No image, name or source data
  is stored. Invalid input, unauthorized roles and refused projects add no row.
- Workspace audit search returns these rows; `/orgs/audit` labels them in all
  three locales and expands their existing details control. Rendering and
  delivery happen after snapshot construction; an audit row is not a delivery receipt.
- Updated VE-1.8 and AU-1.4/AU-2.4 in the living specs, README and changelog.
  Agent exports remain planned for E3.

## Validation

- Focused PostgreSQL export suite: 6 passed, including exact metadata, one row
  per snapshot, no rows on refusals, audit search and a committed notification
  marker proving export transactions emitted no change event.
- Font coverage: 3 passed. Audit browser flow: 3 passed (en, zh-CN, zh-HK),
  including the exporter, localized label/hash details and member audit refusal.
- Gate diagnosis isolated a 336-pixel native-select font race. C6 now requests
  the existing loaded-font capture mode; HK repeated 3/3 and all six unchanged
  Linux baselines passed. The rejected attempt is retained; no baseline changed.
- Full exact-head local gate and source/tree are recorded in the PR body
  after rebasing onto the preceding task's merged main.

## Next

A4 workspace archive/restore, E3 agent images, then the v0.2.24 closeout and
S1–S3 for v0.2.25. Owner checks remain pending per [owner checks](../owner-checks.md).
