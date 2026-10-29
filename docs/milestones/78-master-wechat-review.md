# Private WeChat review and actor timezone (not deployed)

Base: origin/main bc01593, isolated branch codex/master-approvals-20261029.

- Context, quick entry, search today, timeline and briefing share the authenticated human/token issuer profile timezone. Stored dates/calendar zones are unchanged.
- POST /api/trusted-reviews accepts no agent-token impersonation. It requires a separate TAFF_APPROVAL_KEY signature and administrator-provisioned TAFF_WECHAT_CONTROLLERS mapping. No MCP tool can create mappings or access that key.
- Administrator verifies the private controller identity once before adding controllerId, workspaceId, userId and verifiedByUserId to that host configuration. Both the verifier's current workspace-admin authority and the mapped person's current review permission are checked on every execution and replay. Remove a mapping to revoke it.
- Signature header: x-taff-approval-signature, lowercase HMAC-SHA256 over UTF-8 JSON with recursively sorted keys, no extra whitespace, Unicode unescaped.
- Envelope: version=1, audience=taff, issuer=twin, source=private_wechat, receipt_id UUID, controller_id, workspace_id UUID, run_id UUID, expires_at ISO UTC, review (existing complete ReviewRun including explicit comments/items/checks), operation_hash.
- operation_hash is lowercase SHA256 of the same canonical JSON envelope without operation_hash. Twin must display all checks and each artifact decision before confirmation; default or inferred check approvals are forbidden.
- Receipts expire within 30 minutes. Existing human review rules and run-version checks apply. Receipt/result and all review writes commit in one transaction. Duplicates serialize on receipt ID and return the stored result; an altered receipt is rejected. An unknown HTTP outcome is reconciled by resending the identical signed envelope, never by issuing a new review.
- Migration 0033 adds an audited receipt table; no business data is rewritten. Ordinary agent permissions and tools are unchanged.
- Added signature/tamper tests, shared timezone/DST tests and DB tests for stale/expired/cross-workspace/invalid-check rejection, simultaneous duplicates and mapping/admin revocation.
- Verification: formatting and diff whitespace inspection only. Tests, types, database crash/restart rehearsal and browser workflows are NOT verified.
- Existing Silicon Valley controller does not admit ksamint/taff01 and supports PostgreSQL only; current CI also requires Valkey. No hosted fallback, runner provisioning or production mutation performed. Required CI: frozen install, lint/typecheck, pnpm test with isolated _test PostgreSQL 18, then authenticated workflows.
- Release blocked pending exact revision CI and Twin trusted executor integration. Existing hosted workflow was not dispatched. No deployed revision claimed.
