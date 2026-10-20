# Agent goal: MCP OAuth by role — members connect the agents they supervise

> Status 2026-10-20: written after review of PR #65 (`b64047b`, ADR 0022,
> milestone 32; CI 8/8 green). The owner decided the open question of
> ADR 0022: regular members may also approve MCP OAuth clients, with less
> authority than admins, decided by their role.

Paste everything below this line as the goal.

---

Work in `ksamint/taff01` on a branch from `main` once PR #65 is merged (or
from `claude/fervent-archimedes-7n3rb0` until then). Read first: `AGENTS.md`,
`instruction_v0.md`, `docs/adr/0022-mcp-oauth-authorization-server.md`,
`docs/milestones/32-mcp-oauth.md` and the PR #65 diff, which is the pattern
to follow: shared Zod schemas, core-only data access, `can()` for every rule,
three locales in the same commit, tests with the code. No migration should be
needed (`agent_tokens.created_by`, `agent_profiles.supervisor_id` exist).

## What exists

- `packages/core/src/oauth.ts`: `getConsent`, `decide` and `exchangeCode` all
  require `token:manage`, which `can()` gives only to `role === "admin"`
  persons. `refreshGrant` does **not** re-check the approver.
- A grant is an `agent_tokens` row (`oauth_client_id` set, `created_by` = the
  approving member, hourly access token, rotating 30-day refresh token).
- `/api/agent-tokens` list/revoke/restore and `/api/mcp-calls` need
  `token:manage`; the MCP page (`apps/web/src/components/mcp-view.tsx`) shows
  `mcp.adminOnly` on 403.
- An agent's effective rights are already bounded by its admin-set capability
  permissions (`DEFAULT_PERMISSIONS`, agent permissions, grants); scopes only
  narrow them. `agent:manage` (supervisor, permissions) stays admin-only.

## Rules to build

| Role   | May connect a client for          | Scope ceiling                                         | Personal (non-expiring) tokens | Sees and revokes                     |
| ------ | --------------------------------- | ----------------------------------------------------- | ------------------------------ | ------------------------------------ |
| admin  | any agent of the organization     | all five                                              | yes (unchanged)                | every token and grant, call log      |
| member | agents whose supervisor they are  | `tasks:read`, `tasks:write`, `calendar:write`, `inbox:review` | no                             | only grants they approved, last used |
| guest  | nothing                           | none                                                  | no                             | nothing                              |

`files:write` stays admin-only for OAuth grants. Agents never approve.

## Build

1. **Permissions** (`packages/core/src/permissions.ts`).
   - Add `"token:connect"`: a non-guest person; admin for any agent, member
     only when `resource.supervisorId === actor.id`. Agents: never.
   - Export `OAUTH_SCOPE_CEILING: Record<"admin" | "member" | "guest", Scope[]>`
     with the table above, and one helper that answers whether a person may
     grant a scope set for an agent. Keep `token:manage` admin-only.
   - Add `"token:revoke"`: admin any token; a member only an OAuth grant
     whose `created_by` is their member id (pass it as `ownerId`).
2. **Core OAuth** (`packages/core/src/oauth.ts`).
   - `getConsent`: list workspaces where the person is admin, or a member who
     supervises at least one agent; per workspace list only agents they may
     connect; return each workspace's `allowedScopes` (ceiling) so the page can
     show what is out of reach. Pre-select `requested ∩ ceiling`.
   - `decide` and `exchangeCode`: enforce `token:connect` for the chosen agent
     (read `agent_profiles.supervisor_id`) and `scopes ⊆ ceiling(role)` on the
     server; never trust the page. Out-of-ceiling scopes → 403, not silent
     trimming.
   - `refreshGrant`: re-check that the approver is still a member with
     `token:connect` for that agent and the grant's scopes are within their
     current ceiling. If not, revoke the row (audited as the agent, like
     replay) and answer `invalid_grant`. This also closes the gap for a
     demoted admin; access tokens already expire within an hour.
3. **Token list and revoke** (`packages/core/src/index.ts`, `apps/api`).
   - `GET /api/agent-tokens?workspaceId`: admin as today; member gets only
     their own OAuth grants; guest 403. Same response schema.
   - `DELETE` and `/restore`: `token:revoke` (member: own grants only).
   - `POST /api/agent-tokens` and `/api/mcp-calls` stay admin-only.
4. **Web.**
   - Consent page: scope switches outside `allowedScopes` are disabled with
     `oauth.adminOnlyScope`; a member with nothing to connect sees
     `oauth.noSupervisedAgent` ("Ask an organization admin to make you the
     supervisor of an agent"). Keep test ids; add `oauth-scope-locked-*`.
   - MCP page: members see a "Connected apps" section (client name, agent,
     scopes, approved, last used, revoke) instead of `mcp.adminOnly`; no token
     issuing, no call log. Admin view unchanged, plus an "approved by" name on
     OAuth rows.
   - New keys in en, zh-CN and zh-HK in the same commit; check the CJK font
     subset (use characters already in it, as PR #65 did with 登记/登記).
5. **Tests.**
   - Unit: `token:connect`, `token:revoke` and ceiling matrix for admin,
     supervising member, other member, guest, agent.
   - Core integration (`oauth.integration.test.ts`): member connects a
     supervised agent and calls MCP; member + unsupervised agent → 403; member
     + `files:write` → 403; supervisor changed or member demoted to guest →
     next refresh fails and the row is revoked; member lists and revokes only
     their own grants; admin still sees all.
   - REST actor matrix (`authorization.integration.test.ts`) rows for every
     changed endpoint and role.
   - Playwright `e2e/mcp-oauth.spec.ts`: a member flow in all three locales
     (use a prototype-seed member who supervises an agent, or create one via
     the admin API in the test) and the member's "Connected apps" revoke.
     Regenerate `e2e/support/test-id-contract.md`. If the MCP page's admin view
     changes, recapture its baselines with `visual-baselines.yml` (full 40-hex
     `source_sha`), never by raising tolerance.
6. **Docs.** ADR 0023 "Role-based MCP OAuth approval" superseding ADR 0022's
   "Who may approve" bullet; README OAuth paragraph; CHANGELOG Unreleased;
   `docs/milestones/33-mcp-oauth-roles.md` (≤ 40 lines).

## Done when

Lint, typecheck, licence gate, `pnpm test`, `pnpm mcp:smoke`, the new
Playwright specs and release checklist item 8 pass locally; CI is 8/8 green;
the Today bundle stays under 200 KiB. Open a PR, drive it to green, and
report the validation numbers. Never log or commit tokens, codes or
Authorization headers.
