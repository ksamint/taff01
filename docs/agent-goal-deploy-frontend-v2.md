# Agent goal: deploy frontend v2 to taff.apuch.cn (local agent)

> Status 2026-10-14: ready. The live site runs
> `23387723f8c438d990db00d561cba2899f48ab80` (agent-creation checkpoint in
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
- the validation numbers: the nine commands, Lighthouse, three-locale LCP and
  `perf:budget`;
- the migrations added since the live SHA, each marked additive, with
  backfills and their expected row counts;
- new or changed variables in `.env.production.example`, with the production
  value or rule for each (never a secret);
- changes to Compose, Dockerfiles or Caddy, if any;
- the acceptance checklist for this release: plan §6.0 for R1, plus that
  milestone's new flows;
- a local production-mode result of that checklist, including a real MCP
  client round trip.

The local agent deploys only SHAs that have such a section.

## Command for the local agent

Paste everything below the rule into the local agent. The file is on `main`
once PR #5 merges; until then it is on branch `claude/quirky-fermi-z3z30a`.

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
2. If there is none, report "no candidate newer than <live SHA>" and stop.
   Rerun this command when the build agent publishes one.
3. Otherwise check all of the following:
   - the candidate SHA is an ancestor of `origin/main`;
   - `git diff --stat <SHA> origin/main -- . ':!docs'` is empty;
   - the linked `main` push CI run is green for that exact SHA;
   - the linked PR CI run is green on the PR's head commit, and that commit is
     an ancestor of the SHA. A merge commit always has a different SHA from
     its PR head, so this run is never on the exact SHA.

   If the code moved past the candidate, wait for the next candidate section;
   never deploy an unlisted SHA.

**Step 1 — validate locally** on a quiet machine, on a clean detached
checkout of the SHA.

1. Run `pnpm lint && pnpm typecheck && pnpm licence:check && pnpm test && pnpm
   build && pnpm build:server && pnpm perf:budget && pnpm e2e && pnpm
   mcp:smoke`.
2. Run `pnpm perf:lighthouse`.
3. Run `pnpm perf:lcp` three times for each of `LCP_LOCALE=en`, `zh-CN` and
   `zh-HK`.
4. Record the numbers.

Any failure means no deploy: append a `Blocked:` note with the failing
command to the candidate section and stop.

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
5. Check the remote default branch and the exact-SHA CI from the connected
   workspace, before building and again before container start.
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
4. **Failure handling.** One rollback-free retry is allowed for a check that
   fails from test-helper or timing issues. If it fails again, roll back:
   - restore the env backup and the recorded previous image identities;
   - recreate only API, worker and web;
   - additive migrations and data stay.

   Then record the failure under the candidate as `Blocked:` with the evidence
   for the build agent.

**Step 5 — record and release the lock.**

1. Append `### Frontend v2 <R1|…> upgrade checkpoint — <date>` to
   `docs/deploy.md`, in the shape of the previous checkpoints:
   - the SHA and tree, the CI links, the validation counts and performance
     numbers;
   - the backup and bundle identities;
   - the migrations applied;
   - what was replaced and what was retained;
   - every public check, and the MCP round trip without the token;
   - the neighbour and PostgreSQL preservation evidence;
   - the rollback image identities.
2. Write the acceptance receipt, set `deployment.done` to the SHA, and
   release the lock with the keeper.
3. Confirm with an independent flock probe that the lock is free and the
   runtime is healthy.
4. Push the docs-only commit to `main`.

**Step 6 — report** to the user:

- the live URL and the SHA;
- what is new to review, with the milestone report links;
- anything blocked.

Then check for the next candidate (Step 0). Repeat for every candidate until
`v0.2.0` is deployed, and tag it in the M19 release.
