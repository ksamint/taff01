# MCP personal-token organization grants — 2026-10-30 UTC

- Baseline: merged PR #80, main 749811497ce1cc053d098c61570b43101b14b2d6; existing local branch preserved.
- Added 0038 additive grant migration; existing personal-token hashes/default workspace/scopes retained; OAuth remains organization-bound.
- Per-call workspace selection resolves actual target agent/scopes; workspaces.list exposes effective grants only.
- Signed approvals resolve the verified payload workspace and recheck current authority, including receipt reconciliation.
- Management API and EN/zh-CN/zh-HK UI support organization grants; additions require both organizations' management rights; target administrators can revoke their grant.
- Target audit actor and organization log filtering retained; rate limiting remains per token.
- PR #80 review covered signed payload, current authority, version locks, receipt replay, collection locking/decimal deltas, timezone and adapters. No standalone release acceptance claimed.
- Validation: 112 test files / 1,844 tests passed against isolated local PostgreSQL18/Valkey; lint, six-package typecheck, git diff --check passed.
- Coverage includes read-only writes, forged scopes, independent revocation, concurrent organizations, unauthorized personal workspace, OAuth boundaries and approval receipt isolation.
- Pending: browser verification of the three-language grant form, full self-hosted CI/browser/image gates and production acceptance.
- Release blocked: TAFF_FULL_CI_ENABLED is absent; approved shared pool documentation confirms only constrained PostgreSQL capacity, not required Valkey/browser/image-build capacity. No gate was weakened or enabled without capacity.
- Production read-only baseline: web/API/worker b52866ddaf72b09637ca3c7db4e4c5b7a31b0a96, API healthy. No deployment or organization/token change performed.
- After full gates pass, follow docs/release-closeout.md; create APUCH/Table AI fenshen01 identities and tasks:read grants through management API without rotating original token. Do not authorize personal or future organizations.
