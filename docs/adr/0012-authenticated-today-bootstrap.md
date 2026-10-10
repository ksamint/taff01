# 0012 — Render Today reads before browser session confirmation

## Context

The exact `7bfb561` release candidate passed local checks, but both required
CI runs failed the unchanged Lighthouse performance gate. Main scored
98/88/89 for EN/CN/HK; feature scored 95/86/85. In the main reports,
English's largest element was the server-rendered Today heading at 1,431 ms.
The Chinese largest element was a task title that appeared after hydration
at 3,573/3,553 ms. Removing the early optional font preload did not improve
local scores and was reverted.

ADR 0008 supplies server identity, but leaves protected query data empty and
purges provisional reads on every browser confirmation, including the same
account. That delays the first list paint until framework initialization,
session confirmation and another render.

## Decision

Add the authenticated, private, nonrenewing `/api/bootstrap/today` endpoint.
Its shared schema carries Me and one authorized workspace's full task and
member collections, runs, calendar and server clock. Core composes the
existing independently authorized reads. The calendar range derives from
the user's timezone and that clock, including 23/25-hour DST days. The plain
Me bootstrap contract remains available.

RootLayout validates the envelope and supplies it to its request-specific
QueryClient. Today seeds the exact ordinary read keys synchronously and
uses the same clock for its initial calendar range. Me retains timestamp
zero and provisional session state. Browser confirmation still gates writes,
other protected routes, notifications, realtime and durable cache restoration.
Only the explicitly seeded server read keys survive confirmation of the same
user and workspace/member/role fingerprint; they become stale for browser
reconciliation. All other provisional reads are purged. Account replacement,
logout or access changes purge every protected read and advance the existing
version guards. Durable snapshots only fill absent reads; a future device
timestamp cannot replace current server or browser data.

A SameSite/Lax presentation cookie mirrors the confirmed user/workspace
selection, with Secure on HTTPS. Core honors it only for the authenticated
user's current membership. User-keyed sessionStorage remains the existing
tab's authority after confirmation. A shared cookie cannot represent divergent
per-tab selections exactly: an old or different tab can initially show the
validated server default, then reconcile its own saved selection. No cookie
value grants permission, and no session token or auth record is serialized.

Unavailable, unauthorized or malformed reads retain the client fallback.
An old API without the new endpoint falls back to the nonrenewing Me read.
Snapshots exceeding two million characters also use Me-only bootstrap;
the full tasks key never receives a truncated collection.

## Consequences

No new dependencies, migration, environment variables or permission rules.
RootLayout performs additional authorized reads on authenticated document
requests, including other routes; those routes remain browser-confirmation
gated. The response size limit bounds serialized bootstrap data, and ordinary
browser reconciliation remains authoritative for changes during rendering.

Acceptance requires visible task and calendar content while application
JavaScript is held, no provisional writes, matching confirmation without
blanking, account/access-change purging, future-clock durable-cache coverage,
unchanged full validation and exact-commit CI. Performance gates and visual
thresholds remain unchanged.
