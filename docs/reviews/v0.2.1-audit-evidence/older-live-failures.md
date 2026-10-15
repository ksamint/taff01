# Older public live attempt inventory

Inspected **10 summaries, 409 attempts** under `private operator release-watch/2026-10-14`. **14 failed attempts**, 12 title/locale/location signatures; **5 failures recovered on an indexed retry in the same invocation**. No production access, credentials, raw journals or raw browser artifacts inspected.

The same-invocation recoveries establish observed flaky outcomes under unchanged test invocation. Other failures are not automatically flaky: the stored reports suppress error details and do not carry exact deployed/harness SHAs. A later separate run passing is insufficient proof of same-code recovery. No specific deterministic root cause is asserted without supporting evidence.

## Failure signatures

| Test | Locale/project | Source / phase evidence | Failed / observed attempts | Same-invocation retry recoveries |
|---|---|---|---|---|
| a person reviews an agent's proposal in the brief before anything changes | phone-en | location-unavailable | 1 / 4 | 0 |
| [item 2] Tasks | phone-en | e2e/live.ts:227 | 1 / 7 | 0 |
| [item 2] Tasks | phone-zh-HK | e2e/live.ts:227 | 1 / 7 | 0 |
| [item 2] Tasks | desktop-en | e2e/live.ts:227 | 1 / 5 | 0 |
| [item 2] Tasks | desktop-zh-HK | e2e/live.ts:227 | 1 / 5 | 0 |
| Restricted verification member sees timeline and graph without finance; guest sees no CRM switch | desktop-zh-HK | e2e/platform.spec.ts:28 | 1 / 4 | 1 |
| [item 2] Tasks | phone-en | e2e/release/checklist.spec.ts:185 | 2 / 7 | 0 |
| [item 2] Tasks | phone-zh-HK | e2e/release/checklist.spec.ts:185 | 2 / 7 | 0 |
| create nodes and links by keyboard, edit and archive with undo | phone-zh-HK | e2e/mind.spec.ts:66 | 1 / 4 | 1 |
| create nodes and links by keyboard, edit and archive with undo | phone-en | e2e/mind.spec.ts:66 | 1 / 4 | 1 |
| sources become evidence, with undo | desktop-en | e2e/mind.spec.ts:220 | 1 / 4 | 1 |
| create nodes and links by keyboard, edit and archive with undo | desktop-zh-HK | e2e/mind.spec.ts:66 | 1 / 4 | 1 |

## Every failed attempt

| Release / report | Test | Locale | Retry | Source / phase | Classification |
|---|---|---|---|---|---|
| m17-public/reports/live-20261014T122948Z/acceptance-summary.json | a person reviews an agent's proposal in the brief before anything changes | phone-en | not recorded | not retained | failure not shown to recover on same-code retry |
| m18-public/reports/critical-20261014T124432Z/acceptance-summary.json | [item 2] Tasks | phone-en | not recorded | e2e/live.ts:227 (cleanup / invitation-list HTTP response check) | failure not shown to recover on same-code retry |
| m18-public/reports/critical-20261014T124432Z/acceptance-summary.json | [item 2] Tasks | phone-zh-HK | not recorded | e2e/live.ts:227 (cleanup / invitation-list HTTP response check) | failure not shown to recover on same-code retry |
| m18-public/reports/critical-20261014T124432Z/acceptance-summary.json | [item 2] Tasks | desktop-en | not recorded | e2e/live.ts:227 (cleanup / invitation-list HTTP response check) | failure not shown to recover on same-code retry |
| m18-public/reports/critical-20261014T124432Z/acceptance-summary.json | [item 2] Tasks | desktop-zh-HK | not recorded | e2e/live.ts:227 (cleanup / invitation-list HTTP response check) | failure not shown to recover on same-code retry |
| m18-public/reports/noncritical-20261014T125141Z/noncritical-summary.json | Restricted verification member sees timeline and graph without finance; guest sees no CRM switch | desktop-zh-HK | 0 | e2e/platform.spec.ts:28 (test declaration; failure subphase not retained) | same-invocation retry-recovered flake |
| m19a-public/reports/critical-20261014T143541Z/acceptance-summary.json | [item 2] Tasks | phone-en | 0 | e2e/release/checklist.spec.ts:185 (test declaration; failure subphase not retained) | failure not shown to recover on same-code retry |
| m19a-public/reports/critical-20261014T143541Z/acceptance-summary.json | [item 2] Tasks | phone-en | 1 | e2e/release/checklist.spec.ts:185 (test declaration; failure subphase not retained) | failure not shown to recover on same-code retry |
| m19a-public/reports/critical-20261014T143541Z/acceptance-summary.json | [item 2] Tasks | phone-zh-HK | 0 | e2e/release/checklist.spec.ts:185 (test declaration; failure subphase not retained) | failure not shown to recover on same-code retry |
| m19a-public/reports/critical-20261014T143541Z/acceptance-summary.json | [item 2] Tasks | phone-zh-HK | 1 | e2e/release/checklist.spec.ts:185 (test declaration; failure subphase not retained) | failure not shown to recover on same-code retry |
| m19a-public/reports/noncritical-20261014T144154Z/noncritical-summary.json | create nodes and links by keyboard, edit and archive with undo | phone-zh-HK | 0 | e2e/mind.spec.ts:66 (test declaration; failure subphase not retained) | same-invocation retry-recovered flake |
| v020-public/reports/noncritical-20261014T155315Z/noncritical-summary.json | create nodes and links by keyboard, edit and archive with undo | phone-en | 0 | e2e/mind.spec.ts:66 (test declaration; failure subphase not retained) | same-invocation retry-recovered flake |
| v020-public/reports/noncritical-20261014T155315Z/noncritical-summary.json | sources become evidence, with undo | desktop-en | 0 | e2e/mind.spec.ts:220 (test declaration; failure subphase not retained) | same-invocation retry-recovered flake |
| v020-public/reports/noncritical-20261014T155315Z/noncritical-summary.json | create nodes and links by keyboard, edit and archive with undo | desktop-zh-HK | 0 | e2e/mind.spec.ts:66 (test declaration; failure subphase not retained) | same-invocation retry-recovered flake |

