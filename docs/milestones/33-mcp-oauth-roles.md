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
- None for the feature. v0.2.12 deployment follows separately.

## Open decisions
- None for this goal. CIMD remains outside scope (ADR 0022).

## Validation
- Lint, typecheck 6/6, licence gate: 302 packages, 7 documented exceptions.
- CI: 103 files / 1742 tests; expanded REST matrix 665/665, OAuth 12/12.
- PR #66 merged; exact-head CI 39423229358 passed 8/8.
- Today CI 192.4 KiB; LCP en/CN/HK 636/664/672 ms; Lighthouse 99/100/100.
- Local production stack built, migrated and seeded; Today JS 192.3 KiB.
- All-31-tool MCP smoke: 67 checks, including official-client OAuth round trip.
- MCP OAuth browser specs: 9 unique cases passed across en/zh-CN/zh-HK.
- Initial combined browser run: 7/9; sign-in UI timeout and signup 429.
  Affected locales rerun separately: zh-CN 3/3, zh-HK 3/3; no check weakened.
- Release checklist item 8 (MCP plus OAuth): 4/4 viewport/locale cases.
- CI: 285 browser cases, 166 visuals; existing baselines/tolerances unchanged.
- Empty-state regression: 3/3 locales after pacing; fast run had two signup 429s.
- One CI contract failure after adding that assertion; regenerated contract, 3/3
  local contract tests and all eight jobs passed on corrected head 6471fe9.
