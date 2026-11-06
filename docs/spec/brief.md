# Spec: Brief and rules-based questions

Living specification for Brief's deterministic question router (ADR 0016,
frontend v2 M17). Change this file in the same commit as its behavior.

Status: shipped in v0.2.20, source `596272a`; workload database/three-locale browser cases and the complete local/native release gate passed. See [milestone 104](../milestones/104-v0.2.20.md).

## Users and roles

| Role | Can |
| --- | --- |
| Workspace member | Ask about work in their current memberships |
| Scoped agent | Ask within its authorized workspace |
| Outsider | No read of another workspace |

## Requirements

### Rules and workload (BR-1)

- BR-1.1 The rules router shall recognize risk, blocked work, items needing
  the reader, due tasks, agent activity and workload in en, zh-CN and zh-HK.
- BR-1.2 Workload shall count non-archived unfinished leaf tasks by owner and
  workspace, including tasks outside projects. Parent containers and completed
  tasks shall not inflate counts. Archived children shall not suppress a parent.
- BR-1.3 Workload rows shall rank by descending count, then workspace and member
  ID for stable ties. Only memberships in the supplied authorized source count.
- BR-1.4 Each workload row shall carry its member ID and an integer source count.
  The web shall translate member/workspace labels and counts without inventing
  task details or a destination. Empty data shall produce an empty answer.
- BR-1.5 The new all-owner task read shall run only for workload questions;
  ordinary Brief and other question reads shall retain their existing filters.

## Non-functional

- Core remains the authority, guarded by can(workspace:read). Guests retain
  their existing workspace reads; agents require current scope/capability/grant
  authority. Missing scopes, ask/deny capability and revocation deny the read.
  Losing administrator status alone does not remove workspace:read. The shared schema
  defines the wire shape. No new provider, dependency, migration or environment.
- Rules work without any AI configuration. Existing explicit model opt-in stays
  separate; labels/names never enter its structured numeric context.

## Out of scope

- Estimated effort, capacity, utilization percentages or inferred availability.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| BR-1.1–1.4 | brief.test.ts; portable __fixtures__/ask-load.json; brief-model.test.ts; i18n.test.ts |
| BR-1.2,1.5; authorization | assistant.integration.test.ts; assistant/Brief focused set 73 tests passed against isolated PostgreSQL |
| Three-locale rendering | e2e/completion.spec.ts workload case passed in en, zh-CN and zh-HK; milestones 100 and [104](../milestones/104-v0.2.20.md), accepted full browser gate 318/0 |

## Open decisions

- None.

## Sources

- [Frontend plan](../frontend-v2-plan.md)
- [Completion cards](../agent-goal-access-and-completion.md)
- Prototype Module Plan.dc.html line 643: unfinished leaf tasks per owner.
