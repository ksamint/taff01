# M9 — hardening and handoff (in progress)

## Lighthouse and production API checkpoint — 2026-10-09

`pnpm perf:lighthouse` audits a real signed-in Today page with 20 tasks in
English, Simplified Chinese and Traditional Chinese (Hong Kong). It owns the
production API and web processes, rejects occupied ports, preserves the signed-in
session and stored locale, and clears HTTP/IndexedDB/service-worker caches before
each mobile audit. It fails when any required category scores below 90.
Reports omit transport headers and redact credentials before CI uploads them.

Lighthouse 13.5.0 is an Apache-2.0 development dependency. Its axe-core 4.14.0
dependency is the approved development-only MPL-2.0 exception in ADR 0003.
Production server dependencies are prepared under `dist/runtime/{api,worker}`;
the build rejects audit tools in these trees. Docker consumes the same trees.
The Docker build context excludes local dependencies, output and environment files.

The bundled API previously failed to start in main's CI because its external
dependencies could not resolve from `dist/server`. CI's MCP smoke check now starts
the runnable production API and checks that the owned process stays alive.

## Local validation

| Check | Evidence |
| --- | --- |
| Lint and workspace type checking | Passed |
| Licence gate | Passed; axe-core is the documented exception |
| Vitest | 400 passed across 31 files; includes schema leaves, locale persistence/parity and external-database/TLS/isolation regressions |
| Web and server builds | Passed; API and worker production dependency trees prepared |
| Today JavaScript budget | 199,050 gzip bytes / 204,800 limit |
| Lighthouse en, actual mobile throttling | Performance 93, accessibility 96, best practices 100 |
| Lighthouse zh-CN, actual mobile throttling | Performance 90, accessibility 96, best practices 100 |
| Lighthouse zh-HK, actual mobile throttling | Performance 91, accessibility 96, best practices 100 |
| Audit script type checking and report credential assertions | Passed |
| Playwright, all three locales | 78 passed (6.0 minutes), 26 per locale; all corrected locale, digest, cache and calendar flows passed without retries |
| MCP smoke against the production API | Passed; every tool, rate limiting, revocation and call logging |
| Docker API image | Local build blocked before execution by Docker Hub's TLS certificate mismatch |
| GitHub Actions and report upload | Run 37881130403 built all three images and passed lint, types, licences, unit tests, builds and the bundle budget, but Lighthouse performance 89/87/88 failed. The current startup changes pass local Lighthouse 93/90/91; new CI is pending. |

Lighthouse now uses its supported DevTools throttling method with unchanged
mobile network and CPU settings. The earlier unthrottled gather and simulated
4G prediction chose optional downloaded fonts differently across Mac and Linux;
actual throttling lets Chrome apply the real font download deadline. The score
thresholds, cold-cache setup, signed-in checks and locale checks are unchanged.

The failed Chinese calendar trace shows Schedule-X's 300 ms range-change
animation moving the event after the test captured its coordinates; the press
selected day-number text instead of starting a drag. The desktop month fixture
now uses locator hover to wait for
stable geometry before pressing, retaining the native gesture, single-write,
recurrence and deadline assertions. The full corrected local suite passed;
remote CI remains the deployment gate.

## Today startup and private PostgreSQL TLS checkpoint — 2026-10-09

Today now imports actual schema leaves for its reads, mutations, session and
change events. Root exports retain the same validator objects; non-Today
feature modules remain lazy. Query keys, validation and private cache guards
are unchanged. Tests assert leaf identity and strict input validation.

The server reads an allowlisted presentation-only `taff-locale` cookie and
renders the document language and stored dictionary before JavaScript. Other
locale dictionaries, including English, load on demand. All three dictionaries
have identical key sets; the two Chinese dictionaries include the unused
singular review-count alias for exact parity. The current dictionary avoids a
competing JSON preload; older browser-only locale preferences and workspace
reads retain their preloads. `/api/me` remains fresh and authorizes private
reads. Cookie persistence, blocked-storage behavior, stale locale requests and
English switching have regression coverage. The loader is installed before
child rendering: react-i18next snapshots language methods during render, so
a passive-effect installation could bypass dictionary loading. Cleanup cancels
in-flight resource requests while retaining a stable method for those snapshots. Browser checks also verify that
copying only the locale cookie never authenticates a session.

The latest three-run LCP medians are **en 1,844 ms, zh-CN 2,020 ms and zh-HK
2,032 ms**, with 20 cards in every run. Step 2 is not accepted yet. Existing
resource logs show the 166 KiB optional CJK font starting around 530 ms in
Chinese versus 1,431 ms in English, overlapping critical JavaScript downloads.
Font/network competition is the remaining hypothesis; no performance threshold
has been relaxed. A transient local audit stall did not reproduce; the latest
full Lighthouse run passed all three locales. Audit failures now print only a
phase and error class, and presentation cookie values cannot corrupt report
field names during credential redaction.

The external database URL now uses its certificate DNS name,
`postgres01.internal.apuch.art`, mapped to private `10.206.103.13` in the
migrator, API and worker. This preserves verified TLS identity with the installed
Postgres.js client; its IP-literal connection path does not send a TLS server
name. The Compose regression checks these mappings and the read-only CA mount.
Production provisioning and the new DNS route remain pending successful CI.
The expanded browser run exposed locale-switch regressions and clock/Origin
fixture assumptions; the corrected full suite passed 78/78, and MCP smoke passed against the healthy
production API. All nine required validation commands passed before this push. Auth fixtures now
provide the trusted Origin when a presentation cookie survives logout, wait
for the browser time-zone save, and generate future digests after the latest
configured daily slot. The production clock and origin enforcement are unchanged.

