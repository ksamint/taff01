# 0028 — Organization-wide agent token grants

Date: 2026-11-05. Status: accepted for implementation (owner: "grant access to fenshen01 so
fenshen01 can access all org"). Follows ADR 0022/0023 (MCP OAuth and roles),
the organization grant model of PR #81 (milestone 82 in that branch) and
ADR 0026 constraint 3 (new backend logic stays in `packages/core` TypeScript).

## Context

A personal agent token is bound to one workspace (`agent_tokens.workspace_id`
and `member_id`). PR #81 adds `agent_token_workspaces`: explicit, audited,
per-organization grants with their own scopes, a per-call `workspaceId` on
every MCP tool and a `workspaces.list` tool, and records the owner's rule at
the time: "create APUCH / Table AI fenshen01 identities and `tasks:read`
grants through the management API; do not authorize personal or future
organizations".

The owner now wants the Twin agent (`fenshen01`, one `tool_servers` row on
its side holding one Taff token for `https://taff.apuch.cn/mcp`) to reach
every organization, including organizations created later, without a person
issuing a grant per organization. Twin keeps one token; it already selects
tools by whitelist and will pass `workspaceId` per call.

Constraints: one permission function `can()`; every access change audited and
notified; the AGENTS.md access-change rule (test issue, extend, re-enable,
list and revoke with the lowest role, and again after that role is lost);
agents never get a code path a person lacks; personal workspaces are never
shared.

## Decision

1. **A token-level organization policy**, `agent_tokens.organization_policy`
   `CHECK IN ('explicit', 'all_organizations')`, default `explicit`. Only a
   system administrator (`users.system_admin`) may set it, through one core
   operation `setTokenOrganizationPolicy`, audited on the token's home
   workspace with the actor.
2. **Grants stay materialized.** Setting `all_organizations` enrolls the
   token into every active organization workspace (`workspaces.kind =
   'organization'`, not archived) by inserting an `agent_token_workspaces`
   row per workspace with `origin = 'policy'`, the token's own scopes, and an
   agent member in that workspace: the existing agent member with the token
   agent's name if one exists, else a new agent member with the default
   profile (`always_review`, lazy capability defaults, no supervisor), exactly
   as "Add agent" creates one. Personal workspaces are never enrolled.
3. **New organizations enroll on creation.** `createWorkspace` for an
   organization also enrolls every token whose policy is `all_organizations`,
   in the same transaction as the default agent (milestone 37). Archiving a
   workspace stops its grants as today; unarchiving restores them.
4. **Workspace administrators keep the last word.** An administrator of the
   target organization can revoke a policy grant for their workspace
   (`revokedAt`, `revokedBy`, `origin` unchanged). A revoked policy grant is
   not re-enrolled by any later policy change or workspace event until that
   administrator or a system administrator restores it. Capabilities per
   workspace remain the agent member's `agentPermissions` and review policy,
   edited where they are today.
5. **Turning the policy back to `explicit`** revokes every grant with
   `origin = 'policy'` that is still active, in one transaction, and leaves
   manual grants untouched. Restore is per grant, by the same roles as today.
6. **Resolution** is unchanged from PR #81: `resolveAgentWorkspace(workspaceId)`
   accepts a workspace only if an active, unrevoked grant exists for it and
   the member is still active; `workspaces.list` returns effective grants
   with their origin. No implicit access is computed from the policy at call
   time, so revocation and archive remain immediate and auditable.
7. **Permissions.** New actions `token:policy` (system administrator only),
   `token:grant` and `token:grant_revoke` (target workspace admin, or system
   administrator), each with table-driven rows; agents are denied all three.

## Consequences

- Additive migration (next free number after PR #81's 0039): one column and
  one `origin` column with a CHECK on `agent_token_workspaces`.
- The access matrix (goal milestone B) shows policy grants with their origin
  and the system-administrator view lists every token with
  `all_organizations`.
- The Rust permissions golden (PR #84) must be regenerated: three actions.
- Twin needs no new credential. Its Taff connection whitelist gains
  `workspaces.list`; its model passes `workspaceId` per call; its
  `mcp_source` profile check reads `context.get` for the chosen workspace.

## Open decisions

1. Scopes for policy grants: the token's own scopes (proposed) or a
   policy-wide scope set chosen when the policy is set.
2. Whether a personal workspace may ever be enrolled by its owner
   (proposed: never; unchanged from PR #81).
3. Whether `summaries.list` and `summaries.get` become MCP read tools so Twin
   can deliver shareholder summaries (ADR 0027 decision 4 says no in v1).
