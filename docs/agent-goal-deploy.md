# Agent goal: release the prototype UI to taff.apuch.cn

> Status 2026-10-11, after the review of `codex/prototype-release` (3babb69):
> steps 1 and 2 are done for source `828443e23c2e08a1f1936aa1dbb23380db496b52`
> (CI green on feature and main, strict Lighthouse, LCP 704/780/772 ms,
> bundle staged and verified on the host). The remaining blocker was the
> live review-approval check: no real account can add an agent to a
> workspace (agents only come from the seeds or by copying from a workspace
> that already has one), so that check is withdrawn from this release and
> the gap becomes the first follow-up. Resume at step 3 with the revised
> rules below. `main` may now be ahead of the released SHA by documentation
> commits only; see "Released SHA" under step 3.

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
checkpoint so the next release shows the change. (Done for `828443e`:
the measured medians are 704/780/772 ms, under budget.)

Step 3, deploy under the existing lock and publisher, exactly as before:

- Released SHA: `828443e23c2e08a1f1936aa1dbb23380db496b52`, the source the
  bundle, the local validation and both CI runs cover. It no longer has to
  be the `main` head: `main` may be ahead by commits that touch only
  `docs/`. Under the lock, confirm `git diff --stat 828443e origin/main --
  . ':!docs'` is empty and that `828443e` is an ancestor of `origin/main`;
  if either fails, the source has moved and the whole validation repeats
  for the new SHA.
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
schedule editor; Inbox tabs, unread count and the digest rows; Me with
language and appearance; an invitation link opened in a fresh browser lands on `/`
without the token in the address bar before and after sign-up; realtime
update between two browsers; Secure/HttpOnly cookies; foreign-origin
rejection; `GET /api/auth/methods` unchanged. Neighbouring containers keep
their IDs, start times and health; PostgreSQL is not restarted.

The review-approval check (an agent reports evidence over MCP, a person
approves it from Inbox) is not part of this release's public acceptance:
the verification account's workspace has no agent, and the product offers
no way to add one. The flow is proven by the browser suite on the released
SHA (`e2e/agent-review.spec.ts`, 123 cases in CI and locally). Do not seed
production, and do not copy agents from the demo workspace into a real one.

Step 5, record. Append a "Prototype UI upgrade checkpoint — <date>" section
to `docs/deploy.md` in the shape of the previous checkpoints: the SHA, the
two CI run links, the validation counts, Lighthouse and LCP numbers, what
was replaced and what was retained, the public checks that passed, and the
rollback procedure (restore the env backup and previous image identities,
recreate only API, worker and web; the additive migration and data stay).
Release the lock only after verification and push the documentation
commit to `main`.

Step 6, first follow-up release: let a workspace admin add an agent. Add
`POST /api/workspaces/:id/members` with `{ name, kind: "agent" }` behind
`workspace:manage` in `packages/core` (one transaction, activity row,
`NOTIFY`), its schema in `packages/schemas`, an MCP-free REST test, and an
"Add agent" action on the Team screen (prototype lines 667–710) with
strings in all three locales. Then repeat the release procedure for that
SHA and complete the withdrawn check on the public origin: in the
verification workspace add an agent, create a task assigned to it, start
the run, issue an agent token from Me → MCP, report one `runs.event` and
`runs.submit` with the official MCP client as the spec does, approve from
Inbox, revoke the token, and record the result in the checkpoint. After
that, continue with `docs/agent-goal.md` (LCP is already under budget;
start at item 1).

Stop and ask only if the migration backfill would touch more rows than a
single transaction can hold on the live database, if a public check fails
after one rollback-free retry, or for anything that changes the host
layout, the database role, DNS or the route file.
