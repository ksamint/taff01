# 118 — desktop summary navigation (2026-11-13)

A1 of the [v0.2.24 plan](../agent-goal-v0.2.24-view-export-and-alignment.md),
from `main` `5ea056d`. Production remains v0.2.23.

## Works

- Desktop Me Settings links to Shareholder summaries with the same label
  and hint as phone Me. The ⌘K settings search links to `/summaries` too.
- Existing summary access rules are unchanged; a linked recipient reaches
  an actual generated summary through both entry points in all three locales.
- DS-5.2 in [daily summary](../spec/daily-summary.md) records both entry points;
  the generated test-id contract includes the new coverage. No new dependency.

## Validation

- Focused browser regression: 3 passed (en, zh-CN, zh-HK).
- Full typecheck, changed-file Biome and `git diff --check` passed.
- Earlier focused attempts exposed test setup/selector mistakes: account
  setup needs the phone viewport, and search hits are options. Fixed before
  the successful run; no assertion or product behavior was weakened.
- The exact clean PR head/tree and complete local release gate commands and
  results are recorded in the PR body before merge.

## Next

A3 task titles, A2 project fields, E2 audit, A4 archive/restore, E3 MCP images;
then v0.2.24 closeout and the S1–S3 exports for v0.2.25. Owner-only checks in
[owner checks](../owner-checks.md) stay pending. Nothing deployed by this task.
