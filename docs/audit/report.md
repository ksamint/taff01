# Taff internal architecture review

Internal repository artifact only. No route or deployed page was added. Source snapshot: `55718da1637ef92c76b72e1c80f1b531aa9f6a64`, branch `fix/audit-stability-20261031`, dirty working tree. Generated 2026-10-31T07:26:02Z. `snapshot.json` records source, CSV and working-diff SHA-256 digests; this is not final-release acceptance.

## Scope and reproduction

The owner preconfirmed API, Web and worker as runtime services; core, db and schemas are shared packages, represented as inventory modules so their policy/data boundaries remain visible. `deploy/` is build/deployment configuration, not an independently running service. Explicit `--services` prevents Compose build-context detection from misclassifying it.

```sh
PYTHONHASHSEED=0 python3 /Users/af/.codex/skills/repo-architecture-audit/scripts/audit.py . \
  --out docs/audit --project-name "Taff internal architecture audit" \
  --services api=apps/api,web=apps/web,worker=apps/worker,core=packages/core,db=packages/db,schemas=packages/schemas \
  --service-alias "core=@taff/core,db=@taff/db,schemas=@taff/schemas"
python3 docs/audit/verify.py
```

Local patterns recognize Hono calls (including templates retained verbatim), Drizzle tables/columns, queue processors/scheduler/job names, requireMember/can/session points, shared mutation context, SQL activity/NOTIFY and trigger registrations. No bundled extractor was changed; subsequent reviewed application fixes are recorded below. `.local`, hidden directories, secrets, credentials, build outputs and DB snapshot metadata are excluded. Six explicit module roots also exclude operator files outside apps/packages.

## Stage 0 and service cards

| Module | Kind | Framework hints | Scanned/skipped | Routes | Models | Permissions | Audit | Boundaries |
|---|---|---|---:|---:|---:|---:|---:|---:|
| api (`apps/api`, cli) | runtime | hono | 30/15 | 134 | 0 | 111 | 4 | 31 |
| web (`apps/web`, cli) | runtime | nextjs, nextjs_app | 180/87 | 25 | 0 | 0 | 0 | 117 |
| worker (`apps/worker`, cli) | runtime | bullmq | 3/3 | 3 | 0 | 0 | 4 | 6 |
| core (`packages/core`, cli) | shared package | bullmq, drizzle | 87/49 | 0 | 0 | 198 | 83 | 65 |
| db (`packages/db`, cli) | shared package | drizzle | 48/6 | 0 | 880 | 0 | 55 | 0 |
| schemas (`packages/schemas`, cli) | shared package | none detected | 32/12 | 0 | 0 | 0 | 0 | 0 |

All six use CLI detection. Version values and skip reasons are in `manifest.json`; shared core/schemas having no declared routes or persisted models is expected, and API/Web/worker delegate storage to db rather than declaring tables. A framework hint is a text match, not dependency validation.

- **api**: 0 pages, 134 API registrations, 0 job registrations; audit mechanisms {'audit_table': 1, 'logger': 3}; outgoing kinds {'shared_lib': 28, 'http': 3}; responsibility is not in inventory. Skips: {'test_file_counted_not_extracted': 12, 'unsupported_ext': 3}.
- **web**: 22 pages, 3 API registrations, 0 job registrations; audit mechanisms {}; outgoing kinds {'http': 3, 'shared_lib': 114}; responsibility is not in inventory. Skips: {'unsupported_ext': 38, 'test_file_counted_not_extracted': 29, 'excluded_glob': 20}.
- **worker**: 0 pages, 0 API registrations, 3 job registrations; audit mechanisms {'logger': 4}; outgoing kinds {'shared_lib': 3, 'mq': 3}; responsibility is not in inventory. Skips: {'unsupported_ext': 2, 'test_file_counted_not_extracted': 1}.
- **core**: 0 pages, 0 API registrations, 0 job registrations; audit mechanisms {'event': 83}; outgoing kinds {'shared_lib': 63, 'http': 2}; responsibility is not in inventory. Skips: {'test_file_counted_not_extracted': 45, 'excluded_glob': 2, 'unsupported_ext': 2}.
- **db**: 0 pages, 0 API registrations, 0 job registrations; audit mechanisms {'audit_table': 50, 'event': 5}; outgoing kinds {}; responsibility is not in inventory. Skips: {'test_file_counted_not_extracted': 4, 'unsupported_ext': 2}.
- **schemas**: 0 pages, 0 API registrations, 0 job registrations; audit mechanisms {}; outgoing kinds {}; responsibility is not in inventory. Skips: {'test_file_counted_not_extracted': 10, 'unsupported_ext': 2}.

