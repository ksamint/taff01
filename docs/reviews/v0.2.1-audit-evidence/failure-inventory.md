# Observed CI and live failures

Historical failures are retained. A failure is not automatically a flaky test: source regressions, deliberate font experiments and stale generated contracts are included separately. Counts below are distinct failed workflow runs per test/project/file, not failure rates. Successful workflow runs may stop before a given test; no per-test denominator is invented.

Observation cutoff: audit start, 2026-10-15 ~10:36 UTC. CI since the v0.1.0 source timestamp: 173 workflow runs (67 success, 47 failure, 58 cancelled, one pending). Visual capture workflow: 51 runs (29 success, 12 failure, 10 cancelled). All 59 failed-run logs were fetched. New repair PR runs are tracked separately by their links in the main report.

## CI browser failures

| Project | Source | Case | Failed runs | Run IDs |
| --- | --- | --- | ---: | --- |
| desktop-en | e2e/ui-parity.spec.ts | agent uses the real Northwind fixture | 2 | 38497981636, 38500810157 |
| desktop-en | e2e/ui-parity.spec.ts | me uses the real Northwind fixture | 1 | 38555831829 |
| desktop-en | e2e/ui-parity.spec.ts | organizations uses the real Northwind fixture | 1 | 38537226305 |
| desktop-en | e2e/ui-v2.spec.ts | home uses the real Northwind fixture | 4 | 38677277340, 38697602783, 38701070233, 38702635777 |
| desktop-en | e2e/ui-v2.spec.ts | projects uses the real Northwind fixture | 2 | 38677204736, 38679400911 |
| desktop-en | e2e/ui-v2.spec.ts | review uses the real Northwind fixture | 1 | 38668624091 |
| desktop-en | e2e/ui-v2.spec.ts | shell uses the real Northwind fixture | 3 | 38669774879, 38671088490, 38675748106 |
| desktop-en | e2e/ui-v2.spec.ts | team uses the real Northwind fixture | 2 | 38693440308, 38704019858 |
| desktop-en | e2e/ui-v2.spec.ts | timeline uses the real Northwind fixture | 1 | 38674362977 |
| desktop-zh-HK | e2e/ui-parity.spec.ts | agent uses the real Northwind fixture | 2 | 38497981636, 38500810157 |
| desktop-zh-HK | e2e/ui-parity.spec.ts | organizations uses the real Northwind fixture | 1 | 38537226305 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | brief uses the real Northwind fixture | 1 | 38684938074 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | home uses the real Northwind fixture | 4 | 38677213754, 38698977109, 38701070233, 38702635777 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | me uses the real Northwind fixture | 2 | 38573790560, 38575382460 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | projects uses the real Northwind fixture | 2 | 38677204736, 38679400911 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | review uses the real Northwind fixture | 1 | 38668624091 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | shell uses the real Northwind fixture | 3 | 38669774879, 38671088490, 38675748106 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | timeline uses the real Northwind fixture | 1 | 38674362977 |
| desktop-zh-HK-dark | e2e/ui-v2.spec.ts | home uses the real Northwind fixture | 1 | 38698468567 |
| en | e2e/brief.spec.ts | phone brief overlay matches the API, answers by rules and restores focus | 1 | 38540626116 |
| en | e2e/calendar.spec.ts | calendar phone touch, cancellation, month move, tray scheduling, empty-slot create and list navigation | 1 | 38190700248 |
| en | e2e/today.spec.ts | loading the desktop sidebar keeps Today visible and resizing restores phone navigation | 1 | 38531752914 |
| phone-en | e2e/ui-parity.spec.ts | agent uses the real Northwind fixture | 2 | 38497981636, 38500810157 |
| phone-en | e2e/ui-parity.spec.ts | organizations uses the real Northwind fixture | 1 | 38537226305 |
| phone-en | e2e/ui-v2.spec.ts | home uses the real Northwind fixture | 2 | 38701070233, 38702635777 |
| phone-en | e2e/ui-v2.spec.ts | projects uses the real Northwind fixture | 2 | 38677204736, 38679400911 |
| phone-en | e2e/ui-v2.spec.ts | timeline uses the real Northwind fixture | 1 | 38674362977 |
| phone-zh-HK | e2e/ui-parity.spec.ts | agent uses the real Northwind fixture | 2 | 38497981636, 38500810157 |
| phone-zh-HK | e2e/ui-parity.spec.ts | organizations uses the real Northwind fixture | 1 | 38537226305 |
| phone-zh-HK | e2e/ui-parity.spec.ts | projects uses the real Northwind fixture | 2 | 38552774559, 38553573985 |
| phone-zh-HK | e2e/ui-v2.spec.ts | brief uses the real Northwind fixture | 2 | 38681960394, 38684938074 |
| phone-zh-HK | e2e/ui-v2.spec.ts | home uses the real Northwind fixture | 2 | 38701070233, 38702635777 |
| phone-zh-HK | e2e/ui-v2.spec.ts | projects uses the real Northwind fixture | 2 | 38677204736, 38679400911 |
| phone-zh-HK | e2e/ui-v2.spec.ts | timeline uses the real Northwind fixture | 1 | 38674362977 |
| phone-zh-HK-dark | e2e/ui-v2.spec.ts | relations uses the real Northwind fixture | 1 | 38695597974 |
| zh-CN | e2e/agent-review.spec.ts | agent reports real MCP evidence and a person approves it from Inbox | 1 | 38536044484 |
| zh-CN | e2e/brief.spec.ts | phone brief overlay matches the API, answers by rules and restores focus | 1 | 38540626116 |
| zh-CN | e2e/calendar.spec.ts | calendar phone touch, cancellation, month move, tray scheduling, empty-slot create and list navigation | 1 | 38190700248 |
| zh-CN | e2e/calendar.spec.ts | calendar real agent lane separates concurrent human time and preserves native touch drag/resize | 1 | 38711396617 |
| zh-CN | e2e/me.spec.ts | Me switches real organizations and preserves theme, time-zone rollback and notification preferences | 1 | 38527063087 |
| zh-CN | e2e/notifications.spec.ts | a digest time chosen while a save is in flight is kept and saved last | 1 | 38663843416 |
| zh-HK | e2e/brief.spec.ts | phone brief overlay matches the API, answers by rules and restores focus | 1 | 38540626116 |
| zh-HK | e2e/calendar.spec.ts | calendar phone touch, cancellation, month move, tray scheduling, empty-slot create and list navigation | 1 | 38190700248 |
| zh-HK | e2e/notifications.spec.ts | a digest time chosen while a save is in flight is kept and saved last | 1 | 38663843416 |

