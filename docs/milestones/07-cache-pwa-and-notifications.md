# M7 — cache, PWA and notifications

Status: progress checkpoint; milestone acceptance remains pending.

## Implemented

Authenticated IndexedDB persistence restores task, project and calendar reads
only after a fresh session check. Identity, membership and role changes purge
protected cache state; optimistic writes are not persisted. The public-only
service worker supplies an installable manifest and a neutral offline page,
without caching authenticated HTML, API responses or queued writes.

Notification preferences and immutable daily digests use shared schemas, core
permissions and additive migrations. BullMQ scans due recipients and retries
digest generation, while recipient-only realtime delivery prevents workspace
peers from receiving private changes. The web settings and digest screens use
the real API and all three locale dictionaries. Approved font assets include
their licences and provenance in apps/web/public/fonts/README.md.

## Checkpoint evidence

Fresh checkpoint checks passed: `pnpm lint`, `pnpm typecheck` across six packages,
`pnpm test` with 389 tests in 27 files, and `pnpm build`.

| Required check | Current result |
| --- | --- |
| `pnpm lint` | 163 files passed |
| `pnpm typecheck` | Six packages passed |
| `pnpm test` | 389 tests in 27 files passed |
| `pnpm build` | Production build passed |
| `pnpm e2e` | 75 production cases passed in 4.4 minutes; 25 per locale |
| `pnpm mcp:smoke` | All 20 tools and authorization/rate-limit checks passed |
| `pnpm perf:budget` | Full Lighthouse harness unrun pending the licence decision; mobile diagnostic LCP remains over budget |

Core integration covers concurrent generation, recipient access, local dates,
clock advancement while waiting for database locks, and an actual BullMQ retry
after a committed digest. API and realtime regressions cover validation,
conflicts and recipient-only fan-out. Cache tests cover session replacement,
revocation, pending writes and persistence limits. Fifteen new browser cases
pass across en, zh-CN and zh-HK, exercising actual digest generation, preference
optimism and rollback, cache-first lists/board/calendar, session revocation,
cross-account cache rejection, public asset freshness and neutral offline
navigation. Test fixtures wait for durable writes and use a bounded Node/tsx
child process for the trusted digest helper; production clocks remain unchanged.

Six notification/digest screenshots were inspected. A separate browser probe
checked preferences, digest history/detail and the offline page in all three
locales: no console errors, untranslated keys or horizontal overflow at 393px.
The full 75-case suite subsequently passed against the production build,
including the 15 new M7 cases and all existing M1–M6 flows.

The first full run exposed a reconnect recovery bug: the same identity string
could suppress React's render after a session-map update. AppShell now subscribes
to the existing session version through React's external-store hook. The role
change/reconnect flow passes in all three locales while preserving the fresh
identity guard. Calendar gesture fixtures now take current boxes after scrolling
and wait for the existing strict lane alignment and separation invariants.

The latest production browser diagnostic measured 204,609 bytes of requested
Today JavaScript in thirteen scripts, gzipped, against a 204,800-byte budget.
The document measured 8,994 bytes gzipped. A fresh browser context per locale
used a 393×850 viewport, 150ms network latency, 1,638.4Kbps download throughput
and 4× CPU throttling. LCP was 2,104ms in en, 2,064ms in zh-CN and 2,080ms in
zh-HK, above the two-second requirement. This diagnostic does not establish a
Lighthouse score or satisfy milestone performance gates.

## Remaining acceptance and decision

Finish the cold mobile performance measurements and required budget script,
repair the LCP issue and any audit failures before declaring M7 complete or
beginning M8. The remaining 191 bytes of JavaScript headroom constrain
subsequent work. Other required checks now pass.

The proposed Lighthouse audit adds axe-core under MPL-2.0. That falls outside
the existing exceptions in docs/adr/0003-transitive-license-decision.md and
requires the requested licence decision. Its dependency, lockfile additions
and replacement performance harness are excluded from this progress commit;
the existing committed performance script remains in place until resolved.
