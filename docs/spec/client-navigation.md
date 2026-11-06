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

## Non-functional

- No new client dependency. Today's initial JavaScript remains within its budget.

## Out of scope

- Public-share layout and approved visual references.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| CN-1 | e2e/completion.spec.ts delayed chunk test (browser pending); i18n.test.ts |

## Open decisions

- None.

## Sources

- [Completion task cards](../agent-goal-access-and-completion.md)
- [Agent access](agent-access.md)
