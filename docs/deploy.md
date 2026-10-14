# Deployment

Taff ships as three images built from this repository plus PostgreSQL 18,
Valkey 9 and Caddy 2, wired by `compose.prod.yaml`. One host with Docker
Compose runs everything; the same images work on any container platform.

## Images

| Image | Dockerfile | Runs |
| --- | --- | --- |
| `taff-api` | `deploy/Dockerfile.server` (`TARGET=api`) | `node dist/api.mjs`: REST, `/mcp`, WebSocket hub. The same image runs `node dist/migrate.mjs` before the API starts. |
| `taff-worker` | `deploy/Dockerfile.server` (`TARGET=worker`) | `node dist/worker.mjs`: BullMQ digest scans and retries. |
| `taff-web` | `deploy/Dockerfile.web` | Next.js standalone server on port 3000. |

`pnpm build:server` bundles the API, worker and migrator with esbuild; workspace
packages are inlined and npm packages come from a flat production
`node_modules` produced by `pnpm deploy` under `dist/runtime/{api,worker}`.
The API can also run locally as `node --env-file=.env dist/runtime/api/api.mjs`.
The production dependency trees reject Lighthouse and axe-core; Docker build
context excludes local dependency trees, build outputs and environment files.
The web image bakes
`API_INTERNAL_URL=http://api:3001` into its rewrites; behind Caddy the `/api`
and `/mcp` paths go straight to the API and never reach Next.js.
Compose also supplies that URL at runtime for the authenticated server render.
Its `/api/bootstrap/today` read supplies authenticated Today data without
renewing sessions; `/api/bootstrap` remains the Me-only fallback. The browser's
`/api/me` request confirms identity before writes and receives any renewal
cookie. Matching confirmation retains server reads for reconciliation;
account or access changes purge them. See [ADR 0012](adr/0012-authenticated-today-bootstrap.md).
If the internal
API is unavailable, the web page retains its client loading and retry behavior.

## First deployment

1. Install Docker with Compose on the host and point DNS at it.
2. Clone the repository and create `.env.production` from
   `.env.production.example`. `AUTH_URL` is the public origin
   (`https://taff.example.com`), `SITE_ADDRESS` the host Caddy should serve
   (automatic HTTPS) or `:80` behind another TLS terminator. Generate
   `AUTH_SECRET`, `TOKEN_PEPPER` and `POSTGRES_PASSWORD` with
   `openssl rand -hex 32`.
3. Build and start:

   ```sh
   docker compose --env-file .env.production -f compose.prod.yaml build
   docker compose --env-file .env.production -f compose.prod.yaml up -d
   ```

   `migrate` runs first and exits; `api`, `worker` and `web` start once it
   succeeds; Caddy publishes 80 and 443.
4. Open `AUTH_URL`, create the first account, then open Me → MCP server to
   issue agent tokens. The MCP endpoint is `AUTH_URL/mcp` with
   `Authorization: Bearer <token>`.

## Upgrades

```sh
git pull
docker compose --env-file .env.production -f compose.prod.yaml build
docker compose --env-file .env.production -f compose.prod.yaml up -d
```

Migrations are additive and run before the new API starts. Take a backup
first: `umask 077; docker compose --env-file .env.production -f compose.prod.yaml exec -T postgres pg_dump -U taff taff > backup.sql`. Keep the dump private.

The task-reference upgrade applies both 0021 and 0022 before replacing the API.
0022 assigns missing task numbers for previous API images, preserving task
creation during the upgrade and after an image rollback. Keep both additive
migrations and their data when restoring images; see [ADR 0011](adr/0011-task-number-image-rollback.md).

## Apuch server layout

The requested deployment uses a separate Docker Compose project, `taff`, on
`ins-ag5pnvc0` (private `10.206.103.6`, public `146.56.215.142`). PostgreSQL
stays on `ins-nx2vm7pc` at `10.206.103.13:5432`; use a dedicated `taff` role
and database, with no access to the other applications' databases.

Copy `.env.production.example` to a private, mode-0600 `.env.production`.
Set `AUTH_URL=https://taff.apuch.cn` and a URL-encoded password in
`DATABASE_URL`, using the certificate DNS name `postgres01.internal.apuch.art`
and retaining `sslmode=verify-full`. The migrator, API and worker map this name
to `10.206.103.13` with Compose `extra_hosts`, so both certificate identity and
private routing are preserved. Keep the DNS name in the URL: the installed
Postgres.js client does not set TLS `servername` for an IP literal, which can
make Node verify `localhost` instead of the requested database host.
Copy only the public
`/srv/postgresql/tls/ca.crt` from the PostgreSQL host to
`/srv/taff/secrets/postgresql-ca.crt` and set `POSTGRES_CA_FILE` accordingly.
The app, worker and migrator mount this CA read-only and trust it via
`NODE_EXTRA_CA_CERTS`; the PostgreSQL host requires TLS.
Generate independent `AUTH_SECRET` and `TOKEN_PEPPER` values.
`POSTGRES_PASSWORD` is unused by this layout but remains required while Compose
parses the base file. Set `TAFF_TAG` to the exact released Git SHA.

```sh
docker compose --env-file .env.production -f compose.prod.yaml -f compose.apuch.yaml build --builder default
docker compose --env-file .env.production -f compose.prod.yaml -f compose.apuch.yaml up -d
```

