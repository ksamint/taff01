# Milestone 144 · Lazy details for organization agents

Plan 0003 P4 · 2026-11-19 · local candidate.

- At 412 px, the production baseline made three agent profile requests for
  three roster rows.
- The agent name, profile link, run status and workload remain in the row.
  Supervisor and capabilities load when the Details disclosure opens.
- [Client navigation CN-7](../spec/client-navigation.md#organization-agent-rows-cn-7)
  records the existing workspace authority and new request timing.

Validation: lint, typecheck, font coverage and test-ID contract passed (6
focused tests). The production phone case passed in en, zh-CN, and zh-HK
with a guest, zero profile reads on entry, and one read on opening Details.
Pinned Linux references and the exact-tree full gate are pending.
