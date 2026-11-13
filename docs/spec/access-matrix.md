# Spec: access matrix

Living product specification for workspace and system access visibility (ADR 0028,
release v0.2.19). Change this file with the behavior it describes.

Status: shipped in v0.2.19, deployed source `d10c0a8`; exact-source local and native acceptance are recorded in [milestone 102](../milestones/102-v0.2.19.md).

## Users and roles

| Role | Can |
| --- | --- |
| Workspace administrator | Inspect people, agents, token grants, OAuth approvals and pending capability requests in their workspace |
| System administrator | Inspect organization grant states across personal agent tokens |
| Member, guest, outsider, agent | No access to either management matrix |

A system administrator also has materialized administrator memberships; workspace
reads use the same current membership checks as other administration operations.

## Requirements

### Workspace matrix (AM-1)

- AM-1.1 When a current workspace administrator requests the matrix, the system
  shall return people and their roles, agent profiles with effective capability
  defaults, review policy and supervisor, and pending capability grants.
- AM-1.2 The workspace matrix shall include personal tokens issued in or granted
  to the target workspace, with grants restricted to that workspace, including
  manual or policy origin, revocation time and revoking member identity.
- AM-1.3 The workspace matrix shall include OAuth approvals bound to that
  workspace and their application names.
- AM-1.4 When an administrator loses workspace administration, subsequent matrix
  requests shall be denied. Members, guests, outsiders and agent tokens shall
  receive no management matrix.
- AM-1.6 Token explanations include every effective capability decision, merging
  configured overrides with the same defaults used by `can()`. Revoked tokens
  expose no effective permissions. Durable audit snapshots keep their original
  explicit-row representation.
- AM-1.5 When an administrator explains a token granted from another workspace,
  the system shall resolve the target grant member and its current effective
  authority. A revoked grant shall have no active scopes.
- AM-1.7 The workspace matrix shall display pending capability requests in a
  localized Pending requests tab with agent profile links, capability, reason,
  task or workspace scope, and pending status, or an explicit empty state.
  Readable task scopes shall show the task reference and title linked to the
  task; an unreadable or unavailable task shall retain its raw id with a
  localized unavailable label and no task link.
  Confirmed administrators with the agent's current `canDecideGrants` flag may
  use the existing expiring allow and deny actions. The matrix shall refresh
  after a decision; resolved requests shall disappear. Permanent permission
  changes and resolved-request revocation remain in the agent profile.

### System matrix (AM-2)

- AM-2.1 When a current system administrator requests the matrix, the system shall
  return organizations, including archive state, and personal tokens with their
  materialized organization grants and policy.
- AM-2.2 The system matrix shall exclude personal workspaces from organization
  rows and grant cells. OAuth approvals shall not appear as organization tokens.
- AM-2.3 When the caller loses system administration, subsequent system matrix
  reads shall be denied even if workspace administrator memberships remain.

### Permission publication (AM-3)

- AM-3.1 Workspace matrix action rows and the published permission document shall
  derive from the same runtime action registry and can() evaluations consumed
  by the permission tests.
- AM-3.2 The published baseline shall identify its resource assumptions. It shall
  not claim to cover every owner, supervisor, lead, recipient or temporary grant
  condition.
- AM-3.3 When the permission document differs from generated rows, lint and its
  document staleness test shall fail.
- AM-3.4 The workspace matrix page shall show the rows it returns in a
  Permissions tab: grouped by resource with localized group names, the action
  code, an allowed or not-allowed mark with a screen-reader label for admin,
  member, guest and agent, and the AM-3.2 baseline note above the table.

## Non-functional

- REST management routes require a signed-in human session. Authorization lives
  in core and is checked on every read.
- Matrices and permission explanations never expose token or refresh hashes,
  refresh credentials or raw credentials.
- The existing grant, membership and capability mutation operations remain the
  authority for changes made from the matrix UI.

## Out of scope

- New permission tiers, implicit token access, public matrices and management
  operations by agents.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| AM-1, AM-2 | packages/core/src/access-matrix.integration.test.ts |
| AM-1.7 | e2e/access.spec.ts "workspace admin resolves pending capability requests" in en, zh-CN and zh-HK |
| Human REST boundaries | apps/api/src/app.test.ts; packages/core/src/authorization.integration.test.ts |
| AM-3.1–2 | packages/core/src/permissions.test.ts |
| AM-3.3 | scripts/permissions-matrix.test.ts; lint --check command |
| AM-3.4 | e2e/access.spec.ts "workspace admin reads the baseline permission rows" in en, zh-CN and zh-HK |
| Web rendering and role/capability changes | e2e/access.spec.ts; accepted three-locale gate and native read-only matrix acceptance in [milestone 102](../milestones/102-v0.2.19.md) |

## Open decisions

None for read models. v0.2.19 UI acceptance is complete: 306 browser cases passed, three production SSR cases and 32 production checklist cases passed; native workspace visibility and the current system-administrator boundary passed. See [milestone 102](../milestones/102-v0.2.19.md).

## Sources

- [Organization policy ADR](../adr/0028-organization-wide-agent-grants.md)
- [Release plan](../agent-goal-access-matrix-and-renders.md)
- [Agent access contract](agent-access.md)
- [Generated permission baseline](permissions-matrix.md)
- [Release closeout](../release-closeout.md)
