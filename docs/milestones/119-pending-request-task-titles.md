# 119 — task titles in pending requests (2026-11-13)

A3 of the [v0.2.24 plan](../agent-goal-v0.2.24-view-export-and-alignment.md),
from `main` `0b89a50` after A1 PR #93. Production remains v0.2.23.

## Works

- Pending task-scoped capability requests show the workspace task reference
  and title, linked to the task. The normal authorized workspace task query
  supplies the title; no new endpoint or permission is introduced.
- A task absent from that read retains its raw id with a localized unavailable
  label and no link. Workspace-scoped requests retain their existing label.
- Updated AM-1.7 in [access matrix](../spec/access-matrix.md), all three locale
  dictionaries and the generated test-id contract. No dependency or migration.

## Validation

- Focused pending-request browser flow: 3 passed (en, zh-CN, zh-HK), including
  readable references/titles, unavailable-task fallback without a cached title
  or link, and allow/deny decisions. Phone screenshot inspected.
- Font coverage: 3 passed; the new CJK labels use existing bundled glyphs.
- `git diff --check` passed. Full exact-head local gate commands, source/tree
  and counts are recorded in the PR body before merge.

## Next

A2 project fields, E2 export audit, A4 archive/restore and E3 MCP images,
then the release closeout and S1–S3 for v0.2.25. Owner-only checks in
[owner checks](../owner-checks.md) remain pending. Nothing deployed here.
