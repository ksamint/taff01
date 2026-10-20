# 0022 — OAuth 2.1 for MCP: Taff as its own authorization server

Date: 2026-10-20. Status: accepted.

## Context

MCP clients reach `/mcp` only with a personal bearer agent token pasted into
their configuration. Claude.ai custom connectors, and other hosted clients,
cannot do that: they discover an authorization server through Protected
Resource Metadata (RFC 9728), register themselves (RFC 7591), and run the
authorization-code flow with PKCE (OAuth 2.1), as the MCP authorization
specification requires. The README listed this as an open release item that
needed an authorization-server decision.

better-auth 1.7 no longer ships its OIDC/MCP provider plugin in the core
package; the replacement is a separate package with its own client, consent
and token tables that know nothing about Taff agents, scopes or revocation.

## Decision

- **Taff is the authorization server** for its own MCP resource. The issuer
  is `AUTH_URL`; the protected resource is `AUTH_URL/mcp`. No new dependency.
- **An OAuth grant is an agent token.** Approving a client creates one
  `agent_tokens` row for a chosen agent member, workspace and scope set, the
  same as a token issued on the MCP page. Its access token is a `taff_`
  token (1 hour), stored only as a peppered hash; its refresh token is
  rotated on every use (30 days, sliding) and also stored as a hash. One row
  per grant, so the MCP page lists it, the call log attributes it, and
  revoking it there ends the grant. Expired access tokens are refused.
- **Who may approve**: a signed-in person with `token:manage` (an admin) in
  the chosen workspace, choosing one of its agents. People never receive
  OAuth tokens for themselves; MCP stays an agent surface with the agent's
  existing capabilities, grants and review rules.
- **Endpoints** (all HTTPS on `AUTH_URL`):
  - `/.well-known/oauth-protected-resource` (also `…/mcp`): RFC 9728.
  - `/.well-known/oauth-authorization-server`: RFC 8414 metadata.
  - `/oauth/authorize`: the consent page (web). Signed-out visitors see the
    normal sign-in at the same URL and continue after signing in.
  - `/api/oauth/register`: open dynamic client registration for public
    clients (`token_endpoint_auth_method: none`), HTTPS or loopback redirect
    URIs only, globally rate-limited.
  - `/api/oauth/token`: `authorization_code` (PKCE `S256` required, exact
    redirect URI, single-use code, 10 minutes) and `refresh_token`.
  - `/api/oauth/revoke`: RFC 7009.
  - `/mcp` 401 responses carry `WWW-Authenticate: Bearer resource_metadata=…`.
- **Resource indicators**: a `resource` parameter, when sent, must name
  `AUTH_URL/mcp`; tokens are only valid there anyway.
- **Routing**: the API already serves `/api/*` and `/mcp`; the web app
  forwards `/.well-known/oauth-*` to the API, so Caddy and Traefik are
  unchanged.
- Client ID Metadata Documents (CIMD) are not implemented yet: fetching
  client-supplied URLs from the server needs SSRF controls of its own.
  Claude.ai, Claude Code, Codex and the MCP Inspector all register with DCR.

## Consequences

- Additive migration 0032: `oauth_clients`, `oauth_codes`, and nullable
  `oauth_client_id`, `expires_at`, `refresh_hash`, `refresh_expires_at` on
  `agent_tokens`. Personal tokens keep `expires_at` null and never expire.
- The consent screen names the client and the host it will send the code to,
  because anyone can register a client name.
- Issuing a grant is audited as the approving person; each hourly refresh
  rotation and revocation by the client is audited as the agent.
- Registration is globally limited to 30 per minute, and token requests to 30
  per minute per client, in Valkey like the MCP limiter.
- Open: CIMD support; a per-person "connected apps" view outside the MCP page.
