# 23 — Simple signed-out home

Date: 2026-10-16 UTC. Decision record: ADR 0018. Released as v0.2.6.

## Working
- Signed-out home: wordmark, saved language picker, one headline and sign-in.
- Headlines rotate every four seconds; reduced motion holds the first line,
  including when the preference changes while the page is open.
- One identifier accepts username, mobile or email. A mainland mobile hides
  the password; only the send-code action sends SMS, once under dev effect replay.
- Unsaved HK/Macau browsers, including en-HK, select Traditional Chinese.
  The picker overrides detection and persists; English/Simplified preferences work.

## Review and fixes
- Bundled the missing simplified/traditional headline glyphs and kept the
  form still while longer English headlines rotate. All 12 home baselines approved.
- Removed hero/feature keys have no remaining application/test consumers.
- Cloud finance/native-select/SSR failures passed main controls with Chromium
  1248; production SSR cache headers passed on main and candidate in all locales.
- Corrected two pre-existing checklist fixtures without removing assertions:
  rate limiting precedes audit writes; save locale before first account render.
- Owner closed the en-HK decision: retain ADR 0018. No open product decision.

## Validation and deployment
- Source `69434acc66851c766f43834131a449382b461ce7`; annotated tag `v0.2.6`.
- [PR #55](https://github.com/ksamint/taff01/pull/55) merged; [main CI](https://github.com/ksamint/taff01/actions/runs/38920627000) and [PR CI](https://github.com/ksamint/taff01/actions/runs/38919155166) green without retries.
- 1652 unit/integration tests, 258 browser cases in three locales, 166 visuals;
  final-source home capture matches all 12 approved references byte-for-byte.
- Local production checklist coverage 32/32 across original run/targeted retries;
  only the two failed cases rerun after the locale helper fix: 2/2 passed.
- Three clean local images and official all-31-tool MCP production smoke passed.
- Today JS 190.7 KiB; LCP en/CN/HK 608/668/664 ms; Lighthouse 98/100/100 each.
- Live Steps 0–6: 22/22 incl. realtime/MCP; retries 0; no browser/cleanup failures.
- Extra home checks passed: en-HK Traditional, saved English override, phone-code
  presentation, rotation, en-US English, email and username login; zero SMS requests.
- Native lock, private verified DB/env backups, scoped replacement; no migrations.
  Prior images/data retained; source checkpoint is in docs/deploy.md.
- Missing work/follow-ups: none. Production: https://taff.apuch.cn.
