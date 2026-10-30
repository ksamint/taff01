# Local admin audit regression coverage — 2026-10-30

Continuation of milestones 36/37 and the private approval work in 78.
Checkout: `taff01-master-approvals`, base `89484b1`; existing dirty work retained.

## Verified locally

- Extended the audit privacy regression through `explainIntegrationPermission`,
  checking that grant reasons, internal permission IDs and token hashes are absent.
- The explanation reloads the token's actor with the token/workspace/member IDs;
  an unavailable actor clears scopes, permissions, grants and review policy.
- Both admin query methods call the current `workspace:manage` authorization
  dependency on each request. A denial stops all data queries and actor loading.
  These use mocked DB/auth dependencies; actual role changes remain DB-suite work.
- Targeted Vitest: 4 files / 66 tests passed (audit, approved operation,
  trusted review and API adapters), without loading `.env` or secrets.
- `pnpm --filter @taff/core typecheck` passed; Biome passed the changed test;
  `git diff --check` passed. No production implementation changes were needed.

## Handoff / remaining

Docker still cannot connect to its local daemon; installed PostgreSQL is 16.
Do not substitute it for the isolated PostgreSQL 18 transaction/migration suite.
Fresh migration 0035, audit trigger propagation/rollback, concurrency and real
authority-revocation integration checks remain unverified in this continuation.
Frontend permission center, external enforcement, Twin executor integration,
browser/performance acceptance and exact-revision release CI remain open as
described in 36/37/78. No commit, push, deploy or shared-server operation occurred.

`lean-delivery` was absent after searching installed skill directories; followed
the current orchestrate-development/Ponytail instructions. Local 1Password
preflight passed; no credentials were read.
