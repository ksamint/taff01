# Spec: agent access

Living product specification for agent credentials, workspace grants and organization
policy (ADR 0022, 0023, 0028). Change this file with the behavior it describes.

Status: v0.2.19 candidate; production acceptance pending.

## Users and roles

| Role | Can |
| --- | --- |
| System administrator | Set organization policy, inspect system tokens and restore workspace grants |
| Workspace administrator | Issue personal tokens, manage organization grants, revoke and restore grants for their workspace |
| Member | Approve OAuth for a supervised agent within the member scope ceiling; revoke their own approvals |
| Guest | No credential management |
| Agent | Use its effective workspace scopes and capabilities; no credential management |

## Requirements

### Tokens (AA-1)

- AA-1.1 Issuing a personal token shall reveal its raw value once and store only
  its peppered hash. Revocation shall immediately refuse subsequent calls.
- AA-1.2 Personal tokens shall retain their home workspace and existing raw
  credential when organization policy changes.
- AA-1.3 Each call shall enforce the resolved agent's current membership,
  capabilities, review policy and effective workspace scopes.

### Workspace grants (AA-2)

- AA-2.1 A personal token shall reach another workspace only through an active
  materialized grant; OAuth grants shall remain workspace-bound.
- AA-2.2 Grant reads shall expose origin and revoking identity without exposing
  token hashes or raw credentials.
- AA-2.3 A target workspace administrator shall be able to revoke its grant.
  Restore shall require current target administrator or system administrator
  authority and refuse revoked tokens or archived workspaces.
- AA-2.4 MCP tools shall default to the token's home workspace when workspaceId
  is omitted. workspaces.list shall enumerate effective authorized workspaces;
  context.get shall include their identifiers and names.

### Organization policy (AA-3)

- AA-3.1 Only a system administrator shall change a token's explicit or
  all_organizations policy, with an optimistic version check.
- AA-3.2 all_organizations shall enroll active organization workspaces using
  the token's scopes and safe agent defaults. Personal and archived workspaces
  shall never be enrolled.
- AA-3.3 Creating an organization shall enroll active policy tokens in its
  creation transaction.
- AA-3.4 Administrator revocations shall remain sticky across enrollment and
  policy toggles until explicitly restored by an authorized person.
- AA-3.5 Switching to explicit shall revoke policy grants and preserve manual
  grants. Each touched workspace shall receive an audit row and notification.
- AA-3.6 When the current home workspace administrator changes token scopes,
  the system shall copy those scopes to active policy grants and increment the
  token version. Manual grants and revoked policy grants shall remain unchanged.
  Reapplying all_organizations shall reconcile active policy grants to token
  scopes. Every updated target row shall retain its original grantor and audit
  the person making the scope or policy change.

### OAuth roles (AA-4)

- AA-4.1 Admins shall approve organization agents; members shall approve only
  supervised agents within the member scope ceiling; guests and agents shall
  never approve.
- AA-4.2 Code redemption and every refresh shall recheck current approver
  authority and scope ceilings. Refresh shall rotate the hashed refresh token.
- AA-4.3 A member shall restore only an OAuth revocation they made while they
  retain approval authority. Administrator revocation shall not be undone by
  a member.

### Permission boundaries (AA-5)

- AA-5.1 Every management operation shall enforce can() in core. Management
  REST routes shall require a human session and refuse agent bearers.
- AA-5.2 Authenticated application HTML shall carry private, no-store cache
  directives. Public shares shall retain their independent access checks.
- AA-5.3 Authority tests shall exercise issue, extend, restore, list and revoke
  at the lowest reachable role and after that role loses authority.
- AA-5.4 Workspace administrators and system administrators shall inspect current
  access through the [access matrix contract](access-matrix.md). Baseline action
  rows shall derive from can() and the runtime action registry.

## Non-functional

- Mutations use one transaction, actor audit and PostgreSQL change notification.
- Enrollment planning is deterministic and has a golden fixture for Rust parity.
- Management strings ship in en, zh-CN and zh-HK; no new client dependency.

## Out of scope

- Personal workspace enrollment; OAuth organization-wide policy; token rotation
  as part of policy enrollment; agent management of credentials.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| AA-1, AA-2 | authorization.integration.test.ts; mcp-workspaces.test.ts |
| AA-3 | token-policy.test.ts; token-policy.integration.test.ts |
| AA-4 | authorization.integration.test.ts; oauth integration tests |
| AA-5.1 | permissions.test.ts; app.test.ts |
| AA-5.2 | e2e/ssr-session.spec.ts |
| AA-5.3 | authorization.integration.test.ts; token-policy.integration.test.ts |
| AA-5.4 | access-matrix.integration.test.ts; permissions.test.ts; scripts/permissions-matrix.test.ts |
| Three-locale management | e2e/token-grants.spec.ts; acceptance pending |

## Open decisions

ADR 0028 defaults apply: policy grants use the token's scopes and never enroll
personal workspaces. Twin policy activation follows deployment closeout.

## Sources

- [OAuth server](../adr/0022-mcp-oauth-authorization-server.md)
- [OAuth roles](../adr/0023-role-based-mcp-oauth-approval.md)
- [Organization policy](../adr/0028-organization-wide-agent-grants.md)
- [Task plan](../agent-goal-access-matrix-and-renders.md)
- [Release closeout](../release-closeout.md)
