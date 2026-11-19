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
each timed check, leaving its one-second assertions in place. Four pinned
Linux Today references and the exact-tree full gate are pending.