The explicit default builder uses this host's existing Tencent registry mirror.
It leaves the builder selected for neighboring projects unchanged.

If the host cannot reach GitHub, relay a Git bundle from the clean, validated
workspace over the existing SSH connection. This transfers tracked Git objects
and history, not working-tree files or runtime secrets:

```sh
test -z "$(git status --porcelain)"
git bundle create /tmp/taff-release.bundle HEAD
openssl dgst -sha256 /tmp/taff-release.bundle
```

Create the destination file without overwriting an existing artifact. Verify
the same SHA-256 on the host, run `git bundle verify` from an existing Git
checkout, then clone the bundle with `--no-checkout` into the new release path.
Check out the pinned 40-character SHA with `--detach`, verify `HEAD` and a clean
tree, and set `origin` back to `https://github.com/ksamint/taff01.git`.
The controller must check the remote default branch and exact required CI from
the connected workspace while holding the host deployment lock, both before
building and again before container startup. The host's direct GitHub connection
is not used for these checks. Retain the same isolated Compose build, migration,
readiness, HTTPS/DNS smoke and scoped rollback procedure.

The override disables the bundled PostgreSQL service and removes published
ports. Only Taff's Caddy container joins the existing `tableai-can01-edge`
network, with alias `taff-caddy`. API, worker, web and Valkey use Taff's own
network. The override builds a separate worker image.

The host already serves other applications on ports 80/443 through Traefik.
After verifying Taff's containers and migrations, install
`deploy/taff-traefik.yaml` as a new file in
`/srv/tiansight/traefik/dynamic/`; the existing watcher picks it up without a
proxy restart. It routes only `taff.apuch.cn` and uses the existing `dnspod`
certificate resolver. Add the DNSPod A record `taff.apuch.cn → 146.56.215.142`.
Verify HTTPS, `/api/health`, sign-in and a task write through the public origin.

For a first-deployment rollback, remove only the new Taff route file and DNS
record, then stop this Compose project. Preserve the PostgreSQL database,
role and volumes. For upgrades, retain the previous image tags and restore
those tags if health checks fail; additive migrations remain in place.

`ins-aj5kmjag` hosts Neo4j Community at private `10.206.103.5:7687`.
The current app has no Neo4j driver or graph data model, so no graph connection
is claimed or configured. Graph functionality and its isolation need an explicit
scope decision before changing that shared service.

### Deployed checkpoint — 2026-10-09

The first public checkpoint at `https://taff.apuch.cn` served release
`ef7f52c3052db173d2e56ec7828d0ed400092c8e` from
`/srv/taff/releases/ef7f52c3052db173d2e56ec7828d0ed400092c8e` on
`ins-ag5pnvc0`. Its separate `taff` project runs web, API, worker, Caddy and
Valkey; the one-shot migrator exited successfully. The private runtime env and
public PostgreSQL CA live under `/srv/taff/secrets/`. No Taff container publishes
a host port. Only Taff's Caddy joins the shared edge network.

DNSPod's A record points to `146.56.215.142` with a 600-second TTL. The route
file is `/srv/tiansight/traefik/dynamic/taff.yaml`. Trusted HTTPS, public health,
signup, sign-in/out, task create/read/update, rejected foreign origins and
WebSocket-driven UI updates passed through the public origin. PostgreSQL uses
the dedicated `taff` database and role on `ins-nx2vm7pc`; authenticated app
connections used TLS 1.3. All six neighboring containers retained their IDs,
start times and health, and PostgreSQL was not restarted. The deployment lock
was released after verification. Neo4j integration remains pending the graph
scope decision above.