## Capture workflow failures

The capture workflow includes deliberate failed diagnosis variants. Native-control font lifecycle instability is documented and corrected by PR35; the accepted 186-reference run 38708013406 passes without rebaselining. The table is the complete observed failure inventory, not 120 claimed independent flaky defects.

| Project | Source | Case | Failed runs | Run IDs |
| --- | --- | --- | ---: | --- |
| desktop-en | e2e/ui-parity.spec.ts | projects uses the real Northwind fixture | 1 | 38514533054 |
| desktop-en | e2e/ui-parity.spec.ts | shell uses the real Northwind fixture | 3 | 38502161576, 38514533054, 38520599213 |
| desktop-en | e2e/ui-parity.spec.ts | task-detail uses the real Northwind fixture | 1 | 38514533054 |
| desktop-en | e2e/ui-parity.spec.ts | today uses the real Northwind fixture | 1 | 38514533054 |
| desktop-en | e2e/ui-v2.spec.ts | agent uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | brief uses the real Northwind fixture | 2 | 38673790421, 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | calendar uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | companies uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | company-detail uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | contact-detail uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | contacts uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | home uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | inbox uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | mcp uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | me uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | mind uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | notifications uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | organizations uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | projects uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | quick-add uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | relations uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | review uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | search uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | shell uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | stakeholders uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | task-detail uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | team uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | timeline uses the real Northwind fixture | 2 | 38673790421, 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | today uses the real Northwind fixture | 1 | 38702666703 |
| desktop-en | e2e/ui-v2.spec.ts | type uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-parity.spec.ts | projects uses the real Northwind fixture | 1 | 38514533054 |
| desktop-zh-HK | e2e/ui-parity.spec.ts | shell uses the real Northwind fixture | 3 | 38502161576, 38514533054, 38520599213 |
| desktop-zh-HK | e2e/ui-parity.spec.ts | task-detail uses the real Northwind fixture | 1 | 38514533054 |
| desktop-zh-HK | e2e/ui-parity.spec.ts | today uses the real Northwind fixture | 1 | 38514533054 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | agent uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | brief uses the real Northwind fixture | 2 | 38673790421, 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | calendar uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | companies uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | company-detail uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | contact-detail uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | contacts uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | home uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | inbox uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | mcp uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | me uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | mind uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | notifications uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | organizations uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | projects uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | quick-add uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | relations uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | review uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | search uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | shell uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | stakeholders uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | task-detail uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | team uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | timeline uses the real Northwind fixture | 2 | 38673790421, 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | today uses the real Northwind fixture | 1 | 38702666703 |
| desktop-zh-HK | e2e/ui-v2.spec.ts | type uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-parity.spec.ts | projects uses the real Northwind fixture | 1 | 38514533054 |
| phone-en | e2e/ui-parity.spec.ts | shell uses the real Northwind fixture | 3 | 38502161576, 38514533054, 38520599213 |
| phone-en | e2e/ui-parity.spec.ts | task-detail uses the real Northwind fixture | 1 | 38514533054 |
| phone-en | e2e/ui-parity.spec.ts | today uses the real Northwind fixture | 1 | 38514533054 |
| phone-en | e2e/ui-v2.spec.ts | agent uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | brief uses the real Northwind fixture | 2 | 38673790421, 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | calendar uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | companies uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | company-detail uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | contact-detail uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | contacts uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | home uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | inbox uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | mcp uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | me uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | mind uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | notifications uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | organizations uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | projects uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | quick-add uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | relations uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | review uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | search uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | shell uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | stakeholders uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | task-detail uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | team uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | timeline uses the real Northwind fixture | 2 | 38673790421, 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | today uses the real Northwind fixture | 1 | 38702666703 |
| phone-en | e2e/ui-v2.spec.ts | type uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-parity.spec.ts | projects uses the real Northwind fixture | 1 | 38514533054 |
| phone-zh-HK | e2e/ui-parity.spec.ts | shell uses the real Northwind fixture | 3 | 38502161576, 38514533054, 38520599213 |
| phone-zh-HK | e2e/ui-parity.spec.ts | task-detail uses the real Northwind fixture | 1 | 38514533054 |
| phone-zh-HK | e2e/ui-parity.spec.ts | today uses the real Northwind fixture | 1 | 38514533054 |
| phone-zh-HK | e2e/ui-v2.spec.ts | agent uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | brief uses the real Northwind fixture | 2 | 38673790421, 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | calendar uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | companies uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | company-detail uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | contact-detail uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | contacts uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | home uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | inbox uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | mcp uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | me uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | mind uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | notifications uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | organizations uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | projects uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | quick-add uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | relations uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | review uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | search uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | shell uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | stakeholders uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | task-detail uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | team uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | timeline uses the real Northwind fixture | 2 | 38673790421, 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | today uses the real Northwind fixture | 1 | 38702666703 |
| phone-zh-HK | e2e/ui-v2.spec.ts | type uses the real Northwind fixture | 1 | 38702666703 |

