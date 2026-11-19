# Milestone 155 · Desktop Today uses its available width

Plan 0003 Q7 · 2026-11-19 · local candidate.

- At 1440 px, Today ended at x=1088 on the production baseline and now
  reaches x=1440. The due column starts at x=834 alongside activity.
- At 1280 px, the due column starts at x=754 and reaches x=1280. If activity
  is empty, the task section uses the full content width.
- At 412 px, the activity and due sections kept their baseline positions
  and widths. [Client navigation CN-4.3](../spec/client-navigation.md#tasks-on-today-cn-4)
  records the desktop breakpoint and the stacked phone layout.

Validation: lint, typecheck, four focused Vitest tests and all three
production phone/desktop locale cases passed. The initial JavaScript
budget passed at 197,557 compressed bytes of 204,800. Local before/after
captures are in `release-reports/today-layout`. The pinned Linux visual
references and exact-tree full gate are pending.