## Report totals

| Summary | Top-level status | Attempt status counts |
|---|---|---|
| m17-public/reports/live-20261014T122948Z/acceptance-summary.json | failed | {'passed': 1, 'failed': 1} |
| m18-public/reports/critical-20261014T124432Z/acceptance-summary.json | failed | {'passed': 17, 'failed': 4} |
| m18-public/reports/critical-20261014T125016Z/acceptance-summary.json | passed | {'passed': 4} |
| m18-public/reports/noncritical-20261014T125141Z/noncritical-summary.json | passed | {'passed': 89, 'skipped': 5, 'failed': 1} |
| m18b-public/reports/critical-20261014T130840Z/acceptance-summary.json | passed | {'passed': 21} |
| m19a-public/reports/critical-20261014T143541Z/acceptance-summary.json | failed | {'passed': 19, 'failed': 4} |
| m19a-public/reports/critical-20261014T144111Z/acceptance-summary.json | passed | {'passed': 2} |
| m19a-public/reports/noncritical-20261014T144154Z/noncritical-summary.json | passed | {'passed': 102, 'skipped': 6, 'failed': 1} |
| v020-public/reports/critical-20261014T154616Z/acceptance-summary.json | passed | {'passed': 21} |
| v020-public/reports/noncritical-20261014T155315Z/noncritical-summary.json | passed | {'passed': 102, 'skipped': 6, 'failed': 3} |

## Interpretation

- Mind keyboard create/edit/archive: 3 retry-recovered failures (m19a phone-zh-HK; v0.2.0 phone-en and desktop-zh-HK).
- Mind sources/evidence: 1 retry-recovered failure (v0.2.0 desktop-en).
- Restricted member/guest permission presentation: 1 retry-recovered failure (m18 desktop-zh-HK).
- Tasks: m19a phone-en and phone-zh-HK both failed retry 0 and retry 1 (4 attempts). A separate later report contains 2 passes, but code identity is absent, so do not call these confirmed flakes.
- Tasks: m18 failed across all 4 projects at invitation cleanup response check (`e2e/live.ts:227`). A separate later 4-case report passed. This is cross-locale repetition with a retained cleanup phase, not proof of a deterministic root cause or same-code retry recovery.
- Agent proposal brief: m17 phone-en failed once, no source location or indexed retry retained; exact phase and cause unavailable.

Metadata caveat: all failure errors are `details-suppressed`. Test declaration lines are not failed-action lines. Top-level passed summaries contain failed first attempts, and those attempts remain counted. The JSON includes each allowed summary hash and failed row index for traceability without raw artifacts.

Discovery: other known state roots `taff-v021` (live-20261015T013808Z, live-20261015T014000Z) and `taff-v022` were listed by directory names only. No additional older public report root was established. Existing lead inventory covers taff-v021; these counts must be merged without double-counting.

Additional known worktree discovery: `src/github.com/ksamint/taff01-v021/e2e/live/reports/run-2TOui3/acceptance-summary.json` is mode=discovery with zero rows; excluded from live attempt counts. Canonical `src/github.com/ksamint/taff01` has no reports directory at the checked known paths.
