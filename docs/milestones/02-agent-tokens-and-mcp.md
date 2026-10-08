# Milestone 02 — Agent tokens and MCP (2026-10-08)

## What works

- **Principals.** Core now takes a principal: a signed-in person or an agent
  acting through a token. People and agents go through the same core
  functions; agents carry their token's scopes into `can()`.
- **Agent tokens.** Workspace admins issue tokens for agent members with a
  name and scopes (`tasks:read`, `tasks:write`, `calendar:write`,
  `inbox:review`). Only `sha256(token + TOKEN_PEPPER)` and a display prefix are
  stored; the raw token is returned once. Revocation is immediate; `last used`
  comes from the call log, so authenticating a token writes nothing.
- **`/mcp`.** Streamable HTTP on `@modelcontextprotocol/server` 2.3 (spec
  2026-07-28), one server instance per request bound to the token's agent and
  workspace. Tools: `tasks.list`, `tasks.create`, `tasks.update`,
  `calendar.schedule`, `inbox.request_review`. Arguments are the shared
  zod/mini schemas, wrapped with a JSON Schema converter for the SDK. Tool
  errors come back as `isError` results with the core error code.
- **Rate limit and log.** Fixed one-minute windows per token in Valkey
  (`MCP_RATE_LIMIT`, default 60); every call is logged to `mcp_calls` with
  method, tool, status (`ok`, `error`, `denied`, `rate_limited`) and duration.
- **Permissions.** New rules with table-driven tests: agents need the scope
  for each action, may only start or submit their own tasks (`in_progress`,
  `needs_review`), may take or release a task but never hand it to someone
  else, never mark work done, never review and never manage tokens. People:
  owners and admins assign, schedule and review; owners, admins and the
  current worker move status short of `done`.
- **REST.** `PATCH /api/tasks/:id/status`, `PATCH /api/tasks/:id/schedule`,
  `GET/POST /api/agent-tokens`, `DELETE /api/agent-tokens/:id`,
  `GET /api/mcp-calls`. The web origin proxies `/mcp` to the API.
- **MCP page** (`/me/mcp`, linked from Me): endpoint URL, token creation with
  agent and scopes, show-once token with copy and a client configuration
  snippet, token list with last use and two-step revoke, call log.
- `pnpm mcp:smoke`: the official v2 client lists the tools, calls each one,
  checks a denied reassignment, drives the rate limit to 429, revokes the token
  and checks the log.

## Validation evidence

| Check | Result |
| --- | --- |
| `pnpm lint`, `pnpm typecheck` | Passed |
| `pnpm test` | 67 passed: permission table, schema boundaries, API adapter (MCP auth and rate limit), PostgreSQL 18 integration incl. token issue/authenticate/scope/revoke |
| `pnpm mcp:smoke` | 11 checks passed against the local API and Valkey-compatible server |
| `pnpm e2e` | 12 passed: four flows × en, zh-CN, zh-HK (Playwright 1.56 shim) |
| `pnpm build`, `pnpm perf:budget` | Passed; Today stays under 200 KiB |

## Missing

- `files.attach` waits for run artifacts (M3). OAuth 2.1 metadata for `/mcp`
  arrives with M8; personal access tokens are the only credential for now.
- The MCP page has no undo after revoke; the prototype's undo needs a grace
  period that would keep a revoked token valid, which the security rules
  reject. Confirm-then-revoke stays.
- Per-client scopes beyond tokens, webhooks and the searchable call log are
  P3 items in the prototype audit.

## Open decisions

- BullMQ's PostgreSQL backend (ADR to come) is unaffected by this milestone;
  the rate limiter is the only Valkey dependency besides the queue.
