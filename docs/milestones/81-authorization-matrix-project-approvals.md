# 81 — Authorization matrix: project preparation and signed approvals

- Fixed the two inventory failures from CI run 41006152025 (1492 passed, 2 failed, 1 skipped).
- MCP inventory includes projects.create/edit; SDK smoke verifies confirmation preparation leaves project count/version unchanged and restores its temporary capability.
- REST inventory now covers all four signed apply/status routes and three admin audit/integration read routes.
- Real authorization cases cover owner/member/foreign workspace, original-agent token, read-only/revoked token, invalid HMAC, revoked capability, revoked controller mapping/verifier and lost admin role.
- Both signed apply and receipt/status paths recheck revoked authority; unsigned human cookies cannot substitute for the original agent token.
- Runtime source is unchanged; existing signature failures correctly remain HTTP 401 unauthorized.

Validation:
- Full authorization file: 715/715 passed on local PostgreSQL 16.15 (17.04 s).
- Core/API typecheck passed; both changed TypeScript files pass Biome; git diff --check passed.
- Durable logs: /Users/af/cpro01/0thebrain01/fenshens01/acceptance-20261030/taff-authorization-matrix-fw8fes/.
- Task-owned Docker container cleanup completed; no daemon or shared server changes.

Remaining:
- Actual pinned PostgreSQL 18.6 CI on the new commit is required; local PostgreSQL 16 evidence does not replace it.
- No new product decisions or runtime changes.