CI run [37885596403](https://github.com/ksamint/taff01/actions/runs/37885596403)
passed Lighthouse, all three Docker builds and 77/78 browser checks. The remaining
Chinese board-drag test read the optimistic destination before the server commit:
its trace shows the PATCH returning `in_progress`, version 3, while the concurrent
GET returned `todo`, version 2. Both desktop and mobile drag assertions now await
the matching successful PATCH before retaining their independent GET and UI
checks. No application behavior or timeout was changed. Production remains
unmodified until the corrected commit passes CI.

The next local run passed the corrected drag case, then stalled across unrelated
authenticated flows. Direct PostgreSQL connections timed out, Docker container
listing stalled, and recent database/cache health checks reported that they
could not start. API and proxy health still responded in 20–42 ms. The failed
run was stopped with its traces retained; shared Docker was not restarted.
Validation moved to temporary, private PostgreSQL 18 and Valkey 9 containers on
the application server, separate from the production database and edge proxy.
These validation services are disposable and must be removed after the checks.

The isolated Linux run for `55648a49` passed all nine commands: 400 unit tests,
78 browser tests and MCP smoke, with initial JavaScript at 199,344 gzip bytes.
Its temporary containers were removed. CI run
[37892789265](https://github.com/ksamint/taff01/actions/runs/37892789265)
passed all Docker builds but reported Lighthouse performance 88/86/85 for
en/zh-CN/zh-HK; accessibility was 96 and best practices 100 in every locale.
Deployment is still blocked on the required performance gate; PostgreSQL,
the production application, the shared route and DNS remain unmodified.

The reports show the 169,180-byte Noto UI font competing with startup scripts
in every locale, including English. It is now split into a 47,620-byte shared
UI/Today asset and its 114,440-byte complement, with exact disjoint Unicode
ranges covering the original 540 mappings. The source font is retained.
Regeneration reproduced both assets byte for byte; axes, outlines, horizontal
and vertical metrics at six weights and cross-subset kerning were verified.
The family, optional display, advertised weights, preloads and 20-card limit
are preserved. The isolated Linux measurement improved performance to 91/89/90
for en/zh-CN/zh-HK, with accessibility 96 and best practices 100. Simplified
Chinese still missed the required 90, so this candidate was not pushed or
deployed. Its first seven required checks passed; the failing performance gate
stopped the run before LCP, browser tests and MCP smoke.

Today now shares one locale/time-zone time formatter across its visible cards
per render, instead of constructing one for every due date. Number formatting
also reuses one instance for the count and pagination label. Formatting options,
locale updates, task filtering and the 20-card limit are unchanged. The isolated
runner measured this change with the original performance settings.

Candidate `cca2cede5a26d72b6a57b275d2414cbcd45d345d` passed all nine required
commands in the isolated Linux runner: 400 unit tests, 78 browser tests and MCP
smoke. Initial JavaScript was 199,346 gzip bytes. Signed-in, 20-card mobile
Lighthouse performance was 92/90/90 for en/zh-CN/zh-HK; accessibility was 96 and
best practices 100 throughout. The separate three-run slow-4G, 4x-CPU LCP check
reported medians of 1,752/1,956/1,960 ms, all below 2,000 ms. The runner exited
zero at 2026-10-09 07:07:11 UTC with a fresh completion marker. Temporary test
containers, network and runtime image were removed. This candidate is pushed;
CI run [37897438084](https://github.com/ksamint/taff01/actions/runs/37897438084)
passed, including all Docker builds, 78 browser checks and MCP smoke. After the
fast-forward to main, run
[37898540544](https://github.com/ksamint/taff01/actions/runs/37898540544) failed
Lighthouse at 89/87/87. Initial transferred JavaScript was unchanged and its CPU
benchmark was 16–21% lower; CPU headroom is the current hypothesis. The required
thresholds and audit settings remain unchanged.

The first native image build failed downloading the Dockerfile frontend through
the host's selected container builder. A separate public-image probe passed
through the existing default Docker builder and its Tencent registry mirror.
No Taff application containers, public route or DNS record were created; the
deployment lock was released. A dedicated PostgreSQL database and restricted
role are provisioned on ins-nx2vm7pc, with verified TLS and access restricted to
the application host. Existing database and proxy containers were not restarted.
Private application credentials and the public database CA are installed outside
the release checkout. They will be reused for the next validated candidate.

Today now memoizes its date, time and number formatter objects by locale and
time zone across renders. The current date and task filtering are still evaluated
on each render. Its performance gain is pending measurement; no new candidate
has been deployed.

## Remaining work and open decisions

M9 is not complete. The local performance targets passed while preserving
the M8 preloads, optional fonts and 20-card Today limit; main CI still needs
sufficient CPU headroom.
Next: finish the full accessibility and keyboard pass, i18n parity and
route screenshots, faithful idempotent prototype seed, verified invitation
email, and the clean-checkout deployment walkthrough and release notes.
No release tag has been created.

The existing product decisions remain open: choose the MCP OAuth 2.1
authorization server and review the BullMQ PostgreSQL backend in an ADR.
Scheduled stack upgrades remain governed by `docs/upgrade-plan.md`.
