# Spec: client navigation and optimistic state

Living specification for the remaining client completion work. Change this
file in the same commit as the behavior it describes.

Status: v0.2.20 candidate; browser acceptance pending.

## Users and roles

| Role | Can |
| --- | --- |
| Signed-in person | Navigate their permitted app panels and edit permitted data |

## Requirements

### Loading feedback (CN-1)

- CN-1.1 While desktop Me or a lazy Me panel loads, the browser shall show
  the existing localized loading text with status semantics in en, zh-CN and zh-HK.
- CN-1.2 Loading feedback shall retain the existing route, permission and
  design token behavior.

### Concurrent optimistic edits (CN-2)

- CN-2.1 When an optimistic mutation fails, rollback shall invert only its
  own changed fields and rows while retaining later pending edits.
- CN-2.2 Two overlapping failures in either order shall restore the baseline
  without resurrecting a failed layer, including shared calendar rows and
  newly created caches. Baselines shall be captured after query cancellation.

### Project management after phone filters (CN-3)

- CN-3.1 When an administrator opens the phone project filters and changes a
  task filter, the project creation control shall remain available and open
  the existing project form in en, zh-CN and zh-HK.
- CN-3.2 Project management controls shall continue to use the current
  canManageProjects read; this regression does not grant new authority.

## Non-functional

- No new client dependency. Today's initial JavaScript remains within its budget.

## Out of scope

- Public-share layout and approved visual references.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| CN-3 | e2e/project-filter-completion.spec.ts (browser pending) |
| CN-2 | optimistic-m3.test.ts (13 tests); inherited fixes a30b779, bf7e0b5, deaf815 and 7ff9762 |
| CN-1 | e2e/completion.spec.ts delayed chunk test (browser pending); i18n.test.ts |

## Open decisions

- None.

## Sources

- [Completion task cards](../agent-goal-access-and-completion.md)
- [Agent access](agent-access.md)