There are 49 Drizzle table declarations plus 49 historical CREATE TABLE records, not 98 independent live tables. Migration ALTER statements, spread `dates` fields, multi-line defaults/FKs and enum type helpers are incomplete in this regex field inventory. Migration history is not a reconstructed current schema.

## Stage 2: boundary and policy reconciliation

CSV facts: 114 derived links are all `api_api` heuristic links; there are no proven `page_api` or `api_table` links. The web request wrapper is now recognized, but helper-file calls are mislabeled api_api by the generic linker; these must not be read as runtime service RPCs. Full page→hook→request→adapter→core→table closure is not established by the extractor. Nine boundary rows retain low confidence.

Source-reviewed module boundaries (supplementary evidence, not fabricated CSV relations):

| Flow | Evidence | Result / limitation |
|---|---|---|
| Web → API | apps/web/src/lib/api.ts; request literals in mutations/tasks.ts:146,181,214; cross_calls shared schemas imports | Cache/UI and request serialization stay in Web; wrapper indirection prevents complete page attribution. |
| REST/MCP → core | apps/api/src/app.ts:122-190,330-348,608-609,939-942; cross_calls API → core | Session and token authentication are inherited from middleware/body; core authorizes resource actions. |
| Core → db | packages/core/src/index.ts:406-435; permissions.csv requireMember/can; cross_calls core → db | Shared mutation opens one transaction and sets actor context; requireMember delegates to can. |
| Core writes → activity/NOTIFY | audit_points db SQL activity/notify/trigger rows; 0001_transactional_audit.sql:13-31; later replacement 0016_notification_audit.sql:2-32 | Triggers record activity within the database transaction; adapter-local logger absence is not an audit gap. |
| Digest scan → jobs → core | routes worker index.ts:43,50; digests.ts:15; cross_calls queue names at index.ts:39, digests.ts:35 | Queue taff and job daily-digest share one worker. No topic-to-consumer map is inferred; job data uses digestJobSchema. |

Permission matrix is visible in offline index.html from permissions.csv; literal action recognizers improve inventory but do not prove role-by-operation coverage. `userPrincipal` and words containing auth/permission are lexical guard hints, not policy proofs. The source checks below explain the false positives instead of inflating security findings.

## Stage 3: reviewed decisions

**D1 [scoped observation] Registered-client and authorization-code metadata use a narrower auth-infrastructure audit scope than business mutations.** Evidence: P1-1 `POST /api/oauth/register` (`routes|api|apps/api/src/oauth.ts|84`) and `POST /api/oauth/consent` (`routes|api|apps/api/src/oauth.ts|161`); `packages/core/src/oauth.ts:137-168` inserts oauth_clients directly, while `:309-331` inserts oauth_codes in mutation. `packages/db/migrations/0032_mcp_oauth.sql:2-37` declares both tables with no taff_audit_change registration; an all-migrations search found no audit trigger for either. The standing rule in instruction_v0 requires every mutation to write activity and NOTIFY. This is a scoped auth-infrastructure observation, not a confirmed business-transaction defect or a new release blocker; ADR 0022 intentionally defines public registration and the product scope distinguishes grants from protocol metadata. Registration is deliberately public/rate-limited under ADR 0022; exchange, refresh and revoke mutate audited agent_tokens. Options: A add a safe system-actor activity event for registration and actor-attributed code approval (no raw code/token/hash); B explicitly document ephemeral protocol-table exceptions and separately audit consent; C accept the narrow gap with owner signoff. Avoid blindly adding the existing trigger: public registration lacks user/workspace actor context. No app change made.

