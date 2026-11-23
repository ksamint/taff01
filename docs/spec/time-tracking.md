# Spec: time tracking

Status: Plan 0004 N5. This contract covers work logged by people and effective
hourly rates within one workspace.

## Users and roles

| Role | Entries | Hourly rates |
| --- | --- | --- |
| Workspace person | Read, create, edit and delete their own | Read their own |
| Workspace admin | Read all and change their own | Read and set rates for workspace people |
| Agent or non-member | No access | No access |

## Requirements

- TTIM-1.1 Task detail shall allow a person to log 1–1,440 whole minutes on
  an active task in their workspace, with a civil date and an optional note
  up to 2,000 characters. Me shall list their entries and let them edit or
  delete their own. An archived task's time stays visible in Me.
- TTIM-1.2 The entry date shall default to today in the workspace's time
  zone. UTC is the default workspace zone. Dates are stored as civil dates.
- TTIM-1.3 The time API shall use the person's workspace member ID. A
  workspace admin may filter to another person or read the entire workspace.
  All entry writes shall require the same member ID as the entry owner.
- TTIM-2.1 A workspace admin shall record a person's hourly rate in currency
  micros and a valid-from date. Re-entering the same date replaces that rate.
  The effective rate on a day is the latest rate that began on or before it.
- TTIM-2.2 A member may read their own rate history. Only workspace admins
  may read the rate history of other people.
- TTIM-3.1 Entry and rate changes shall commit the actual actor's audit row
  with the mutation. Realtime events shall reach the owner and workspace
  admins only. Audit details and notifications omit notes and rate amounts.

## Non-functional

- All routes are authenticated Rust endpoints in `/api/time-entries` and
  `/api/member-rates`. The browser uses English, Simplified Chinese and
  Traditional Chinese.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| TTIM-1, TTIM-2, TTIM-3 | `backend/crates/taff-api/tests/time_tracking.rs` |
| TTIM-1, TTIM-2 | `e2e/time-tracking.spec.ts` |

## Sources

- [Plan 0004](../plans/0004-function-map-gaps-in-rust.md)
