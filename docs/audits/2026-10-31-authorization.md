# Authorization and OAuth audit

Baseline: `55718da1637ef92c76b72e1c80f1b531aa9f6a64`. Changes and checks were performed locally against isolated PostgreSQL/Valkey; no production credentials were read.

## Corrected findings

- **Unproved authorization-code replay could revoke a live grant.** Client identity, exact redirect URI and PKCE proof now validate before replay revocation. Wrong proof/client/redirect leaves the grant usable. Valid concurrent replay also revokes the winning grant, consistently with sequential replay.
- **OAuth issuance could race supervision removal.** Approve now uses the mutation transaction. Approve, exchange, refresh and member restore hold the supervision row stable through their authorization decision and write. Deterministic tests hold a pending supervision removal and observe actual database blocking before verifying rejection after removal commits.
- **Signed mutations could race permission revocation, including a newly inserted deny replacing an implicit allow.** Agent transactions lock their existing member row before task/resource locks; profile, permission and grant writers take the conflicting member lock first. This serializes absent permission rows without a new lock service. A revocation waits for an already-authorized mutation to commit, then execution and receipt reconciliation reject that capability. Human review supervision is also locked through review/reconciliation. Autocommit agent member reads do not acquire a useless transient shared lock.
- **Reusing a stolen refresh credential did not terminate its descendants.** Additive migration `0039_oauth_refresh_history` stores only peppered consumed hashes associated with the existing grant ID. Rotation and history insertion commit together. Reuse by the original registered client revokes the same grant; a different registered client cannot use the history to revoke it. The losing concurrent rotation commits revocation before returning `invalid_grant`, so the successful response's access/refresh credentials are unusable afterward.

## Validation evidence

- OAuth + agent-token integration suites after refresh-history changes: **31/31 passed**.
- Earlier authorization matrix + OAuth + agent-token + run suites after per-agent serialization: **773/773 passed**. The final integrated suite must supersede this result after subsequent lifecycle changes.
- Core typecheck and changed-file Biome checks passed after refresh-history changes.
- Refresh tests verify wrong-client isolation, ancestor reuse, descendant invalidation, audited non-person revocation that cannot be restored through person undo, hashed-only history, and concurrent reuse. Code-exchange tests force both requests to observe an unused code before claiming it.
- Equivalent workspace-discovery test, fresh isolated database per revision: baseline **10 → 90 SQL statements** after adding 40 unrelated organizations (expected regression assertion failure); candidate **11 → 11** (pass). See `2026-10-31-workspace-query-counts.json`.

## Compatibility and operational limits

The additive history table preserves token IDs, token keys, grants, scopes and default workspace bindings. History begins with rotations performed by the upgraded code; consumed hashes discarded before upgrade cannot be recovered. History is retained until its token is deleted, when the foreign key cascades it away. Clients must serialize refresh attempts: valid credential reuse, including a duplicate after a lost successful response, now deliberately ends the grant and requires reauthorization.

The exploratory MCP run completed 21,600 calls without errors, but four p95 comparison cells exceeded the 10% threshold amid nonstationary host load. It is not release acceptance. Its complete samples and aggregate results are retained separately; final runtime measurements and the final 15-minute soak must be evaluated independently.
