# 129 — bounded browser realtime invalidation

Status: implemented for unreleased v0.2.25; full exact-source gate, PR and deployment pending. Production remains accepted v0.2.24 `ff411c6`.
Base: merged main `c49aa07763b3cc9d1123430cb60dc49ec09316f7` (PR103 operation templates and pre-release fixes); isolated branch `fix/v025-realtime-invalidation`. Both realtime commits rebased without conflicts; their behavior is unchanged.
Target: TypeScript realtime helper/tests and runtime living spec RT-3; no dependency, environment, migration, scope or tool change (38 tools).

- The failed 7c8 operator browser gate had 371 passes, 3 expected skips and one HK policy-switch failure; the focused unchanged case also failed. All previous evidence remains retained and unaccepted.
- Sanitized trace: policy revoke returned 200 in 329 ms, but the browser had already emitted 828 resource-exhaustion errors during a 2,249-request burst before policy enable.
- System-admin promotion inserts memberships across workspaces; each same-user event invalidated all active families. Default query restart did not cancel the underlying fetches, whose query functions do not consume the abort signal.
- RED regression using real QueryClient/QueryObservers: 317 member-insert events started 317 reads per family, 2,219 total across seven families. Four new tests failed before the helper change; the existing 11 cases passed.
- Ordinary refreshes now use one in-flight batch with cancelRefetch:false. Events received during it leave one dirty trailing refresh; joining older active reads also requires a trailing refresh for current data. No debounce timer or arbitrary delay.
- Immediate authentication revocation, first-open Me revalidation/stale-only family marking, reconnects, mutation deferral and cleanup retain their behavior. Stopping or revoking clears queued work without waiting for ordinary refreshes.
- Focused validation: frozen install passed without lockfile drift; 38 unit tests passed across realtime/session-cache/cache-persistence (19 realtime cases, including eight actual-read cases). Web and scripts TypeScript checks, changed-file Biome and git diff --check passed. No service or browser execution.
- Spec review follow-up: first-open stale marking during a mutation previously queued an unwanted later read. Actual-observer RED reproduced it; marking now bypasses ordinary queue state, with separate GREEN coverage that already-queued reconnect work is retained. RT-3.3 clarifies both guarantees.
- After the c49 rebase, focused 38 tests/three files, web/scripts types and changed-file lint passed again. Summary-model generator tests: 10 passed; all source-owned TS parity/schema generators and test-ID generation produced no tracked drift. The wrapper's nested tsx IPC was sandbox-blocked; identical generators passed through node --import tsx. New exact-source full gate remains pending; prior-source gate evidence is not transferred.
- The trace establishes amplification and preceding browser exhaustion; the later client scheduling gap was not CPU-profiled. The separate earlier PNG assertion remains unexplained; no test timeout, retry, baseline or tolerance changed.
- Parent owns review, full gate on the exact commit, first push/PR/merge, ancestry verification and direct deployment of that validated commit. No services, DB, browser, shared Rust target, production action, push or PR was run here.
- Open implementation decisions: none. [Runtime spec](../spec/runtime.md) records the behavior; [release closeout](../release-closeout.md) remains authoritative for acceptance.
