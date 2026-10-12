# Relationships and M9 deployment — 2026-10-12

The user requested Neo4j relationships and data visualization on ins-aj5kmjag, retained PostgreSQL on ins-nx2vm7pc as the main database, and authorized deployment of the latest M9 to taff.apuch.cn.

## Implemented source

PostgreSQL remains the only business-write database. Neo4j receives atomic, workspace-keyed projections of existing projects, tasks, people and agents, with project/parent/owner/worker edges. Worker startup, coalesced change notifications, reconnect and periodic reconciliation repair the graph. The authenticated read adapter applies existing workspace permissions and withholds stale/corrupt data by checking PostgreSQL and graph fingerprints. Over 500 nodes is an explicit too_large state.

Me → Advanced → Relationships opens an accessible focused SVG diagram, node search, paging and full-label relationship links. All three locales are included. No new client dependency or existing prototype baseline change is intended. The official server driver is neo4j-driver 6.2.0 (Apache-2.0), documented in ADR 0014.

The existing Neo4j service was inspected without restart. Verified TLS uses neo4j01.internal.apuch.art at10.206.103.5:7687 and the same CA as PostgreSQL. A separate Taff login was provisioned and successfully authenticated over verified TLS; its secret remains private. This Community service uses application namespace isolation, not Enterprise label-level RBAC. PostgreSQL’s existing database, role and verified connection remain unchanged.

## Validation before integration

Core/API/worker and web typechecks pass. Focused backend/worker/API tests pass61cases; i18n/realtime tests pass11cases. Initial graph browser checks pass6cases across all locales, with inspected English/HK phone renders. An enhanced keyboard/403 retry was stopped when the local API stopped responding; these enhanced cases and corrected PostgreSQL integration tests await isolated QA. Real Neo4j tests are mandatory in CI through a separate pinned Neo4j service, not the production graph.

## Isolated integration evidence

Source `e093bcdabc9040f141839713a99436b688066cc3` passed 531 unit/integration tests, including real Neo4j replacement, deletion and workspace isolation, on fresh isolated PostgreSQL/Valkey/Neo4j. The only failure was a Compose assertion expecting host mappings in a particular array order; it now checks the same exact mappings after sorting, preserving the private routing assertions.

The real API/worker/browser flow created a synthetic project, agent, parent task and child task. Five nodes and seven edges covered all four relationship kinds. A PostgreSQL title edit appeared through the actual Neo4j read in **295 ms**. No graph response was intercepted; a foreign account received403 and there were zero browser page errors. All six phone/desktop locale captures were inspected and retained privately. The first capture helper supplied an incomplete profile body and was corrected to preserve the required time zone. A first Neo4j harness without a network exited during startup; its preserved second attempt on the isolated QA network booted successfully. Neither production database was restarted or seeded.

Visual inspection found an 11px SVG node-kind label; the source now uses the documented 12px floor, with a computed-font browser assertion. Final-source captures and all-nine validation remain required after this correction. Existing prototype baselines stay intact.

## Final-source retry

Source `58e960c` passed all 532 CI unit/integration tests. Its English Lighthouse score was 89 against the unchanged minimum of 90 (CN95/HK96); English LCP was 1458ms and total blocking time436ms. Graph schemas now use their explicit subpath instead of loading through the general schema barrel. The isolated CI Neo4j service stops after its mandatory integration tests, before frontend performance probes, matching the dedicated production topology. These changes require fresh acceptance.

The first server gate failed with `EAI_AGAIN` because the harness attached its graph network after startup. A fresh retry harness verifies the owned Neo4j service and its network before starting the gate; the failed attempt is retained as evidence.

The `f559ea2` retry passed532 unit/integration tests and all six relationship browser checks. CI Lighthouse scored98/98/98; isolated Lighthouse99/99/99 and mobile LCP552/624/620ms. Both runs exposed the existing Calendar test assumption that four weekly occurrences always fit the current month: on October12 the fourth is November2. A first fixed-clock retry (`456c13b`) broke Calendar setup and was rejected. The test now verifies all four recurrences over their full API range and exactly those inside the rendered month, retaining the drag, cancellation, resize and navigation assertions. Application behavior is unchanged; the corrected exact source requires a fresh gate.

## Acceptance remaining

Fresh isolated PostgreSQL/Valkey/Neo4j integration, actual graph projection and three-locale screenshots, final all-nine validation with strict all-locale performance checks, exact-source feature/main CI, locked backups/build/migration/scoped API-worker-web replacement, public login/task edit/relationship view and revocation checks. Keep all neighboring services, Caddy, Valkey, PostgreSQL and Neo4j identities/start times intact. No production seed, SMS send or database replacement is authorized by the validation harness. Final source and runtime evidence will be recorded in the PR/deployment checkpoint after the checks complete.
