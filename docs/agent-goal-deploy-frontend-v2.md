# Agent goal: deploy frontend v2 to taff.apuch.cn (local agent)

> Status 2026-10-15: complete. The live site runs
> `191243d25ea4f72116aadf2a9f7fec844a0ffa6e` (v0.2.0 upgrade checkpoint in
> `docs/deploy.md`).
>
> Work is split between two agents:
>
> - **Cloud build agent.** Develops frontend v2 on `claude/frontend-v2` per
>   `docs/agent-goal-frontend-v2.md`, merges each milestone to `main` with
>   green CI, and publishes release candidates. It has no host access and
>   never deploys.
> - **Local agent.** Has the SSH connection, the deployment lock and the
>   private env. It deploys those candidates and records the evidence. This
>   file is its goal.

## How releases are handed over

The build agent appends one section per candidate to `docs/deploy.md` on
`main`, headed `### Frontend v2 release candidate <R1|M15|M16|M17|M18|v0.2.0>
— <date>`. Each section holds:

- the exact 40-character source SHA (a `main` commit) and two CI run links:
  - the `main` push run on that exact SHA;
  - the merged PR's run on its PR head, whose tree the merge carries;
- the CI numbers from the exact-source `main` run: tests, `perf:budget`,
  three-locale LCP and Lighthouse;
- the migrations added since the live SHA, each marked additive, with
  backfills and their expected row counts;
- new or changed variables in `.env.production.example`, with the production
  value or rule for each (never a secret);
- changes to Compose, Dockerfiles or Caddy, if any;
- the acceptance checklist for this release: plan §6.0 for R1, plus that
  milestone's new flows;
- optionally, a local production-mode result of that checklist. CI and the
  deploy agent's live checks are the required evidence.

The local agent deploys only SHAs that have such a section.

## Command for the local agent

Paste everything below the rule into the local agent. It applies to every
release after v0.2.0 too, so read `v0.2.0` below as "the release the user
names".

---

Deploy the newest frontend v2 release candidate of `ksamint/taff01` to
`https://taff.apuch.cn` as a live upgrade of the running release, with the same
procedure, lock, publisher and host layout as the agent-creation checkpoint in
`docs/deploy.md`. The user has delegated all decisions: do not ask; follow the
rules below and record what you did. You deploy only; feature development
belongs to the cloud build agent.

Read first:

1. `AGENTS.md`. Run its op-cli preflight. If the script path it names no
   longer exists, run the Mac's canonical op-automation preflight instead,
   and correct the path in `AGENTS.md` in a docs-only commit to `main`.
   Follow the sign-in procedure if access is unavailable.
2. `docs/deploy.md` end to end, especially "Apuch server layout", "Operations"
   and the checkpoints from 2026-10-10 onward.
3. `docs/agent-goal-deploy.md`, the previous release procedure; it is the
   template.
4. `docs/frontend-v2-plan.md` §6.0, the basic-function and MCP checklist.
5. The newest `Frontend v2 release candidate` section in `docs/deploy.md` on
   `origin/main`.

Never commit or print secrets, private env values, tokens, passwords, OTPs or
cookies.

**Verification account.** This is a one-time setup, repeated only if the
account is lost. The earlier private credential files are gone (readiness
check, 2026-10-14). If no verification credential item exists in the ops
vault:

1. Create the credentials in 1Password first, through the `op` CLI
   authorized by the 1Password desktop app (the user enables desktop app
   integration and approves the prompt). The service account cannot create
   items, so run `op` without `OP_SERVICE_ACCOUNT_TOKEN` in its
   environment, and confirm `op whoami` shows the user account.
   - Let 1Password generate the password, so it is never typed, echoed or
     logged: `op item create --category login --vault "Codex Automation"
     --title "Taff production verification account" --generate-password='20,letters,digits'
     username=taff-verify
     website=https://taff.apuch.cn`.
   - If that vault refuses the write, use the user's `Private` vault with the
     same command.
   - Read the password only by piping `op read
     "op://<vault>/Taff production verification account/password"` straight
     into the sign-up and sign-in steps, never into a file, terminal output
     or report.
   - After the workspace exists, add a `workspace` field to the item with
     `op item edit`.

   No credential file is kept on the Mac or the host.
   Never write the credentials to the repo, logs or reports.
