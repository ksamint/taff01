# 28 — Project stage, person in charge, shared finance (2026-10-18)

## Working

- Stages lead → proposal sent → contract signed → in service → closed, and a
  person in charge, set in the project dialog (create or Manage project) and
  shown under the project title in en, zh-CN and zh-HK. Both may be unset.
- Fee collection (contract, collected, %) and delivery % are readable by
  every person in the organization; guests and agents see delivery % only.
  Editing amounts and recording payments stays admin-only.
- MCP `projects.list` returns `stage` and `leadId`; finance stays null for agents.
- Migration 0031 is additive; ADR 0021 records the rules.

## Missing

- The Brief rows do not show stage or person in charge yet, and projects
  cannot be filtered by stage.
- Visual baselines were not re-captured: seeded projects have no stage, so
  the screens should be unchanged. CI confirms with its pinned Chromium.

## Open decisions

- May the person in charge change the stage? May agents read finance with a grant?

## Validation

lint ✓ · typecheck 6/6 ✓ · Vitest 102 files / 1691 tests ✓ · build ✓ · Today 191.9 KiB ✓ ·
Playwright (local Chromium 1194) new + related specs 69/69 in 3 locales ✓ · mcp:smoke ✓
