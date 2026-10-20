# 33 — Role-based MCP OAuth approval (2026-10-20 UTC)

## Working
- Admins approve any organization agent; members only agents they supervise.
- One core permission/scope helper checks consent, code exchange and refresh.
- Member ceiling excludes files:write; guests and agents never approve.
- Refresh revokes ineligible grants with one audited agent change before failure.
- Members list/revoke/undo only their own OAuth grants in Connected apps.
- Admin personal tokens, call log and full grant visibility remain available.
- Three-locale consent locks unavailable scopes; OAuth rows show approval details.
- ADR 0023 supersedes ADR 0022's approval rule; no migration or dependency.

## Missing
- PR CI confirmation follows publication; deployment is the next release step.

## Open decisions
- None for this goal. CIMD remains outside scope (ADR 0022).

## Validation
- Lint, typecheck 6/6, licence gate: 302 packages, 7 documented exceptions.
- Full Vitest: 103 files / 1735 tests; subsequent expanded REST matrix 665/665,
  OAuth integration 12/12 and CJK font checks 3/3 passed.
- Local production stack built, migrated and seeded; Today JS 192.3 KiB.
- All-31-tool MCP smoke: 67 checks, including official-client OAuth round trip.
- MCP OAuth browser specs: 9 unique cases passed across en/zh-CN/zh-HK.
- Initial combined browser run: 7/9; sign-in UI timeout and signup 429.
  Affected locales rerun separately: zh-CN 3/3, zh-HK 3/3; no check weakened.
- Release checklist item 8 (MCP plus OAuth): 4/4 viewport/locale cases.
- Admin seeded MCP screens retain layout/content; CI compares existing baselines.