2. Sign up through the public site with the normal username sign-up, using
   that item's username and password:
   - if `taff-verify` is taken, use `taff-verify-<yyyymmdd>` and update the
     item's `username` field first;
   - an address you control, if email is required.
3. Signed in as that account, create the workspace `Taff verification`.
4. Add one agent through Team, named `Verification agent`.
5. Record only the account's username, the workspace name and where the
   credentials live (vault and item name) in `docs/deploy.md`,
   under "Operations".

This creates only that account's own data; it seeds nothing, changes no
other account and copies no demo agents. Use this account and workspace for
every public check and the live MCP round trip.

**Step 0 — pick the candidate.**

1. `git fetch origin` and find the newest candidate section that has no
   matching upgrade checkpoint yet.
2. If there is none, record "no candidate newer than <live SHA>" and wait
   30 minutes before checking again. Keep watching until the release the user
   named is deployed and recorded, or the user says to stop.
3. Otherwise check all of the following:
   - the candidate SHA is an ancestor of `origin/main`;
   - the linked `main` push CI run is green for that exact SHA;
   - the linked PR CI run is green on the PR's head commit, and that commit is
     an ancestor of the SHA. A merge commit always has a different SHA from
     its PR head, so this run is never on the exact SHA.

   Application code merged to `main` after the candidate does **not** block
   it. The build agent keeps merging while a deploy runs, so the candidate is
   deployed as its pinned SHA, and later code ships with a later candidate.
   Never deploy an unlisted SHA, and never build from the `main` head.
   - If several candidates are pending, deploy only the newest.
   - A newer published candidate always supersedes an older or blocked
     candidate, including one already in progress. Reconcile the held lock
     and runtime, then deploy the newer pinned candidate.

**Step 1 — CI validation and local production smoke.**

The green CI runs from Step 0 are the validation. Do not re-run the full
local suite, Lighthouse or LCP. On a clean detached checkout of the pinned
SHA, build the API, worker and web images, then run `pnpm mcp:smoke`
against a production-mode stack. Record image identities and smoke results.

If a check fails, re-run that check once. Block the candidate only if it
fails twice; record both attempts and continue watching for the next
candidate. A newer candidate supersedes the blocked one.

**Step 2 — check the release is safe for production data.**

1. Read every migration added since the live SHA (`packages/db/migrations`).
2. Allowed: `CREATE TABLE`, `ADD COLUMN`, indexes, constraints that hold on
   existing data, audit triggers, and backfills of new columns.
3. Forbidden: `DROP`, `TRUNCATE`, `DELETE`, type narrowing, renames of live
   columns or tables, and updates that rewrite existing user data.
4. If a backfill would touch more rows than a single transaction can hold on
   the live database, treat it like a forbidden migration.
5. Diff `.env.production.example` against the live SHA. Add each new variable
   to the private env as the candidate section specifies, keeping mode 0600.

   The `AI_*` model variables stay **unset**: workspace data must not reach a
   third-party model. Email and SMS values do not change.

If a migration is forbidden, or the release would change the host layout, the
Traefik route file, DNS, the database role or the PostgreSQL host, do not
deploy. Instead:

- record the reason under the candidate as `Blocked: <reason>`;
- push that docs commit to `main`.

The build agent fixes it.

**Step 3 — deploy** under the existing native deployment lock, with a
detached keeper so an SSH drop does not release it.

1. Take the dedicated Taff database dump and verify it with
   `pg_restore --list`.
2. Take the exclusive env backup.
3. Record the running API, worker and web image identities for rollback.
4. Relay the release as a Git bundle:
   - check its SHA-256;
   - run `git bundle verify`;
   - check out the pinned SHA `--detach` with a clean tree;
   - set `origin` back to GitHub.
5. From the connected workspace, before building and again before container
   start, check that:
   - the pinned SHA is still an ancestor of the remote default branch;
   - its CI runs are still green.

   Newer commits on `main` are expected and do not stop the release.
