# Integration permission audit (candidate, not deployed)

Signed Twin operations accept optional trace_id (32 lowercase hex), request_id,
and approval_id (bounded identifier strings). Existing callers remain compatible.
The signed receipt binds these identifiers. Receipt IDs and source are always audited.

Migration 0035 adds activity.trace_id and a workspace/trace index. A BEFORE INSERT
activity trigger merges transaction-local correlation and allowlisted current
permission snapshots into every business/receipt audit row. Arguments, credential
hashes, raw tokens, comments and artifact content are excluded from this context.
Rollback includes business writes, receipts and audit rows. Existing native
scope/capability/grant checks still authorize original-agent execution and replay.

Human review requires exactly one configured controller/workspace mapping, current
person membership, current verifier admin authority and current task review
permission. User principals cannot act through agent-kind membership.

Session-authenticated admin endpoints (workspace:manage through native can):
- GET /api/admin/integrations/permissions?workspaceId=...&tokenId=...
- GET /api/admin/audit/search?workspaceId=... (trace_id/request_id/approval_id/receipt_id filters)
- GET /api/admin/audit/trace/:trace_id?workspaceId=...
Search returns at most 200 rows and a truncated flag. Explanations expose current
native inputs; they are not grants or a claim of external central enforcement.

Validation: Biome; all six package typechecks; 296 targeted unit/API tests;
35 PostgreSQL 18 approval, token restore/revoke and OAuth integration tests.
The PostgreSQL tests used a disposable local container, including clean migrations.
The existing duplicate-review regression exposed a Date/string replay difference;
run DTO creation timestamps now serialize consistently. Receipt comparisons use
shared public schemas where those schemas deliberately strip internal fields.

Remaining: no frontend permission center, no external identity adapter or central
policy enforcement, no production migration/deployment, no historical backfill.
