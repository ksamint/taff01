# 32 — OAuth 2.1 for MCP (2026-10-20)

## Working

- Claude.ai custom connectors (and Claude Code, Codex, MCP Inspector) connect
  to `AUTH_URL/mcp` with only the URL: a 401 names the protected-resource
  metadata, the client registers (RFC 7591), sends an admin to
  `/oauth/authorize`, and redeems a PKCE code for an hourly access token and a
  rotating 30-day refresh token (ADR 0022).
- The consent page (en, zh-CN, zh-HK) shows the client and its redirect host,
  works from a signed-out start, and lets an admin pick organization, agent
  and scopes. Unknown clients or redirect URIs show an error, never redirect.
- A grant is an agent token: listed on the MCP page under the client's name,
  logged in the call log, revoked there or by RFC 7009.
- Code replay ends the grant; refresh tokens work once; expired access tokens,
  demoted approvers and foreign clients are refused.

## Missing

- Client ID Metadata Documents (CIMD); a per-person connected-apps view.
- MCP page screenshots must be re-captured (hint text changed).

## Open decisions

- Should non-admin members connect their own clients to an agent?

## Validation

lint ✓ · typecheck 6/6 ✓ · licence ✓ · Vitest 103 files / 1716 tests ✓ ·
Today 192.4 KiB ✓ · mcp:smoke incl. official-client OAuth flow ✓ ·
Playwright (local Chromium 1194) mcp-oauth, mcp, agent-creation, i18n 21/21 ✓ ·
release checklist item 8 incl. OAuth via web proxy 4/4 ✓