**D2 [P2, S] Internal audit exclusion should be explicit at the Docker context boundary.** At inspection `.dockerignore` omitted docs/audit and both deploy/Dockerfile.web:13 and Dockerfile.server:14 used COPY . . into build stages. Runtime copy lists are narrow; no public route or runtime publication was observed. Parent owns the small ignore-rule repair; recheck final diff.

**D3 [P2, S] Field duration_ms uses different integer widths by meaning.** P1-2 `duration_ms#type`: mcp_calls uses integer (`packages/db/src/schema.ts:518`), runs/run_events use bigint (`:617,:663`). This is a real declared-type difference, not a verified runtime defect. Keep distinct meanings or document them; widen MCP only if its duration contract requires bigint. No schema migration justified by this scan alone.

Reviewed false positives are retained in `annotations.json` and suppressed in priorities.csv: all 28 raw P0 candidates have explicit authentication wiring or are GET-only Next content routes. CRM/mind/timeline/suggestion audit warnings come from adapter-local-only analysis despite core mutation + SQL triggers. `/api/ask` is a read query expressed as POST. `amount` numeric/numeric(14,2) and revoked_at timestamp/timestamptz are ORM/SQL spelling loss, not established drift. Low-confidence self smoke URLs, service worker requests, locale fetches, in-process MCP fetch and local queue names are not unknown deployed services. Remaining unresolved input expressions are candidates only.

## Validation and limits

- `verify.py` asserts module map, all emitted file:line references, excluded paths, all 49 Drizzle declarations, three queue entry registrations, SQL trigger recognition and INTERNAL/noindex HTML.
- `snapshot.json` pins evidence-source hashes and the current tracked apps/packages diff digest. Two consecutive extractor runs with PYTHONHASHSEED=0 produced identical digests for all eight CSVs (`idempotence.json`). The bundled extractor iterates guard-name sets without a tie-breaker, so a fixed Python hash seed is necessary for stable row order. This is a dirty working-tree snapshot, not final release-SHA acceptance.
- Regex extraction cannot compose inherited Hono middleware, expand loop path values, trace imported helpers/closures, infer runtime roles, prove transaction coverage, reconstruct ALTER history or join queue producers/consumers semantically. The three phone-auth registrations in a loop are missed; CRM template registrations are retained with ${path}, not expanded. No secrets or .local data were read.
- Inventory extraction used no credentials, production, runtime DB, integration tests, deployment or browser QA; subsequent archive-fix tests used the owned local integration fixture. Root agent owns functional/security tests and final integration. Offline page was checked structurally; its chart layout has not been visually inspected.

Final implementation review found and fixed an archive race: every shared-core mutation now takes a shared transaction lifecycle advisory lock at entry; archive takes the exclusive variant before any resource locks. This closes stale archive state and concurrent role-demotion authorization without task/workspace lock inversion. Tradeoff: rare archive operations briefly wait for and pause mutations across organizations; external AI/mail delivery remains outside this wrapper. Deterministic PostgreSQL blocking regressions failed twice before the patch, then workspace lifecycle/concurrency9/9 and archive+authorization732/732 passed. The added agent-member read lock is transaction-only; autocommit reads do not retain a useless added lock.

The 49-table inventory now includes oauth_refresh_history (migration0039), the consumed-refresh lineage ledger supporting replay revocation of the current token family. This is auth protocol metadata; business audit coverage is not inferred from its presence.

Post-timeout refresh: runtime core uses a20-second default SQL statement timeout; explicit URL settings retain driver precedence and raw migration connections retain their existing behavior. Benchmark/fault harness source files mcp-benchmark.mts and runtime-faults.mts are excluded as nonruntime verification harnesses so their evolving fixture code does not become a service-boundary claim. Two seeded CSV runs remained identical after this refresh.