6. Set `TAFF_TAG` and the `ASSET_VERSION` build argument to the SHA, so the
   service worker and locale caches refresh on every client.
7. Build with `--builder default`.
8. Run the one-shot migrator and confirm every new migration is applied.
9. Replace only API, worker and web. Caddy, Valkey, the route file, DNS,
   database and role stay.

**Step 4 — public acceptance** through `https://taff.apuch.cn`:

- en and zh-HK on a phone viewport (390×844) and on desktop (1280×800);
- a zh-CN spot check of Today, Projects and Me;
- the dedicated verification account and workspace (see "Verification
  account" below), never the demo seed or a real user's workspace;
- zero browser page errors.

1. **Platform:**
   - HTTPS and `/api/health`;
   - Secure and HttpOnly cookies;
   - foreign-origin rejection;
   - `GET /api/auth/methods` unchanged;
   - realtime between two browsers;
   - neighbouring containers keep their IDs, start times and health;
   - PostgreSQL is not restarted.
2. **Basic functions:** the plan §6.0 checklist in full. That includes:
   - signed-out landing and sign-in, sign-out and sign-in again;
   - the 4-tab navigation and the desktop sidebar;
   - Today;
   - task create (FAB and 新建任務), edit and assign (person and agent);
   - run start, pause, resume and cancel;
   - review approve and request changes from Inbox and the review screen;
   - grant access;
   - board drag and the status control;
   - list filters;
   - calendar day, week and month with schedule, drag, resize and undo;
   - ⌘K search;
   - organization switch, create and invite;
   - notification preferences;
   - agent permissions;
   - language (three) and theme;
   - an invitation link in a fresh browser.

   Run each new milestone's flows too (CRM, timeline, graph, brief, mind map)
   as its candidate section lists them.
3. **MCP, live:**
   1. In the verification workspace, use a verification agent (create one
      through Team if missing; never copy demo agents) and assign it a fresh
      task.
   2. Issue a token from Me › MCP. Confirm it is shown once and the page shows
      the endpoint, client config, scopes and call log.
   3. With the official `@modelcontextprotocol/client`, as `pnpm mcp:smoke`
      does, against `https://taff.apuch.cn/mcp`:
      - initialize and list the tools;
      - call every read tool;
      - call each write tool once on the verification task: `tasks.update`,
        `calendar.schedule`, `runs.event`, `runs.submit` with review requested,
        and the new v2 tools the candidate lists.
   4. Confirm the calls appear in the call log and the changes appear in the
      open browser in real time.
   5. Approve the submission from Inbox.
   6. Revoke the token from Me › MCP and confirm a fresh initialize gets
      HTTP 401.
   7. Do not flood production to prove the rate limit; CI's smoke covers it.
   8. Archive the verification entities the run created.
4. **Failure handling.** Re-run a failed check once. Roll back only if
   sign-in, Today, task create/edit, review approve or the live MCP round
   trip fails twice. Restore the env backup and recorded previous image
   identities; recreate only API, worker and web. Additive migrations and
   data stay. Record both attempts under the candidate as `Blocked:`.

   Record any other failed check as a follow-up in the checkpoint and keep
   the release live. These rules are the user's effective 2026-10-14
   deployment override; the lock, database/env backups, additive-only
   migrations and secrets rules remain unchanged.

**Step 5 — record and release the lock.**

1. Write the checkpoint using the lean-delivery template (≤ 25 lines).
2. Write the acceptance receipt, set `deployment.done` to the SHA, and
   release the lock with the keeper.
3. Confirm with an independent flock probe that the lock is free and the
   runtime is healthy.
4. Push the docs-only commit to `main`.

**Step 6 — report** to the user:

- the live URL and the SHA;
- what is new to review, with the milestone report links;
- anything blocked.

Then check for the next candidate (Step 0) every 30 minutes. Deploy each
new candidate using these rules, until the release the user named is deployed
and recorded.

When a candidate section names a release tag (`vX.Y.Z`), create and push the
annotated tag on the exact source after acceptance, as v0.2.0 was. The build
environment cannot push tags.