The exact deployed commit passed local validation and both required GitHub CI
runs: [feature 37923784208](https://github.com/ksamint/taff01/actions/runs/37923784208)
and [main 37924781365](https://github.com/ksamint/taff01/actions/runs/37924781365).
The later documentation checkpoint does not change the running release.

### Live SMS upgrade checkpoint — 2026-10-10

The public site now serves `41ae94ffbcf466a0f4f0cddd8aca4456621138e3`.
Its unchanged all-nine validation passed 428 unit/integration tests, 96
production browser cases and MCP smoke. Both exact-SHA CI runs passed:
[main 37954047982](https://github.com/ksamint/taff01/actions/runs/37954047982)
and [feature 37954048010](https://github.com/ksamint/taff01/actions/runs/37954048010).
Today initial JavaScript is 191,578 gzip bytes; Lighthouse EN/CN/HK performance
is 98/98/98, accessibility 96 and best practices 100. Separate default
three-run LCP medians are 544/544/560 ms.

The upgrade used the existing deployment lock and publisher, with a dedicated
Taff database backup and an exclusive private environment backup. The additive
0019 migration completed before only API, worker and web were replaced. Existing
route/DNS, database/role, Caddy and Valkey were retained. Eight neighboring
services and Caddy/Valkey preserved their image identities, start times and
health; PostgreSQL was unchanged, with nine Taff connections using TLS.
The deployment lock was released after verification.

Public checks passed for existing email login, task writes, Secure/HttpOnly
cookies, foreign-origin rejection, mobile Today, realtime and sign-out/sign-in.
SMS availability is true. The mobile blank-phone SMS form check passed without
JavaScript errors. Provider read-only checks confirmed the approved sign,
approved one-parameter template and package-query readiness. Exactly one
explicitly authorized application SMS request was accepted, and carrier status
was confirmed as `SUCCESS`. Real OTP login has not yet been verified: the
original code expired before local session verification completed. No additional
SMS was sent; delivery success does not establish successful login.

For a live-release rollback, restore the backed-up environment and verified
previous image identities, then recreate only API, worker and web. Retain the
route, DNS, database/role, additive migration/data, Caddy, Valkey and neighboring
services. First-deployment route/DNS removal is not a live-upgrade rollback.

### Prototype UI release candidate for review — 2026-10-11

Candidate `828443e23c2e08a1f1936aa1dbb23380db496b52` passed all nine local
checks, strict Lighthouse and three-run LCP in EN/CN/HK. Both required CI runs
are green: [feature 38075126595](https://github.com/ksamint/taff01/actions/runs/38075126595)
and [main 38075126547](https://github.com/ksamint/taff01/actions/runs/38075126547).
The reviewed native visual baselines are integrated and the final Git bundle
is staged and verified on the host. Full counts, performance samples, source
and bundle identities are in the
[candidate checkpoint](milestones/10-ui-parity.md#candidate-validation-and-staging-checkpoint--2026-10-11)
and [sanitized review evidence](ui/review-2026-10-11/release-candidate.json).

This is a pre-deployment checkpoint. The publisher has not started and the
live runtime remains `55b315b743a18113bed864191eb74c6f1d997d9b`, confirmed
during staging. The candidate's backups, migration, container replacement and
upgraded public acceptance have not run. Two fresh authenticated reads found
zero agents and review items in the verification workspace, so the required
real Inbox approval is blocked pending a usable fixture or an explicit change
to that acceptance requirement. No production fixture was seeded.

Resume with fresh current-main and exact-SHA CI checks under the deployment
lock, dedicated database/exclusive env backups, default-builder builds, one-shot
0021/0022 and scoped API/worker/web replacement. Complete the required EN/zh-HK
phone/desktop public checks and preservation checks before appending the actual
Prototype UI upgrade checkpoint and releasing the lock. Rollback keeps the
additive migrations/data and restores the exclusive env backup and verified
previous API/worker/web image identities; recreate only those three services.

### Prototype UI upgrade checkpoint — 2026-10-11

Released `828443e23c2e08a1f1936aa1dbb23380db496b52` over the actual running
`55b315b743a18113bed864191eb74c6f1d997d9b`. Under the native deployment lock,
the release was an ancestor of remote `main` (`21a3372`) and its non-`docs/`
diff was empty. Both exact-source CI runs passed:
[feature 38075126595](https://github.com/ksamint/taff01/actions/runs/38075126595)
and [main 38075126547](https://github.com/ksamint/taff01/actions/runs/38075126547).
The nine local checks passed 492 tests in 46 files, 123 browser cases and MCP
smoke. Initial Today JavaScript is 195,718 gzip bytes. Strict Lighthouse
EN/CN/HK performance is 100/99/99, accessibility 96 throughout and best
practices 100 throughout. Three-run LCP medians are 704/780/772 ms.

The dedicated Taff custom-format database backup was verified with
`pg_restore --list` (123,726 bytes), and the prior private environment was
backed up exclusively with mode 0600. The staged bundle hash and prerequisite
bundle were verified before the detached, clean checkout and explicit default
builder. The one-shot migrator exited 0; the journal contains the exact 0021
and 0022 hashes. No task number or workspace key is NULL, no workspace has
duplicate task numbers, and the legacy-write numbering trigger is installed.
Only API, worker and web were replaced, using their recorded immutable images.
The API is healthy and the worker reports ready.

Public acceptance passed in English and Traditional Chinese (Hong Kong), at
390×844 phone and 1280×800 desktop viewports: existing email login,
sign-out/sign-in, Today timeline/due list/FAB, real Quick Add references in
Today/Projects/detail/search, desktop pointer board drag, phone touch column
scrolling, calendar list and schedule editor, Inbox tabs/unread count and an
existing real digest row, Me language/appearance, two-browser realtime updates,
Secure/HttpOnly cookies, foreign-origin rejection and unchanged SMS availability.
Fresh invitation recipients landed on `/` with the token removed before and
after sign-up and accepted the invitation through the UI. Verification records
are retained. There were no browser JavaScript exceptions; a focused console
diagnostic found only the expected unauthenticated `/api/me` 401. Private test
navigation errors were corrected before the accepted runs; no runtime repair or
rollback was needed. [Sanitized public evidence](ui/review-2026-10-11/public-upgrade.json)
records each case and the runtime preservation checks.

The revised goal withdraws the live MCP evidence/Inbox approval check for this
first release. No agent exists in the verification workspace, so a task-specific
Inbox reference is also not present and is **not claimed verified** here; it
will be checked with the real review in step 6. The released browser suite covers
the review flow. No production seed or agent copy was performed.

Caddy, Valkey, every neighboring container, the route file, DNS, private env
values except `TAFF_TAG`, and the external database/role were retained. Their
identities, start times and health were checked against the locked baseline.
PostgreSQL was not restarted; all 12 Taff connections observed used TLS and the
dedicated role. DNS remains `146.56.215.142` and trusted public HTTPS health is
200. The env remains mode 0600 with `TAFF_TAG` pinned to the released SHA.

Rollback restores `/srv/taff/secrets/.env.before-828443e23c2e08a1f1936aa1dbb23380db496b52`
and the verified previous API/worker/web images, then recreates only those three
services from the previous detached checkout. Retain additive 0021/0022 and
data, PostgreSQL/role, Caddy, Valkey, neighbors, DNS and the route. Verify the old
health and preservation checks before releasing the lock. No rollback occurred.
The lock was released after verification on 2026-10-11, before this documentation
commit and the agent-creation follow-up.

## Operations

### Production verification account

- Username: `taff_verify`.
- Workspace: `Taff verification`.
- Credentials: 1Password vault `Codex Automation`, item
  `Taff production verification account`.

### Username and administrative setup

Sign-in accepts email or a 2–30 character ASCII username (letters, digits,
underscores and dots; case insensitive). Public signup offers an optional
username and retains its eight-character password rule. Private deployment
provisioning can configure a six-character credential; it does not reset an
existing account's password.

After the additive 0020 migration, use the immutable API image's private CLI
with a mode-0600 JSON file supplied through stdin. Run from the accepted release
directory on the application server:

```sh
docker compose --env-file /srv/taff/secrets/.env.production \
  -f compose.prod.yaml -f compose.apuch.yaml run --rm --no-deps -T \
  api node dist/administration.mjs < /private/path/administration.json
```

The validated input has `workspaceNames`, canonical `systemAdminPhones`, and
`orgAdmin: { username, password, workspaceName }`; the scoped workspace must be
included in the organization list. Keep actual identity/password values out of
the repository, shell arguments and reports. The operation is atomic and
idempotent for identical input; conflicting ownership or credentials fail
without reassignment or password reset. Its output contains only IDs and
organization names. Remove the temporary private input after verification.

System administrators receive protected real admin memberships in every
existing and future organization, including personal workspaces. The scoped
organization administrator receives its target membership and its usual
personal workspace. New phone identities remain unverified until their holders
complete SMS login; this CLI does not send SMS. No public HTTP/MCP adapter
exposes this setup operation.

### Invitation email and independent ownership verification

Set `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` and `EMAIL_FROM` together
for SMTP. `EMAIL_FROM` is a mailbox address; `EMAIL_PORT` defaults to 465 and
`EMAIL_SECURE` to true. For STARTTLS set the provider's port and
`EMAIL_SECURE=false`; TLS is still required and certificates verified.
Partial SMTP credentials fail startup. Only API receives these variables.
Nodemailer 10.1.0 is MIT-0 and its development types are MIT (ADR 0013).

Invitation creation commits before attempting delivery. Its response reports
`emailDelivery` as sent, logged or failed and preserves the copyable invite
link even when SMTP fails. SMTP acceptance does not prove inbox delivery.
Recipients must independently verify ownership of the invited address before
joining. Me and the pending invitation expose the verification request; the
one-hour verification link is consumed from a fragment and sent as JSON.
Existing email/password, username and SMS login remain available.

With SMTP unset, the development fallback writes messages to
`EMAIL_LOG_PATH` (default `.taff-mail/messages.jsonl`) in a private directory
and mode-0600 regular file. That file contains secret verification links:
keep it outside version control and restrict access. Ordinary application
logs record delivery status only. The production API image has a private
node-owned `/app/.taff-mail` directory; its default sink is container-local
and disappears when the container is replaced. Use SMTP for real recipient
delivery. No public endpoint exposes fallback messages or bypasses email proof.
Both env examples and production Compose list the settings; configuring SMTP
for a future live release is separate from this source preparation.

### Optional Tencent SMS login

Configure `TENCENT_SECRET_ID`, `TENCENT_SECRET_KEY`, `TENCENT_SMS_SDK_APP_ID`,
`TENCENT_SMS_SIGN_NAME` and `TENCENT_SMS_TEMPLATE_ID` together from the approved
SMS secret manager. Never copy a personal Tencent CLI profile into production.
`TENCENT_SMS_REGION` defaults to `ap-guangzhou`. Empty credentials disable the
SMS method; a partial configuration fails startup. Only the API needs these
values. Preserve the private env file's unrelated values and mode 0600.

Before enabling, use the dedicated SMS identity to confirm the configured
application, approved sign, approved one-parameter template and package-query
readiness. Apply the additive migrations and deploy the validated release
through the existing publisher. Verify health, existing email login and
`GET /api/auth/methods` returning `{"smsEnabled":true}`. Test real delivery only
with an explicitly authorized recipient; never send to fixture numbers.

SMS supports mainland `+86` mobile numbers. First verification creates a
separate phone account; existing email accounts are not automatically linked.
Reverse-proxy users share conservative socket-peer rate limits until a trusted
client-IP chain is explicitly configured. See [ADR 0009](adr/0009-tencent-sms-login.md).

For configuration rollback, retain the previous env backup and image tags.
Remove all five SMS values together, recreate only the API when the release
itself is unchanged, then verify email login and SMS availability is false.
Keep the additive schema and data.

- Health: `GET /api/health` on the API; Caddy proxies it at `AUTH_URL/api/health`.
- Logs: `docker compose -f compose.prod.yaml logs -f api worker web caddy`.
  pino redacts cookies, authorization headers, passwords and tokens.
- Rate limit: `MCP_RATE_LIMIT` calls per token per minute, counted in Valkey.
  Valkey holds only counters and queue state; it may be emptied at any time.
- Data lives in the `postgres18_data` volume. Caddy keeps certificates in
  `caddy_data`.
- Scaling: the API hub fans out database notifications to its own sockets, so
  run one API replica per deployment until a shared bus is added.

## Build and runtime settings

- `ASSET_VERSION` (web build argument, optional): the stamp on the service
  worker URL, its cache name and the locale URLs. It defaults to the build
  time, so every image build invalidates the previous worker cache; set it to
  the commit SHA for reproducible builds.
- `API_HOST` (API runtime): the interface the API binds. The server image sets
  `0.0.0.0` so Caddy can reach it; outside a container it stays on loopback.
- `MIGRATIONS_DIR` (migrator runtime): the server image sets
  `/app/migrations`; the repository layout needs no value.
- `pnpm perf:lcp` runs in CI against the bundled API and production web build
  in EN, CN and HK, three samples each; a median above 2,000 ms fails. Also
  measure on a quiet machine before a release.

## Not configured yet

- OAuth 2.1 for `/mcp`: personal access tokens are the only credential.
- Push notifications: digests are in-app pages.

## Agent creation upgrade checkpoint — 2026-10-11

Released source `23387723f8c438d990db00d561cba2899f48ab80` (tree
`081ade25b8525a090afd4aee2ff1a181d7118ffb`) adds workspace-admin agent
creation through Team and the strict, human-only REST adapter. Agent membership
is fixed to member, with no linked user; creation emits one activity and change
notification. Agent-profile identity and null-supervisor rendering are corrected.

Exact-source [feature CI](https://github.com/ksamint/taff01/actions/runs/38101185018)
and [main CI](https://github.com/ksamint/taff01/actions/runs/38101185022)
passed checks and images. All local validation commands passed: 500 tests in
47 files, 132 browser cases and official MCP smoke. Initial mobile Today JS is
195,767 bytes gzipped. Lighthouse performance/accessibility/best practices are
100/96/100 in all three locales. Slow-4G LCP samples and medians, in ms:

| Locale | Samples | Median | Budget |
| --- | --- | ---: | ---: |
| EN | 692 / 696 / 680 | 692 | 2,000 |
| CN | 776 / 784 / 780 | 780 | 2,000 |
| HK | 888 / 772 / 776 | 776 | 2,000 |

The [native capture run](https://github.com/ksamint/taff01/actions/runs/38101198542)
passed all 64 cases and produced 86 PNGs for this exact source and workflow.
77 match approved baselines byte for byte, including all four Team captures;
nine have only inspected 3–30-pixel antialias/corner differences. Existing
baselines and thresholds stay. The earlier Docker-font capture was discarded
before publication; its evidence remains marked superseded, not validated.

Under the existing native deployment lock, the dedicated Taff database dump
was verified with `pg_restore --list`: 137,727 bytes, SHA-256
`b2a74f883fda5633e8a5793975097ef5c33cb53649d9b10057c98a9ba78fe21a`,
at `/srv/postgresql/backups/taff-before-23387723f8c438d990db00d561cba2899f48ab80/taff.dump`.
The exclusive env backup is `/srv/taff/secrets/.env.before-23387723f8c438d990db00d561cba2899f48ab80`.
The 25,804-byte Git bundle was relayed and verified, SHA-256
`e0475288ac7290ba4059587d2656dfdad1f07b4ea76bfaee18f12b870927dd1c`.
The existing SSH relay disconnected before migration; fresh inspection proved
no migration or replacement had started. The same native lock was reacquired
for the same candidate, backups and attempt, with a detached keeper to survive
SSH disconnects. No route, host layout or database role changed.

The detached clean source was built using the explicit default builder. The
one-shot migrator exited 0. Both existing additive migration journals match;
missing task numbers, missing workspace keys and duplicate task numbers are
zero. Only API, worker and web were replaced. Their immutable image IDs are
recorded in [sanitized release evidence](ui/review-2026-10-11/agent-public-upgrade.json).
Caddy, Valkey, route, DNS and neighbouring container identities, start times
and health stayed intact. PostgreSQL was not restarted; Taff connections use
TLS and its dedicated role. `TAFF_TAG` is the released SHA; all other private
env values and mode 0600 are preserved. Health and SMS-method discovery passed.

All four public-origin cases passed: EN/HK on phone and desktop, email
sign-out/sign-in, real task references DE-10–DE-13 in Today/Projects/detail/search,
desktop board drag and phone native scrolling, calendar scheduling/list/editor,
Inbox counts/tabs/digests, Me preferences, realtime between two browsers,
fresh-browser invitation fragment clearing, Secure/HttpOnly cookies and
foreign-origin rejection. There were zero browser page errors. These human
quick-add tasks had no Inbox review item; the separate agent check below
supplies the required actual Inbox task-reference acceptance.

The withdrawn flow now passes publicly: Team created a real agent, quick add
assigned task DE-15, the human started its run and issued a token from Me → MCP.
The official SDK discovered 20 tools, reported exactly one `runs.event`, attached
one actual discovery-result artifact and called `runs.submit` once with review
requested. Inbox displayed DE-15; the human checked the evidence and approved.
The run became completed and the task Done. Me revoked the token; a subsequent
authenticated MCP initialize received HTTP 401. SDK/browser cleanup and original
locale, time zone, appearance and workspace restoration passed. No SMS was
sent, production seed run or agent copied from another workspace.

The first agent attempt also persisted approval of DE-14, then its private
helper asserted a standalone-page status label in the embedded drawer. A
read-only diagnosis confirmed completed/Done and all three checks true. The
helper assertion was corrected; the one permitted rollback-free retry passed
the entire flow, including UI revocation. The first token was revoked by the
failure cleanup. Both agents/tasks/artifacts remain as verification evidence.

Rollback retains source and image identities of `828443e23c2e08a1f1936aa1dbb23380db496b52`:
API/migrator `sha256:fdea97ab658541f0bda317421925a873f68853263550146f8b8eb413dc520819`,
worker `sha256:b331e9d5b38ef793d8c5d11a3c8857f25e9dcad30ac27eef428e0d3347c650ee`,
web `sha256:99e116322e7d3b63ff9c8a306140cbd37ea3e76a11b0e797bf8a651bd0c70b60`.
Under the existing lock, restore the exclusive env backup and recreate only
API, worker and web from those retained images. Keep additive migrations and
data; the dump is recovery evidence, not an automatic destructive restore.
No rollback was needed. Lock-release verification is recorded below after the
acceptance receipt is written. Continue M9 at the existing Lighthouse evidence
and the missing all-locale LCP CI guard.

After the complete public acceptance, the verified receipt was written and
`deployment.done` set to the accepted SHA. The detached keeper logged
`LOCK_RELEASED` and removed its owner file. An independent nonblocking native
flock probe then acquired the same lock and confirmed the accepted runtime
images were still running and API healthy. The lock is free. This checkpoint
is a documentation-only commit ahead of the accepted source.

## Release candidate checks

Every frontend v2 candidate passes the plan §6.0 checklist
(`e2e/release/checklist.spec.ts`, `playwright.release.config.ts`) twice:
against a local production-mode stack before the candidate section is
written, and against the live origin after the deploy. It never starts
servers; it drives whatever `RELEASE_BASE_URL` points at.

**Local production-mode stack, without Docker image builds.**
`scripts/release-stack.mjs` (`pnpm release:stack`) runs the bundled API from
`pnpm build:server` (`dist/runtime/api/api.mjs`, as `deploy/Dockerfile.server`
does) and the Next standalone server (`apps/web/.next/standalone/apps/web/server.js`,
as `deploy/Dockerfile.web` does, with `.next/static` and `public` copied
beside it), both with `NODE_ENV=production`. `next start` is not used: it
warns under `output: "standalone"`.

```sh
# Ports default to 3000/3001 and the database to DATABASE_URL from .env.
pnpm release:stack --build --migrate --seed   # --worker also starts the worker
```

- `--build` runs `pnpm build` and `pnpm build:server`. Next bakes the `/api`
  and `/mcp` rewrite target (`API_INTERNAL_URL`) into the build, so the script
  refuses a build made for another API URL; rebuild after changing it.
- On other ports or another database, export the values first; exported
  variables win over `.env`:

  ```sh
  export DATABASE_URL=postgres://…/taff_r1 API_PORT=4201 WEB_PORT=4200 \
    API_INTERNAL_URL=http://127.0.0.1:4201 AUTH_URL=http://localhost:4200 \
    EMAIL_LOG_PATH=/tmp/taff-r1/mail/messages.jsonl
  pnpm release:stack --build --migrate --seed
  ```

- `AUTH_URL` must be the browser origin: the MCP page shows `AUTH_URL/mcp` as
  the endpoint and the checklist asserts it equals `RELEASE_BASE_URL/mcp`.
- Ctrl-C stops every process the script started.

**Run the checklist.**

```sh
# Against the local stack, with full coverage of owner and role changes:
RELEASE_BASE_URL=http://localhost:4200 \
RELEASE_MAIL_LOG=/tmp/taff-r1/mail/messages.jsonl pnpm release:checklist

# Against the live origin, from the local agent:
RELEASE_BASE_URL=https://taff.apuch.cn \
RELEASE_DEMO_EMAIL=<verification account> RELEASE_DEMO_PASSWORD=<from the private env> \
pnpm release:checklist
```

- Projects: `phone-en`, `phone-zh-HK` (Pixel 7) and `desktop-en`,
  `desktop-zh-HK` (1280×800); `--project` selects one, `-g "item 8"` one item.
- One test per §6.0 item. Each signs up its own fresh account
  (`release-<id>@example.test`, random password) and works only in that
  account's workspace; agents are added through Team › Add agent. Nothing
  depends on the clock or on seeded counts.
- Owner and member-role changes need a second person with a verified email:
  `RELEASE_MAIL_LOG` (the local stack's `EMAIL_LOG_PATH`) lets a second fresh
  account verify itself; otherwise the `RELEASE_DEMO_*` account accepts the
  invitation (it must have a verified email). Without either, those two
  sub-steps are skipped and the reason is recorded.
- SMS is exercised only when `/api/auth/methods` reports it enabled, and then
  only up to the open form: no code is ever sent. Otherwise the step is
  recorded as skipped with the reason.
- Item 8 runs the shared MCP round trip (`apps/api/scripts/mcp-round-trip.ts`,
  the same code as `pnpm mcp:smoke`) with the official client against
  `RELEASE_BASE_URL/mcp`, using a token issued on the MCP page: every tool
  (all 30 in `MCP_TOOLS`, including `relations.get`, `brief.get` and
  `suggestions.create`),
  the rate limit (`RELEASE_MCP_RATE_LIMIT`, default `MCP_RATE_LIMIT` or 60;
  `RELEASE_SKIP_RATE_LIMIT=1` skips the probe with a recorded reason), the
  call log in the UI, the created task arriving on an open board in real
  time, and revocation from the UI. The probe sends at most limit + 2
  requests on the run's own throwaway token; where the deploy goal says not
  to probe production, set `RELEASE_SKIP_RATE_LIMIT=1`.
- Tokens, passwords and cookies are never printed: the token is asserted by
  its `taff_` prefix only, traces and screenshots are off (`RELEASE_DEBUG=1`
  turns them on for local debugging only), and the report is redacted.
- The report lands in `release-reports/checklist-<timestamp>.{json,md}`
  (gitignored): each item × project with pass, fail or skip-with-reason,
  durations, skipped sub-steps and the MCP checks. Paste the Markdown table
  into the candidate section.
- Optional: `RELEASE_WORKERS` (default 1), `RELEASE_RETRIES` (default 0),
  `RELEASE_REPORT_DIR`.

## Frontend v2 releases

Frontend v2 (`docs/frontend-v2-plan.md`) is released in stages. The cloud
build agent appends a `### Frontend v2 release candidate <name> — <date>`
section here for each validated `main` SHA. The local agent deploys it with
`docs/agent-goal-deploy-frontend-v2.md`. Then it appends the matching
`### Frontend v2 <name> upgrade checkpoint — <date>`, or a `Blocked:` note
under the candidate.

### Frontend v2 release candidate R1 — 2026-10-14

**Source.** `main` at `5e616dd27bb167508155f4c5dd9bde9284538a7c`, the merge of
PR #10 (M14). It includes PR #7 (M12), PR #9 (M13) and PR #10 (M14) on top of
the last recorded deployment, `23387723f8c438d990db00d561cba2899f48ab80`
(agent creation upgrade checkpoint, 2026-10-11).

**CI.**

- Pull requests:
  - [PR #9 CI](https://github.com/ksamint/taff01/actions/runs/38512986433)
  - [PR #10 CI](https://github.com/ksamint/taff01/actions/runs/38519911336)
- `main` CI:
  - [after #9](https://github.com/ksamint/taff01/actions/runs/38514991407)
  - [after #10](https://github.com/ksamint/taff01/actions/runs/38521546475)
- Visual baselines on CI's Chromium:
  - [M13 capture](https://github.com/ksamint/taff01/actions/runs/38512400959)
  - [M14 capture](https://github.com/ksamint/taff01/actions/runs/38519032163)

**What changes for people.**

- **Navigation (v2 shell):**
  - phone: a four-tab bar (今天 · 日曆 · 項目 · 我的);
  - desktop: a foldable sidebar;
  - signed out: a landing page.
- **Screens:** Today, Me, Inbox and MCP use the v2 layouts.
- **Projects:** the v2 board and list.
- **Task detail:** contacts, and a right panel on desktop.
- **Calendar:** the v2 calendar.
- **Search:** ⌘K also finds companies and contacts.
- **Undo:** toasts with undo on both layouts.
- **Backend only for now:** planning and CRM (M12). Its screens arrive with
  later candidates.

Reports:

- `docs/milestones/12-planning-crm-backend.md`
- `docs/milestones/13-shell-today-me.md`
- `docs/milestones/14-projects-task-calendar-search.md`

**Validation numbers** (M14 head, then `main`).

| Check | Result |
| --- | --- |
| lint, typecheck, licence | green |
| unit and integration tests | 683 / 683 |
| e2e | 141 / 141 |
| visual suite | 16 screens × 4 projects |
| Today initial JS | 193,325 B gzipped / 204,800 B budget |
| Today LCP (median of 3, slow 4G, 4× CPU) | en 792 ms, zh-CN 1020 ms, zh-HK 980 ms (limit 2000 ms) |
| Lighthouse (performance / accessibility / best practices) | en 92/100/100, zh-CN 93/100/100, zh-HK 94/100/100 |
| `pnpm mcp:smoke` against the production-mode stack | passed |

**Migrations.** One new migration, `0023_m12_planning_crm.sql`. It is
**additive**, with no backfill (0 rows rewritten):

- **New tables:** 10, all workspace-scoped, with composite foreign keys and
  `_audit` triggers: companies, contacts, company_contacts,
  project_contacts, task_contacts, contact_roles, task_plans, milestones,
  task_dependencies and project_payments.
- **New project columns:** three nullable ones (`contract_amount`,
  `currency`, `client_company_id`).
- **New unique constraint:** `tasks (workspace_id, id, project_id)`, which
  builds an index on `tasks`.
- **Checks:** a role-rule CHECK on contact_roles.
- **Nothing destructive:** no `DROP`, `TRUNCATE`, `DELETE`, rename or data
  rewrite.

**Environment.** No new variables for frontend v2. Since `2338772`, these
settings are new or changed:

- **`EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`:** optional
  and all-or-none. Unset, mail goes to the private log at `EMAIL_LOG_PATH`.
  `EMAIL_PORT` (465) and `EMAIL_SECURE` (true) only apply with SMTP.
  Partial settings stop the API at start.
- **`EMAIL_LOG_PATH`:** defaults to `/app/.taff-mail/messages.jsonl` in the
  image. Its directory must be mode 0700 and owned by the API user, or
  delivery fails closed.
- **`AUTH_URL`:** an existing variable, now also passed to the web
  container. The MCP page shows `AUTH_URL/mcp` as the client endpoint, so it
  must be the public origin.

No secret values are recorded here.

**Compose, Docker and Caddy.**

- **`compose.prod.yaml`:**
  - the API receives the `EMAIL_*` settings above;
  - the worker uses its own image, `${TAFF_IMAGE_WORKER:-taff-worker}`,
    built from `deploy/Dockerfile.server` with `TARGET=worker`;
  - web receives `AUTH_URL`.
- **`deploy/Dockerfile.server`:** creates `/app/.taff-mail` as 0700, owned
  by `node`.
- **Caddy:** no changes.

**Release checklist (plan §6.0)** against a local production-mode stack built
from `5e616dd`:

- **Stack:** `pnpm release:stack --build --migrate --seed` on a fresh
  database, API on 4201 and web on 4200. That is
  `dist/runtime/api/api.mjs` and the Next standalone server with
  `NODE_ENV=production`.
- **Command:** `RELEASE_MAIL_LOG=… pnpm release:checklist`.
- **Result: passed, 32 / 32** (8 items × phone-en, phone-zh-HK, desktop-en,
  desktop-zh-HK), 0 failed, 0 skipped.
- **Covered:** owner and role changes (a second person verifies from the
  mail log) and the rate-limit probe.
- **One sub-step skipped**, in every project: SMS sign-in, because
  `/api/auth/methods` reports `smsEnabled=false` locally. Live SMS stays
  covered by the 2026-10-10 checkpoint.
- **MCP:** each project's real `@modelcontextprotocol/client` round trip
  passed 38/38 checks, covering all 27 tools in `MCP_TOOLS`.

| Item | phone-en | phone-zh-HK | desktop-en | desktop-zh-HK |
| --- | --- | --- | --- | --- |
| 1. Sign-in and preferences | pass (SMS skipped) | pass (SMS skipped) | pass (SMS skipped) | pass (SMS skipped) |
| 2. Tasks | pass | pass | pass | pass |
| 3. Agents and review | pass | pass | pass | pass |
| 4. Projects | pass | pass | pass | pass |
| 5. Calendar | pass | pass | pass | pass |
| 6. Search and organizations | pass | pass | pass | pass |
| 7. Settings | pass | pass | pass | pass |
| 8. MCP | pass | pass | pass | pass |

**Notes for the deploy.**

- Build and push both server images (`api` and `worker`) and the web image,
  then migrate with the API image as before.
- After the deploy, run the checklist against the live origin with the
  verification account (see "Release candidate checks").

**Blocked: exact-source feature CI is missing — 2026-10-14.** Step 0 of
`docs/agent-goal-deploy-frontend-v2.md` requires both linked CI runs to be
green for the listed source `5e616dd27bb167508155f4c5dd9bde9284538a7c`.
Main run [38521546475](https://github.com/ksamint/taff01/actions/runs/38521546475)
is completed/success for that SHA. Feature run
[38519911336](https://github.com/ksamint/taff01/actions/runs/38519911336)
is completed/success for `ff6f05b4f0e87b87b206acdf5e1a2b27f1c932db`,
not the listed source. The exact-source run inventory contains only the main
run. The source is an ancestor of `origin/main`, and the non-documentation
diff is empty, but the required second exact-SHA CI result is absent. Publish
a corrected candidate with both exact-source CI links before deployment.
No local release validation, migration, build or container replacement was
started; production remains `23387723f8c438d990db00d561cba2899f48ab80`.

### Frontend v2 release candidate R1b — 2026-10-14

R1 republished under the corrected Step 0 CI rule. The source is unchanged:
`5e616dd27bb167508155f4c5dd9bde9284538a7c` (`main`, the merge of PR #10).
The R1 section above holds everything else: scope, validation numbers,
migrations, env, Compose, checklist and local production-mode result.

R1 was blocked because the rule asked for a feature run on the exact merge
SHA, which a merged PR never has. The rule now accepts:

- **`main` push CI on the exact SHA:**
  [38521546475](https://github.com/ksamint/taff01/actions/runs/38521546475),
  completed/success. The local agent confirmed this in the block note.
- **PR #10 CI on its head:**
  [38519911336](https://github.com/ksamint/taff01/actions/runs/38519911336),
  completed/success. The head is `ff6f05b4f0e87b87b206acdf5e1a2b27f1c932db`,
  an ancestor of the source.

Everything after the source on `main` touches only `docs/`.