## Non-browser failed CI runs

| Failure | Runs | Classification |
| --- | --- | --- |
| Seed idempotence invalid_input | 38488750465, 38489793264, 38492262927, 38494462661 | deterministic seed regression, subsequently repaired |
| Generated test-id contract | 38666908386, 38698160440 | stale generated documentation, subsequently repaired |
| Live discovery expected 140, found 146 | 38684107330, 38684390125, 38684660470 | deterministic stale harness contract, subsequently repaired |
| Model privacy assertion matched incidental 1000 | 38546701044 | assertion instability; inspect meaningful context fields, not serialized substring |
| zh-HK Lighthouse assertion | 38188810672, 38189076436 | audit failure; raw phase-only output cannot prove a flaky root cause |
| Apuch Compose assertion | 38187721441 | deterministic expected configuration mismatch |

## Live failures

| Project | Case | Failed attempts | Run / retry |
| --- | --- | ---: | --- |
| phone-en | create nodes and links by keyboard, edit and archive with undo | 2 | live-20261015T013808Z/acceptance-summary.json retry 0; live-20261015T014000Z/acceptance-summary.json retry 0 |
| phone-en | sources become evidence, with undo | 2 | live-20261015T013808Z/acceptance-summary.json retry 0; live-20261015T014000Z/acceptance-summary.json retry 0 |
| phone-en | Restricted verification member sees timeline and graph without finance; guest sees no CRM switch | 2 | live-20261015T013808Z/acceptance-summary.json retry 0; live-20261015T014000Z/acceptance-summary.json retry 0 |
| phone-en | a person reviews an agent's proposal in the brief before anything changes | 2 | v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 0; v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 1 |
| phone-zh-HK | a person reviews an agent's proposal in the brief before anything changes | 2 | v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 0; v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 1 |
| desktop-en | a person reviews an agent's proposal in the brief before anything changes | 2 | v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 0; v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 1 |
| desktop-en | desktop Me lists snoozed items, returns them to inbox and embeds the v2 agent profile | 2 | v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 0; v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 1 |
| desktop-zh-HK | a person reviews an agent's proposal in the brief before anything changes | 2 | v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 0; v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 1 |
| desktop-zh-HK | desktop Me lists snoozed items, returns them to inbox and embeds the v2 agent profile | 2 | v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 0; v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 1 |
| phone-zh-CN | a person reviews an agent's proposal in the brief before anything changes | 2 | v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 0; v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 1 |
| phone-zh-CN | turn a node into a validation task owned by the person | 1 | v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 0 |
| desktop-zh-CN | a person reviews an agent's proposal in the brief before anything changes | 2 | v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 0; v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 1 |
| desktop-zh-CN | desktop Me lists snoozed items, returns them to inbox and embeds the v2 agent profile | 2 | v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 0; v021/public-20261015T065052Z/run-rxbvy8/acceptance-summary.json retry 1 |
| phone-zh-HK | authenticated timeline setup stays ready while font responses are pending | 1 | timeline-investigation/run-V8QOUY/acceptance-summary.json retry 0 |
| phone-zh-HK | move and resize bars by mouse and by the form, with undo | 1 | v021a/public-20261015T025503Z/run-ng3viX/acceptance-summary.json retry 0 |

