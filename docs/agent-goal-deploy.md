# Agent goal: release the prototype UI to taff.apuch.cn

Paste everything below this line as the goal. The host, network, database,
secrets and the deployment lock are as recorded in `docs/deploy.md`
("Apuch server layout" and the two checkpoints); nothing about the host
changes in this release.

---

Release `main` of `ksamint/taff01` to `https://taff.apuch.cn` as a live
upgrade of the running release `41ae94ff…`, following the procedure that
produced the "Live SMS upgrade checkpoint" in `docs/deploy.md`. The release
carries the prototype UI port (PR 2, milestone report
`docs/milestones/10-ui-parity.md`), real per-workspace task references
(`KEY-number`) and the additive migration `0021`, which adds
`workspaces.key` and `tasks.number`, backfills both, then adds a NOT NULL and
a unique constraint on `(workspace_id, number)`.

Read first: `docs/deploy.md` end to end, `docs/milestones/10-ui-parity.md`,
`docs/ui/review-2026-10-10/pr-2-review.md`, `AGENTS.md`, the standing
rules in `docs/agent-goal.md`. Never commit secrets; never print the
private env file, tokens, passwords or OTPs in reports.

Step 1, make `main` green. CI's `checks` job compares the visual baselines
under `e2e/__screenshots__/` and they were last captured before the review
fixes (task references, the Today run cap, the digest row, the board
columns). Regenerate them on the same Linux Chromium that CI installs
(`pnpm exec playwright install --with-deps chromium`, then
`UI_SCREEN=<screen> pnpm exec playwright test --config
playwright.visual.config.ts --update-snapshots` per screen as `ci.yml`
runs them), inspect every changed capture against its reference in the
milestone report, place each beside its reference there, and push. Do not
loosen thresholds or skip screens. Acceptance: both required CI runs
(feature and `main`) green for the exact SHA to be released, which must be
the `main` head.

Step 2, validate the exact SHA locally on a quiet machine, all green:
`pnpm lint && pnpm typecheck && pnpm licence:check && pnpm test && pnpm
build && pnpm build:server && pnpm perf:budget && pnpm e2e && pnpm
mcp:smoke`, plus `pnpm perf:lighthouse` and `LCP_LOCALE=en`, `zh-CN`,
`zh-HK` `pnpm perf:lcp` (three runs each). Record the numbers. The LCP
budget of 2 s on simulated slow 4G is known to be over (about 2.3–2.7 s,
see `docs/agent-goal.md` item 0); it is being fixed on `main` after this
release and does not block it, but the measured medians go into the
checkpoint so the next release shows the change.

Step 3, deploy under the existing lock and publisher, exactly as before:

- Take the dedicated Taff database backup and the exclusive private env
  backup; keep the previous image identities for rollback.
- Relay the release as a Git bundle if the host cannot reach GitHub, verify
  the SHA-256 and `git bundle verify`, check out the pinned 40-character SHA
  detached, confirm a clean tree.
- Confirm the remote default branch and the exact required CI from the
  connected workspace while holding the lock, before building and again
  before container start.
- Build with the explicit default builder, run the one-shot migrator and
  confirm `0021` applied and every existing task received a number (count
  of `tasks` with `number IS NULL` is zero), then replace only API, worker
  and web. Caddy, Valkey, the route file, DNS, database and role stay.
- Keep `TAFF_TAG` at the released SHA; the private env file keeps its
  values and mode 0600; no SMS value changes.

Step 4, verify through the public origin, in zh-HK and en, on a phone
viewport and desktop: HTTPS and `/api/health`; existing email login,
sign-out, sign-in; Today with the timeline, the due list and the FAB; a
task created from quick add shows a `KEY-number` reference everywhere its
ID appears (Today, Projects card, detail sheet, search, Inbox); Projects
board drag on desktop and the column scroll on phone; calendar list and
schedule editor; Inbox tabs and review approval; Me with language and
appearance; an invitation link opened in a fresh browser lands on `/`
without the token in the address bar before and after sign-up; realtime
update between two browsers; Secure/HttpOnly cookies; foreign-origin
rejection; `GET /api/auth/methods` unchanged. Neighbouring containers keep
their IDs, start times and health; PostgreSQL is not restarted.

Step 5, record. Append a "Prototype UI upgrade checkpoint — <date>" section
to `docs/deploy.md` in the shape of the previous checkpoints: the SHA, the
two CI run links, the validation counts, Lighthouse and LCP numbers, what
was replaced and what was retained, the public checks that passed, and the
rollback procedure (restore the env backup and previous image identities,
recreate only API, worker and web; the additive migration and data stay).
Release the lock only after verification, push the documentation commit
to `main`, then continue with `docs/agent-goal.md` item 0.

Stop and ask only if the migration backfill would touch more rows than a
single transaction can hold on the live database, if a public check fails
after one rollback-free retry, or for anything that changes the host
layout, the database role, DNS or the route file.
