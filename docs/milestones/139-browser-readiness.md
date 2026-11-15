# 139 — browser readiness before PR108

Status: implemented; operator gate and publication remain required. Production stays v0.2.25 `e5a42c5`.
Base: main `455c549`; separate fix authorized by the owner on 2026-11-16 after L1 stopped for failures outside PR108.
Targets: TypeScript web cache and browser drivers; no API, schema, environment value, dependency, permission or Rust runtime change.

- Calendar traces prove React week selection preceded native SDK replacement: visibility passed on the old day event, then its geometry became null. Fresh production cases reproduced EN and zh-CN.
- The multi-day acceptance caller now waits for the existing native-view helper and scopes geometry/activation to that grid. Original 44px, stacked-row, pointer and keyboard assertions remain.
- Run start previously replaced the optimistic list ID without priming its real detail key. The live region vanished until a second read completed; no navigation or missing role attribute caused it.
- After the existing session guard, transfer provisional detail before replacing the list ID; retain authoritative detail and deny provisional control/submission. Existing rollback and optimistic cleanup remain.
- Actual QueryClient regression: RED 1 failed/2 passed; GREEN start/cache tests 21 passed, including deferred reads, preexisting authoritative detail and late identity acknowledgements.
- A controlled production browser read reproduces the baseline missing status; held-route cleanup waits for completion. The repaired keyboard/MCP flow passed all three locales in the initial combined diagnostic.
- Rapid calendar diagnostics also exposed production sign-in 429s. Calendar-only fixtures now reuse normal cookies in worker memory, bound to origin/account, with a fresh Me check and no failed-session relogin fallback.
- Fixture regression: RED observed two sign-ins instead of one; GREEN three locale cases retained the same user across fresh contexts without another sign-in. No auth policy was disabled or relaxed.
- A later 12-case production diagnostic finished 10 passed/2 overall timeouts under host load averages 39–57 on 16 CPUs; Docker API calls also timed out. The artifacts remain separate and are not a full pass.
- After Docker API/builder recovery and the one-minute host load falling to 6.93, the same 12 production cases passed in 27.8s without changing limits or assertions; the earlier saturated run remains retained.
- The older calendar accessibility 90s settings-load failure was not causally explained. Its EN/CN isolated cases passed in about three seconds; authentication rejection and host pressure are recorded separately.
- Web/SW/scripts typechecks, focused Biome and diff checks passed during implementation. The required complete gate report is bound to the final clean commit/tree in the PR body; earlier counts never transfer.
- Existing assertions, target sizes, timeouts, retries, baselines, fonts and capture matrix are unchanged. No production writes, roles, grants, tokens or messages changed.
- Specs: [client navigation](../spec/client-navigation.md) CN-2.3; [tooling](../spec/tooling.md) TT-4.3–4.4. No open implementation decision.
