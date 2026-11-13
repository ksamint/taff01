# Spec: Workspace lifecycle

Living product specification for workspace archive and restore
([ADR 0031 amendment 1.4](../adr/0031-exported-view-images.md),
[ADR 0028](../adr/0028-organization-wide-agent-grants.md)). This file states
the current contract; ADRs hold the decisions. Change this file in the same
commit as the behaviour it describes.

Status: released in v0.2.24 (`ff411c6`).

## Users and roles

| Role | Can |
| --- | --- |
| Organization admin | Archive and restore their nonpersonal organizations; list their archived organizations |
| System admin | Archive and restore nonpersonal organizations from `/admin`; retain the existing administration list |
| Member, guest, agent or outsider | Cannot archive or restore; cannot list archived organizations without current nonpersonal admin authority |
| Personal workspace owner | Cannot archive or restore a personal workspace; personal ownership alone does not authorize the archived list |

## Requirements

### Lifecycle and authority (WS-1)

- WS-1.1 When a person archives or restores an organization, the server shall check their current identity and retained membership with `workspace:archive`, including while normal workspace reads are disabled by archive.
- WS-1.2 When an organization is archived, its tasks and membership records shall remain stored, normal workspace reads shall be refused, and every user's matching login default shall be cleared.
- WS-1.3 When an authorized person restores an organization, the server shall clear its archive timestamp and permit existing members to read it again without granting access to outsiders.
- WS-1.4 Restore shall leave login defaults, memberships, token records and grant revocations unchanged; a previously revoked token or grant shall remain revoked.
- WS-1.5 When archive or restore is repeated in the same state, the operation shall succeed without another workspace change or audit row.
- WS-1.6 When a personal workspace is targeted, archive and restore shall return a conflict for otherwise authorized callers; unauthorized callers shall remain forbidden.
- WS-1.7 When an admin loses authority before another admin archives the organization, their subsequent archive, restore and archived-list access shall use the reduced authority.
- WS-1.8 Lifecycle writes shall take the global exclusive lifecycle lock before the system-administration lock and workspace row lock, and shall use the existing workspace audit/change-event mechanism.

### Lists and screens (WS-2)

- WS-2.1 When a person lists archived organizations, the server shall return only archived nonpersonal organizations they currently administer, or all such organizations for a system admin; a caller with no nonpersonal admin authority shall receive 403.
- WS-2.2 When the current workspace is personal or the person lacks archive authority, Organizations shall hide its archive control using the server's `canArchiveWorkspace` capability.
- WS-2.3 When an admin opens archive confirmation, the dialog shall name the organization, explain loss of access and cleared defaults, and require its exact name before submitting.
- WS-2.4 When a person restores from Organizations, the screen shall refresh the organization list while preserving the currently visible active selection and login default.
- WS-2.5 When archived-list access is forbidden, Organizations shall hide that section without displaying an error or leaving an empty layout block for the refused read.
- WS-2.6 When a nonsystem user requests `/admin`, the page shall be refused before streaming; the system-admin page shall offer archive/restore controls only for nonpersonal workspaces.
- WS-2.7 When current authority is lost with an archive dialog open, the screen shall remove that dialog after the confirmed access state updates.

## Non-functional

- TypeScript implementations reuse existing permissions and locks; no migration,
  new dependency, permission action or Rust authority change is introduced.
- Shared schemas define lifecycle responses, administration rows and workspace
  capabilities. API routes remain thin adapters over `packages/core`.
- English, Simplified Chinese and Traditional Chinese ship together.
- List mutations reconcile with server state and roll back optimistic list
  changes on failure; cross-session cache safeguards remain in force.

## Out of scope in v1

- Deleting workspace data, restoring login defaults or restoring revoked grants.
- Archiving personal workspaces or assigning a new organization administrator.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| WS-1.1–1.7, WS-2.1 | `packages/core/src/workspace-lifecycle.integration.test.ts`; lifecycle route rows in `packages/core/src/authorization.integration.test.ts` |
| WS-1.8 | `packages/core/src/workspace-concurrency.integration.test.ts`; lifecycle audit/idempotency assertions |
| WS-2.2–2.7 | `e2e/workspace-lifecycle.spec.ts`, three locales; `e2e/organization-default.spec.ts` |
| Shared capabilities | `packages/core/src/planning.integration.test.ts`; `e2e/today.spec.ts` fixture |

## Open decisions

None for A4.

## Sources

- [ADR 0010](../adr/0010-username-and-system-administration.md)
- [ADR 0028](../adr/0028-organization-wide-agent-grants.md)
- [ADR 0031](../adr/0031-exported-view-images.md)
- [Goal A4](../agent-goal-v0.2.24-view-export-and-alignment.md)
- [Milestone 122](../milestones/122-workspace-archive-and-restore.md)
- [Permissions matrix](permissions-matrix.md)
- [Changelog](../../CHANGELOG.md)