Original e9bfa77 run: 19 failed attempts, 14 cleanup failures, zero page/harness errors. Twelve Brief cleanup failures were a deterministic archived-child database guard bug, fixed by 0028; pending-grant cleanup was a deterministic harness bug, fixed by PR36. Do not count those as unexplained flakes. Notification cleanup transport failures passed their one retry and remain recorded. Timeline investigation includes one failed hit target/drag attempt plus 27 passing targeted attempts; the intermediate release retained its one failed attempt rather than rewriting it. The accepted v0.2.1b run is 146/146 first attempt, zero failure/cleanup/browser errors.

## Earlier live release runs

The [older live inventory](older-live-failures.md) adds ten retained summaries / 409 attempts: 14 failures, 12 signatures, including five unchanged-invocation retry recoveries. Mind keyboard three, mind evidence one and restricted-member presentation one. Other repeated failures lack sufficient source/phase identity to call them flakes. These runs do not overlap the v0.2.1 summaries above.

## Audit-repair CI follow-ups

These observations occurred after the historical cutoff and are not silently
added to the original denominators.

| PR / run | Failure | Count | Classification / repair |
| --- | --- | ---: | --- |
| #38 / 38721622197 | Shared MCP smoke expected rejected calls to be persisted | 1 run | Deterministic stale expectation contradicted the required pre-database limiter. Replacement asserts unchanged log snapshots after first and three further real 429s, while retaining accepted-call logging and revoked-token 401. Local bundled smoke 59 checks passed. |
| #42 / 38724259516 | Generated selector contract did not include new live proposal assertions | 1 run | Deterministic derived-document mismatch; 969 other tests passed. Regenerated from actual suites; three contract tests pass. |
| #45 / 38722792384 | Generated selector contract did not include new Calendar coverage | 1 run | Deterministic derived-document mismatch. Regenerated; original assertions and visual thresholds retained. |
| #44 / 38723190125 | Task-contact Undo waited for the former sequence of PUT requests | 1 run / 3 locales | Deterministic transport expectation after the atomic Undo endpoint replaced the sequence. The updated regression must observe the single atomic request and retain all role/stakeholder/UI assertions. |

New source changes legitimately superseded in-progress CI runs. Cancelled runs
are not failures. The #42 → #45 → #46 dependency chain regenerates the combined
selector contract, preserving all three sets of assertions. #46's initial
contract mismatch was caught locally before terminal CI, not counted as a CI
flake. Min-zoom contrast failures in the Relations repair were deliberate local
regression checks; their results remain in the contrast ledger.
