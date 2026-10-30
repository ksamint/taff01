# Project metadata and confirmed MCP changes (candidate, not deployed)

Owner confirmed agreed contract total, cumulative actual received amount,
progress0–100%, explicit currency. Project dueAt is nullable ISO.
Reuses contractAmount/currency and append-only project_payments; exact-cent
positive deltas, lower totals and currency changes after receipts reject.
MCP projects.create/edit only prepare proposals; signed original-agent apply
checks current projects.manage(default deny), scopes, project version/workspace,
unique controller mapping and both current human administrator authorities.
Native API project writes remain person-only; payment writes bump project version.
Existing native agent permission UI/API supports explicitly granting capability;
labels provided in en/zh-CN/zh-HK. Finance read needs current task read/write scopes
and granted capability; revocation hides figures and rejects receipt replay.

Local evidence before main reconciliation: 87 files/895 tests passed;
874 DB/Neo4j cases skipped. Six package typechecks, Biome538 files,
frozen offline install and server/runtime build passed. No .env loaded.
Added project signed/decimal/permission/MCP tests plus PG18 duplicate receipt,
ledger delta, stale version, native payment and revocation workflow (unrun).
Docker daemon unavailable; installed PG16 is not substituted for required PG18.

Release discovery: live b52866d v0.2.15; origin/main d9ded68. Released journal
already has0033_personal_default_agent; candidate receipt/audit/delivery migrations
must move after it and both feature lineages must merge before acceptance.
This checkpoint preserves work before reconciliation, not release acceptance.
No push, deployment or shared service/database change performed.
