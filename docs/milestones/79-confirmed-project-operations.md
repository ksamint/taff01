# Confirmed project operations — integrated candidate, not deployed

Owner confirmed agreed contract total, cumulative actual received amount,
progress0–100%, explicit currency. Project dueAt is nullable ISO.
Reuses contractAmount/currency and append-only project_payments; exact-cent
positive deltas, lower totals and currency changes after receipts reject.
MCP projects.create/edit only prepare; tool/arguments/expected_version returned.
Signed apply checks original token, projects.manage(default deny), scopes,
workspace/version, unique controller mapping and both current human admins.
Native project/milestone API writes remain person-only; payment writes bump
project version. projects.list includes workspaceId/version/dueAt/progress;
financial values appear only with current explicit capability+task read/write
scopes. Revocation hides figures and rejects receipt/status replay.
Existing agent profile UI/API grants projects.manage, with all3 locale labels.
Provision only intended existing agent, retain controller/verifier admin roles;
no capability, token or controller configuration changed by this work.

Integrated latest origin/main d9ded68 into candidate checkpoint55ebfd4.
Preserved released0033_personal_default_agent SQL byte-for-byte (SHA256
93fcf77bf4ef70e4ea99b95c7be4f00029d71acd947d0f2d4119a452a4236f8d).
Pending migrations now0034trustedreview/0035approvedagent/0036audit/0037delivery.
A regression checks released hash and sequential appended migration journal.

Local: full89files/897tests passed,877DB/Neo4j tests skipped. Six package
checks, Biome543files, frozen offline install, licence and server/runtime build
passed; final currency-required change passed7 targeted tests and types.
PG18 regression source covers duplicate receipt concurrency, receipt-failure
rollback of project/payment/version, stale native payment and revoked capability.
Docker unavailable; installedPG16 not substituted. DB tests are NOT accepted.
Expanded selfhosted approval-checks.yml to all core/schema/db/API suites with
PG18 and pipefail; no release8/8/production acceptance gate changed.
No .env loaded, push, deployment or shared service/database mutation performed.
