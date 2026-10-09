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
| Vitest | 394 passed across 29 files; includes external-database/TLS/isolation regression |
| Web and server builds | Passed; API and worker production dependency trees prepared |
| Today JavaScript budget | 200,270 gzip bytes / 204,800 limit |
| Lighthouse en, actual mobile throttling | Performance 94, accessibility 96, best practices 100 |
| Lighthouse zh-CN, actual mobile throttling | Performance 92, accessibility 96, best practices 100 |
| Lighthouse zh-HK, actual mobile throttling | Performance 92, accessibility 96, best practices 100 |
| Audit script type checking and report credential assertions | Passed |
| Playwright, all three locales | 75 passed (5.7 minutes); corrected month drag passed in every locale without retries |
| MCP smoke against the production API | Passed; every tool, rate limiting, revocation and call logging |
| Docker API image | Local build blocked before execution by Docker Hub's TLS certificate mismatch |
| GitHub Actions and report upload | Run 37879586044 built all three images and passed actual-throttling Lighthouse: performance 93/90/91, accessibility 96 and best practices 100. Browser flows passed 74/75; the desktop month-drag fixture correction is awaiting CI. |

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
remote CI remains the release gate.

## Remaining work and open decisions

M9 is not complete. Next: reduce Chinese-locale LCP to a three-run median of
2 seconds while preserving the M8 preloads, optional fonts and 20-card Today
limit. Then finish the full accessibility and keyboard pass, i18n parity and
route screenshots, faithful idempotent prototype seed, verified invitation
email, and the clean-checkout deployment walkthrough and release notes.
No release tag has been created.

The existing product decisions remain open: choose the MCP OAuth 2.1
authorization server and review the BullMQ PostgreSQL backend in an ADR.
Scheduled stack upgrades remain governed by `docs/upgrade-plan.md`.
