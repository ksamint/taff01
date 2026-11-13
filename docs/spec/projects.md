# Spec: Project profiles

Living product specification for project profiles ([ADR 0021](../adr/0021-project-stage-lead-and-shared-finance.md)).
This file states the current contract; the ADR holds the decisions. Change this
file in the same commit as the behaviour it describes.

Status: released in v0.2.24 (`ff411c6`).

## Users and roles

| Role | Can |
| --- | --- |
| Workspace admin | Create and edit the project profile, including due date and delivery progress |
| Non-guest person in charge | Read profile metadata and change the stage; cannot edit due date or delivery progress |
| Member or guest | Read project profile metadata; cannot edit the profile |
| Agent | Read through existing authorized project tools; proposal/approval rules remain in ADR 0025 |

## Requirements

### Profile fields (PR-1)

- PR-1.1 When an admin opens the project dialog, the form shall initialize the stored name, stage, person in charge, due date and delivery progress; a new project shall start with no date and progress zero.
- PR-1.2 When an admin changes a date, the form shall convert that civil date to the end of the day in the user's saved time zone; clearing it shall store `null`.
- PR-1.3 When the displayed date is unchanged from opening the dialog, saving another field shall preserve the exact stored due timestamp, including seconds and milliseconds.
- PR-1.4 The delivery progress shall be an integer from 0 through 100; blank, fractional and out-of-range values shall not save.
- PR-1.5 When a project is selected, its header shall show delivery progress, including zero, and its due date when present, using the viewer's language and saved time zone.
- PR-1.6 When a profile is saved, the client shall update it optimistically through the existing versioned project mutation and restore cached data if the request fails.
- PR-1.7 When another writer advances the project version after the dialog opens, saving the stale form shall return a conflict and show a localized toast; the dialog shall remain open and the latest project metadata shall replace the rejected optimistic values.
- PR-1.8 When an authorized person exports the project after its date or progress changes, the PNG shall use the saved fields and its content hash shall change with the export snapshot.

### Authority (PR-2)

- PR-2.1 When the user lacks `project:manage`, the client shall hide the project profile editor and the API shall refuse due-date or delivery-progress updates, including updates by a project lead.
- PR-2.2 When a person loses admin authority with a profile dialog open, the client shall remove the editor after the confirmed access state updates.
- PR-2.3 When a non-guest project lead has stage authority, the existing stage-only control shall remain available without granting profile-edit authority.

## Non-functional

- The existing `POST /api/projects` and versioned `PATCH /api/projects/:id`
  contracts remain authoritative; `packages/schemas` validates ISO instants
  and bounded integer progress.
- English, Simplified Chinese and Traditional Chinese (Hong Kong) labels ship
  together. No new dependency, migration or permission action is introduced.
- Export limits and privacy remain specified in [view export](view-export.md).

## Out of scope in v1

- Deriving delivery progress from task completion counts.
- Editing a project deadline's clock time in this date-only dialog.
- New project finance, stage or agent-approval permissions.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| PR-1.1–1.5 | `e2e/project-profile.spec.ts` project profile and delivery-field cases, three locales; `apps/web/src/lib/task-date.test.ts`; `packages/core/src/project-delivery.test.ts` |
| PR-1.6–1.7 | `e2e/project-profile.spec.ts` rejected stage rollback and stale delivery edit; `apps/web/src/lib/mutations/cache-updates.test.ts` |
| PR-1.8 | `e2e/project-profile.spec.ts` real PNG/header-hash before/after; `packages/core/src/summary-model.test.ts`; `packages/core/src/view-export.integration.test.ts` |
| PR-2.1–2.3 | `e2e/project-profile.spec.ts` member/lead reads, rejected field writes, stage control and open-editor authority loss; `packages/core/src/permissions.test.ts` |

## Open decisions

None for A2.

## Sources

- [ADR 0021](../adr/0021-project-stage-lead-and-shared-finance.md)
- [v0.2.24 goal, A2](../agent-goal-v0.2.24-view-export-and-alignment.md)
- [Milestone 120](../milestones/120-project-due-date-and-delivery-progress.md)
- [View export](view-export.md)
- [Changelog](../../CHANGELOG.md)
