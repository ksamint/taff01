# Server space and deployment readiness — 2026-10-10

The application server `ins-ag5pnvc0` recovered **13.93 GiB** from unused
validation builds and reproducible Git archives in this cleanup. Production
services and database volumes were preserved. The UI branch is prepared for
review; fresh strict validation failed the Chinese LCP budget on immutable
`de44b79a6cc8d6ec99268273db85b93ed094d670`. Deployment remains blocked. The user subsequently requested publication of
the latest branch as a review PR despite the known validation failures.

## Measured space

Measurements are from the cleanup operation at approximately 09:25 UTC.
The earlier inventory had 20.29 GiB free; the new validation build used some
space before deletion. GiB is bytes divided by 1,073,741,824.

| Filesystem | Total | Used before | Free before | Used after | Free after |
| --- | ---: | ---: | ---: | ---: | ---: |
| Main `/`, including `/srv` | 78.11 GiB | 54.95 GiB | 19.87 GiB | 41.03 GiB | **33.80 GiB** |
| Separate `/srv/tiansight` | 97.86 GiB | 16.93 GiB | 75.92 GiB | 16.93 GiB | **75.92 GiB** |

Filesystem reserved blocks explain why used plus available does not equal total.
After the failed validation finished and its disposable containers/network were
removed, a final measurement showed **40.97 GiB used / 33.85 GiB available**
on the main disk. TIANSIGHT remained at 75.92 GiB available. Live Taff service
identities, image tags and start times still matched the post-cleanup check.

| Directory | After cleanup | Treatment |
| --- | ---: | --- |
| `/srv/taff` | 30.73 MiB | Live releases, private configuration and rollback source retained. |
| `/srv/taff-validation-20261009` | 3.22 GiB | Accepted source, required archive, runtime, browser downloads and evidence retained. |
| `/srv/taff-ui-parity-validation` | 1.87 GiB | Current candidate, latest failed candidate archive, all tracked source and review evidence retained. |
| `/srv/tiansight` | 16.92 GiB | Separate volume; live data, backups and rollback builds untouched. |

Docker inventory before deletion: images 8.142 GB, volumes 6.357 GB and build
cache 3.506 GB. All five volumes were active. This cleanup did not prune images,
volumes or Docker build cache. The earlier cleanup already reclaimed 3.582 GB
of unused builder cache.

## Removed material and preservation checks

- 31 generated build/dependency directories in stopped failed or superseded
  candidates: `node_modules`, `apps/web/node_modules`, `apps/web/.next`,
  `.turbo` and `dist` when present and absent from the tracked source manifest.
- 40 generated directories in historical `source-previous-*` QA snapshots.
- 16 redundant `source.tar` archives. Every archive matched a fresh local
  `git archive` SHA-256 for a commit retained in the current branch history.

Every target was canonical and checked against mounts of running and stopped
containers. The active candidate was excluded. Failed/superseded ownership
proofs were checked before deletion. All **1,092 protected evidence files**
matched their original hashes afterward; the accepted QA source, original
runner, archive and runtime checks passed. Existing services retained their
container identities, images, start times and health. Shared hardlinks mean
individual directory sizes must not be added to estimate recovered space;
the 13.93 GiB figure comes from filesystem free-space measurements.

The [machine-readable inventory](server-space-2026-10-10.json) lists all
87 deleted targets, before/after bytes and preservation counts. No personal
data, database content, credentials, screenshots or reports were deleted.

## Repository review

Branch: `codex/ui-parity`; runtime candidate: `de44b79`.
The [side-by-side acceptance report](../milestones/10-ui-parity.md) contains
the source port and native captures. All 16 screen sets compared successfully
without snapshot updates: 64 cases and 86 committed baseline PNGs. The offline
prototype has 58 reference captures. A bounded independent source review found
no additional source regression. Fresh validation passed lint, six type
checks, licences, 43 files / 452 unit tests, production builds and the
197,585-byte initial JavaScript budget (193.0 KiB). Lighthouse passed
98/91/90 performance, 96/96/96 accessibility and 100/100/100 best practices
for en/zh-CN/zh-HK. Default three-run LCP results were:

| Locale | Samples (ms) | Median (ms) | 2,000 ms budget |
| --- | --- | ---: | --- |
| en | 1932, 1924, 1944 | 1932 | Pass |
| zh-CN | 2152, 2160, 2144 | 2152 | Fail |
| zh-HK | 2132, 2132, 2128 | 2132 | Fail |

The original runner exited with code 1 before the 120 behavioral cases and
MCP smoke, so those are unverified for this revision. The font-priority
change did not resolve the LCP failure. The branch is committed locally;
no passing release or live UI deployment is claimed. Review publication is
separately authorized and does not establish deployment readiness.

Live API, worker and web image tags remain
`55b315b743a18113bed864191eb74c6f1d997d9b` (verified directly after cleanup).
The API and Valkey report healthy; all five Taff containers remain running.
The public HTTPS health endpoint returned `{"status":"ok"}` after cleanup.

The current candidate moves existing notification CSS into the initial layout
and lowers optional Chinese font request priority. Its anonymous HTML has the
expected low-priority font hint. No font bytes, appearance, protected-read
confirmation or performance threshold changed.

Local `main` is stale; compare against the actual deployed immutable revision
and applied migration journal when preparing the upgrade. A `main...HEAD` diff
also includes previously implemented SMS and administration work and must not
be described as exclusively UI changes.

## Deployment handoff

1. Resolve the measured Chinese cold-load failure, then complete fresh
   immutable-candidate checks: lint, types, licences, 452 unit
   tests, builds, initial JS budget, Lighthouse in all three locales, default
   three-run LCP medians at or below 2,000 ms in every locale, 120 browser cases
   and MCP smoke. Keep the existing runner and limits unchanged.
2. Record actual results, commit the review documentation, push the branch and
   obtain required exact-revision CI. The CI visual loop compares all 16 sets;
   separate quiet-machine LCP evidence remains required by the deployment guide.
3. Follow [the existing deployment runbook](../deploy.md): take the lock,
   verify ownership and current image identities, back up the dedicated
   PostgreSQL database and private environment, and build immutable images
   from the accepted revision. Use the applied schema and admin-state rollback
   guard; an older pre-administration image is not an automatic safe rollback.
4. Migrate once without production seeding; recreate only Taff API, worker and
   web. Retain the current route, DNS, Caddy, Valkey, database/CA and SMS settings.
   Verify HTTPS health, existing login, task writes, realtime, UI and neighbor
   preservation. This preparation does not authorize an extra SMS test send.

Neo4j feature integration, real OTP session verification and the remaining M9
handoff items remain open as described in the development review and runbook.
No live UI deployment occurred during this cleanup.
