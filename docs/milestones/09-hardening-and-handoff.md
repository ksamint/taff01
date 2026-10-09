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
on each render. Candidate `729e7061` passed all nine isolated checks, including
400 unit tests, 78 browser cases and MCP smoke; JavaScript was 199,388 gzip bytes.
Lighthouse was 92/90/90 and three-run LCP medians were 1,768/1,956/1,952 ms.
Same-host TBT changed by less than 3 ms, so no material CPU improvement was
demonstrated. CI run
[37904550921](https://github.com/ksamint/taff01/actions/runs/37904550921) failed
performance at 86/87/85 on a lower CPU benchmark. Accessibility remained 96 and
best practices 100; all image builds passed. Main was not advanced, and no
deployment was attempted for that candidate.

Creation and calendar-input schemas now live in a lazy creation leaf, retaining
their exact definitions and root-package exports. Today loads that validation
inside its mutation lifecycle, checks the captured session after the download,
then normalizes input before optimism and the request. The repeated Worker
selectors reuse one translated option projection instead of mounting 21
translation subscriptions. Browser regression coverage delays the validator
download across remote session revocation, checks that no write escapes, and
verifies whitespace rejection, canonical title trimming and translated options.
Candidate `92e24fc6` passed the first seven required commands, including 400
unit tests. Initial JavaScript increased to 201,995 gzip bytes. Lighthouse
performance was 90/90/89, with accessibility 96 and best practices 100; the
required performance gate stopped the full run before browser tests and MCP
smoke. Three-run LCP medians passed at 1,780/1,984/1,992 ms. The split added
startup chunks and did not demonstrate a CPU improvement; this candidate was
not pushed or deployed.

A separate six-case browser diagnostic passed the three existing create/assign
cases. All three new delayed-validator cases timed out at `await seen`, after
the submit click and before any sign-out request. They ran against the
development server, which did not request the expected post-submit chunk.
The production-build diagnostic produced the same three passes and three
timeouts at `await seen`, before sign-out; artifact hashes stayed unchanged.
A single zh-HK CPU capture observed
five Today renders and approximately 6.5 ms of sampled inclusive card mapping
work. Its warm-session storage was retained, so it is a diagnostic rather than
an equivalent Lighthouse cold-storage measurement; no large CPU saving has
been established.

The lazy creation split is removed because it increased startup bytes and did
not improve the measured blocking time. Creation again uses the original shared
synchronous validation; the translated member-option projection is retained.
Today task links now disable speculative route prefetch. The actual Lighthouse
network log contained two task-route RSC fetches without a navigation, but no
full task-detail script download, so no large CPU saving is claimed. The existing
three-locale create/assign case checks whitespace rejection, canonical title
trimming, absence of speculative task navigation and successful detail navigation.
CI browser tests start the built API and web servers; local development commands
retain their existing behavior. Full validation of this candidate is pending.

Candidate `a6ad6a49` passed the first seven commands and 400 unit tests, with
199,433 gzip bytes of initial JavaScript. Lighthouse was 91/89/90; Simplified
Chinese failed the unchanged gate, so browser tests and MCP smoke did not run.
The three-run LCP medians passed at 1,728/1,952/1,944 ms. All three Lighthouse
network logs contained zero speculative task-route requests.

A corrected cold zh-HK capture cleared IndexedDB, cache storage and service
workers, retained the authenticated cookie and workspace preference, and used
the installed Lighthouse DevTools settings: 562.5 ms request latency,
1,474.56 Kbps down, 675 Kbps up, 4x CPU and the Moto G Power viewport.
It reproduced the greeting's 3,368 ms LCP and confirmed that the `/api/me`
preload completed at 1,179 ms. The eleven bootstrap scripts were requested
with the parser; the last AppShell script completed at 3,109 ms. The agents
request completed after LCP, so preloading it is not proposed as an LCP fix.

The capture also identified an unnecessary browser time-zone lookup for an
account that already had a chosen zone. The shared helper now returns that
zone directly, retaining browser detection and the UTC fallback for new UTC
accounts. Six i18n tests and all package type checks passed; full validation
of this change is pending. A separate read-only PostgreSQL probe authenticated
as `taff` from the application host with certificate identity verification and
TLS active; the dedicated database remains unmigrated and the probe container
was removed.

The browser-zone lookup consumed 29.8 ms before the greeting's final paint in
the corrected cold capture. The module initializer consumed 85.3 ms sampled
self time and 127.6 ms inclusive time; the card map consumed only 9 ms, so no
larger card refactor is proposed. ADR 0007 records a measured candidate using
the installed Next version's Webpack production build through the existing
package script. Its full validation and any performance gain are pending.

Candidate `42521a2e` passed the first seven required checks, including 402 unit
tests. Webpack produced 190,690 gzip bytes of initial JavaScript; Lighthouse
performance was 90/90/90, accessibility 96 and best practices 100. Three-run
LCP medians were 1,676/1,844/1,852 ms. Blocking time increased relative to the
previous candidate, so these results establish byte and LCP improvements,
not a CPU improvement. Production browser testing finished with 73 passes and
five failures; MCP smoke was not reached, and this candidate was not pushed.

Three failures exposed a test selector collision with Next's production route
announcer. The validation assertion now scopes the exact translated alert to
the task composer. The other two traces show an Inbox GET starting about 16 ms
after a held snooze PATCH, overwriting its optimistic removal. The shared Inbox
query now reuses Calendar's mutation-aware mount-refetch guard, preventing a
late notification observer from issuing that read during a pending write.
Settlement still reconciles the authoritative Inbox. An actual QueryObserver
regression fails without the guard and passes with it, including rejected-write
rollback and the settlement read. Full validation of this repair is pending.

Candidate `ad533b45` passed the first seven checks and 403 unit tests, with
190,730 gzip bytes. Lighthouse was 91/89/89, so the full browser suite and MCP
smoke did not run. LCP medians passed at 1,688/1,848/1,868 ms. A focused
production diagnostic passed all six create/assign and Inbox rollback cases;
source and build hashes stayed unchanged. It was not pushed or deployed.

One cold zh-HK capture reproduced the greeting's 3,096 ms LCP. The first Today
date filter accounted for 29.4 ms sampled self time in the final long task;
later calls were small and after paint. This is consistent with first Intl
initialization moving from the browser-zone lookup to the date filter, so no
large memoization saving is claimed. The Me preload still finished at 1,183 ms.

ADR 0008 introduces an authenticated server render through a nonrenewing Core
session lookup. Its bootstrap remains provisional until the browser confirms:
Today reads, mutations, persisted data, profile effects, notifications and
realtime are gated, and other protected routes retain the loading gate.
Browser session renewal is preserved. Focused unit and type checks pass;
account-switch/retry browser regressions and the full unchanged gates were pending
at implementation time.

Candidate `d06d2fc4` subsequently passed all nine checks: 409 unit tests in 33
files, 87 production browser tests including all nine SSR account-switch/retry
cases, and MCP smoke. Initial JavaScript is 191,399 gzip bytes. Lighthouse
EN/CN/HK performance is 98/99/98, accessibility 96 and best practices 100;
Lighthouse LCP is 1,469/1,433/1,424 ms. Separate unchanged three-run LCP
medians are 556/544/544 ms. Chinese audits additionally load the unchanged
114,724-byte optional CJK font. Both GitHub CI runs passed: feature
[37919940000](https://github.com/ksamint/taff01/actions/runs/37919940000) and
main [37920840689](https://github.com/ksamint/taff01/actions/runs/37920840689).

The one native deployment attempt for this SHA failed before build or startup:
the host could not connect to GitHub TCP port 443 after 133 seconds. No Taff
containers, route, DNS record or migrations were created. The previous image
tag was restored byte-for-byte, existing credentials retained, and the host
lock released. The next transport relays a checksum-verified Git bundle over
the existing SSH connection, checks the pinned clean checkout, and reconfirms
GitHub's default branch and required CI from the controller before startup.
It retains the existing Compose publisher and rollback. The DNS rollback now
reconciles an interrupted creation with the exact SHA-owned intent and rejects
ambiguous or foreign records; seven simulated recovery cases passed. Validation
of this documented transport correction was pending at that checkpoint; the
public site was not yet live.

### First successful public deployment — 2026-10-09

Candidate `ef7f52c3` passed the unchanged nine-command validation before push:
409 unit tests in 33 files, 87 production browser cases and MCP smoke. Initial
JavaScript is 191,397 gzip bytes; EN/CN/HK Lighthouse performance is 99/99/98,
accessibility 96 and best practices 100. Lighthouse LCP is 1,422/1,400/1,411 ms;
the separate three-run LCP medians are 536/568/564 ms. Feature CI
[37923784208](https://github.com/ksamint/taff01/actions/runs/37923784208) and main CI
[37924781365](https://github.com/ksamint/taff01/actions/runs/37924781365) both passed
for the exact SHA `ef7f52c3052db173d2e56ec7828d0ed400092c8e`.

The single native attempt for this SHA succeeded. The controller relayed and
verified the tracked Git bundle, built with the host's existing default builder,
rechecked the exact default-branch SHA and CI under the deployment lock, then
started the separate `taff` Compose project on `ins-ag5pnvc0`. Migrations exited
zero; API and Valkey were healthy, worker jobs completed, and Caddy exposed no
host ports. The owned Traefik route and DNSPod A record now serve
[taff.apuch.cn](https://taff.apuch.cn) with a trusted Let's Encrypt certificate.

The public mobile smoke passed signup, Secure/HttpOnly session cookies, task
create/read/update, foreign-origin rejection, WebSocket-driven UI updates,
sign-out and sign-in, with no browser page errors. The dedicated PostgreSQL
database and restricted role on `ins-nx2vm7pc` use verified TLS; all nine observed
authenticated app connections used TLS 1.3. The six neighboring containers'
IDs, start times and health were unchanged; PostgreSQL retained its start time
and read-only configuration/TLS mounts. The deployment lock was released.
First-deployment rollback remains scoped to Taff's owned route/DNS/project,
preserving the database, role and volumes.

Runtime image IDs:

| Service | Image ID |
| --- | --- |
| Web | `sha256:51712d8c7dd0c18ea987e1bc7a3b8ea1bdaa24cf57da9b1c35d362ddc13646b0` |
| API / migrator | `sha256:22129b773b2d05182cf62033285c054487265ef8236cb84a90eef140da099b7b` |
| Worker | `sha256:e961006814cb85fab43b62c9cb2ebb4d2cc967286d7774342d770928c4eb5343` |

Neo4j on `ins-aj5kmjag` remains unchanged: the app has no graph model or driver,
and the requested graph data/feature and shared-server isolation need a scope
decision. The deployment checkpoint documents the live release; it does not
claim M9 completion or create a release tag.

## Remaining work and open decisions

M9 is not complete. The local performance targets passed while preserving
the M8 preloads, optional fonts and 20-card Today limit; both exact-commit CI runs
passed with the accepted SSR/Webpack build.
Next: finish the full accessibility and keyboard pass, i18n parity and
route screenshots, faithful idempotent prototype seed, verified invitation
email, and the clean-checkout deployment walkthrough and release notes.
No release tag has been created.

The existing product decisions remain open: choose the MCP OAuth 2.1
authorization server and review the BullMQ PostgreSQL backend in an ADR.
Scheduled stack upgrades remain governed by `docs/upgrade-plan.md`.
