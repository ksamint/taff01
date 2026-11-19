# Milestone 143 · Separate undated tasks on Today

Plan 0003 P5 · 2026-11-19 · local candidate.

- Due today includes unfinished tasks due on the viewer's local calendar day.
- An initially closed No due date disclosure shows the count of unfinished
  undated tasks. Task links, worker assignment and pagination work in both
  lists. The existing exclusion for undated meeting tasks still applies.
- [Client navigation CN-4](../spec/client-navigation.md#tasks-on-today-cn-4)
  records the contract. The phone case covers en, zh-CN and zh-HK.

Validation: lint, typecheck, and seven focused classifier, font and test-ID
checks passed. All three production phone locale checks passed on the
combined P5 and Q7 build. The realtime case opens the disclosure before
each timed check, leaving its one-second assertions in place. The exact-tree
full gate is pending.

The Today visual harness temporarily clears the date of seeded task NW-145
and restores it after capture, so all four references show the closed
disclosure and its count. Recorded from P5 render source `ef4529a` on Linux
x86-64, Playwright 1.64.1 and Chromium 156.0.8078.80. Four regenerated and
four unchanged comparisons passed. Paired captures are in
`release-reports/today-layout`.
