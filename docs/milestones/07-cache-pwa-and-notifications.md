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

Core integration covers concurrent generation, recipient access, local dates,
clock advancement while waiting for database locks, and an actual BullMQ retry
after a committed digest. API and realtime regressions cover validation,
conflicts and recipient-only fan-out. Cache tests cover session replacement,
revocation, pending writes and persistence limits. Fifteen new browser cases
are authored across en, zh-CN and zh-HK; their execution remains pending.

The latest production browser diagnostic measured 204,600 bytes of requested
Today JavaScript, gzipped, against a 204,800-byte budget. Its emulated mobile
LCP was about 2.1 seconds, above the two-second requirement. This diagnostic
does not establish a Lighthouse score or satisfy milestone performance gates.

## Remaining acceptance and decision

Run the full browser suite, finish the cold mobile performance measurements,
repair any failures, and record all required milestone checks before declaring
M7 complete or beginning M8. The small remaining JavaScript headroom remains
a constraint on subsequent work.

The proposed Lighthouse audit adds axe-core under MPL-2.0. That falls outside
the existing exceptions in docs/adr/0003-transitive-license-decision.md and
requires the requested licence decision. Its dependency, lockfile additions
and replacement performance harness are excluded from this progress commit;
the existing committed performance script remains in place until resolved.
