# 0023 — Role-based MCP OAuth approval

Date: 2026-10-20. Status: accepted. Supersedes ADR 0022's “Who may approve”.

## Context

Members supervise agents but previously needed an admin to connect an MCP client.
Approval must follow current supervision and role, without changing the agent's
admin-managed capabilities or allowing members to issue personal tokens.

## Decision

- `token:connect`: admins may connect any organization agent; members may connect
  only agents they supervise. Guests and agents never approve clients.
- Admin OAuth scope ceiling: all five scopes. Members: tasks:read, tasks:write,
  calendar:write, inbox:review. files:write stays admin-only. Consent shows locked
  scopes and selects the requested scopes intersected with the current ceiling.
- Consent, approval and code redemption enforce supervision and scope ceilings
  in core. An out-of-ceiling approval returns 403, without silently trimming it.
- Every refresh rechecks the approver's current role, supervision and ceiling.
  Lost authority commits an audited revocation as the agent, then invalid_grant.
  Existing access tokens otherwise expire within one hour.
- `token:manage` remains admin-only, including personal tokens and call logs.
  `token:revoke` allows admins any token and members only OAuth grants they
  approved. Members list those grants and revoke/undo from Connected apps;
  a member undoes only a revocation they made, and only while they may still
  connect that agent with the grant's scopes (amended 2026-10-21: undo was
  first allowed for any person's revocation, so a member could reverse an
  admin's).
- Grants reuse created_by and agent supervision; no migration or dependency.

## Consequences

- Members can connect their supervised agents without expanding agent rights.
- Supervision changes and demotion end refresh eligibility. Admins retain all
  grant visibility; OAuth rows identify the approving person.
- ADR 0022's per-person connected-apps open item is resolved on the MCP page.
  CIMD remains outside this decision and requires separate SSRF controls.
