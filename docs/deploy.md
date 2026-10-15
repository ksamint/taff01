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

**Blocked: local `pnpm e2e` readiness failure — 2026-10-14.** R1b passed
the revised Step 0: main CI is green for source
`5e616dd27bb167508155f4c5dd9bde9284538a7c`, PR CI is green for its ancestor
`ff6f05b4f0e87b87b206acdf5e1a2b27f1c932db`, and the source-to-main code
diff is empty. In a clean detached checkout on Node 24.19.0, local lint,
typecheck, licence, 683 tests in 67 files, build, build:server and perf:budget
passed; Today initial JavaScript is 193,190 bytes gzipped (204,800 limit).
The deploy agent interrupted a local readiness setup to set the web port,
but its detached API helper remained running. `pnpm e2e` then exited 1:
`http://127.0.0.1:4601/api/health is already used`. No browser cases ran.
This is a local deploy-helper failure, not evidence of an application defect;
the checkout-owned API/web helpers have been stopped and the ignored local
environment now explicitly sets `PORT=4600`. Step 1 requires stopping on a
failed command, so MCP smoke, Lighthouse, LCP and production deployment were
not run. Publish a fresh unblocked candidate to repeat the complete local
validation. No production lock, backup, migration, image build or container
replacement was started; the live SHA is still
`23387723f8c438d990db00d561cba2899f48ab80`.

### Frontend v2 release candidate M15 — 2026-10-14

**Source:** `main` at `8019c6943e453e087a6cfa6c48651c99b9840a9d`. This
candidate supersedes R1b and answers its `Blocked:` note: it contains all of
R1/R1b plus M15, so one deploy covers both.

The R1b blocker was a local helper still holding port 4601 when `pnpm e2e`
started. The application was not at fault. Before `pnpm e2e`, make sure
nothing listens on the configured API and web ports. The Playwright web
servers refuse a busy port on purpose (`reuseExistingServer` is false).

Scope since R1:

- PR #11 (`m15-crm`), merged as `7872024`.
- `main` commits after `7872024`, which touch only `docs/`.

**CI (Step 0 rule).**

- **`main` push CI on the exact source:**
  [38528200033](https://github.com/ksamint/taff01/actions/runs/38528200033).
  The run for `7872024` was cancelled by the next push to `main`.
- **PR #11 CI on its head `58ea2cb141cfdcd57791e19fe6b81603ee88143c`:**
  [38525583386](https://github.com/ksamint/taff01/actions/runs/38525583386),
  success. That head is an ancestor of the source, and the source-to-head
  diff is only `docs/agent-goal-deploy-frontend-v2.md` and `docs/deploy.md`.
- **Visual baselines and gated Lighthouse on CI's Chromium:**
  [38524514460](https://github.com/ksamint/taff01/actions/runs/38524514460).

**What changes for people.**

- **CRM screens:** companies and contacts, each with list, detail, create,
  edit and archive (archive asks for confirmation; every change has undo).
  On desktop, list and detail share a split view.
- **Stakeholders:** 相關方 at `?view=stakeholders`, with the client company
  per project.
- **Navigation:** 公司 · 聯繫人 sit under 項目 in the desktop sidebar and the
  Projects switch. They are shown only to people who can read CRM.
- **Phase B backend, ahead of its screens (M16–M18):**
  - brief and Ask taff, rules-based;
  - suggestions;
  - the relations graph;
  - mind-map APIs.
- **New MCP tools:** `brief.get`, `relations.get` and `suggestions.create`
  (30 tools in all).

Reports: `docs/milestones/15-crm-screens.md` and
`docs/milestones/16-18-phase-b-backend.md`.

**Validation numbers.**

| Check | Result |
| --- | --- |
| lint, typecheck, licence | green (PR CI) |
| unit and integration tests | 814 / 814 locally; green in PR CI |
| e2e | green in PR CI |
| visual suite | 16 screens × 4 projects, locally and on CI |
| Today initial JS | 193,457 B gzipped / 204,800 B (CI) |
| Today LCP, median of 3 (slow 4G, 4× CPU), local production build | en 640 ms, zh-CN 656 ms, zh-HK 664 ms |
| Lighthouse (gated, CI Chromium) | en 96/100/100, zh-CN 95/100/100, zh-HK 96/100/100 (performance / accessibility / best practices) |
| `pnpm mcp:smoke` against the production-mode stack | passed |

The cloud container's local Lighthouse scores were 82–91 after a host
restart. The same container measured the unchanged M14 build at 87–93,
against 92–94 before the restart. The CI run above is the gated
measurement.

**Migrations.** Two new migrations, both additive, with no backfill (0 rows
rewritten):

- **`0024_m17_suggestions_ai.sql`:**
  - a `suggestions` table, workspace-scoped, with composite foreign keys and
    an `_audit` trigger;
  - `workspaces.ai_enabled boolean NOT NULL DEFAULT false`. The default is a
    constant, so PostgreSQL stores it as metadata and does not rewrite the
    table. Every workspace starts opted out.
- **`0025_m18_mind_map.sql`:** `mind_nodes`, `mind_edges`, `mind_sources`
  and `mind_node_sources`, workspace-scoped, with composite foreign keys and
  `_audit` triggers.

Neither migration has a `DROP`, `TRUNCATE`, `DELETE`, rename or data
rewrite.

**Environment.** `.env.example` documents four optional variables, none
needed in production:

- **`ASK_RATE_LIMIT`:** Ask requests per person per minute. Default 20.
- **`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`:** the optional model path for
  Ask taff (ADR 0016). `compose.prod.yaml` does not pass them to the API, so
  in production the path stays off and no workspace data goes to any model.
  Ask answers by rules. Turning the path on would need a Compose change, all
  three values, and a workspace admin's opt-in. Do not set them for this
  deploy.

No secret values are recorded here.

**Compose, Docker and Caddy.** No changes since R1.

**Release checklist (plan §6.0)** against a local production-mode stack built
from PR head `58ea2cb`, which has the same application code as the source:

- **Stack:** `pnpm release:stack --build --migrate --seed` on a fresh
  database, API on 4201 and web on 4200.
- **Command:** `RELEASE_MAIL_LOG=… pnpm release:checklist`. The mail-log
  directory must be mode 0700.
- **Result: passed, 32 / 32**, 0 failed, 0 skipped. Owner and role changes
  and the rate-limit probe ran.
- **One sub-step skipped**, in every project: SMS sign-in, because
  `smsEnabled=false` locally.
- **MCP:** each project's `@modelcontextprotocol/client` round trip passed
  42/42 checks, covering all 30 tools in `MCP_TOOLS`.

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

- The live SHA is still `2338772`, so this deploy applies migrations 0023,
  0024 and 0025 together, in order, with the API image.
- After the deploy, run the checklist against the live origin. Because of the
  new CRM screens, check that a member without CRM access sees no 公司 ·
  聯繫人 entries.

**Blocked: local `pnpm e2e` calendar assertion — 2026-10-14.** The M15
source `8019c6943e453e087a6cfa6c48651c99b9840a9d` passed Step 0 with
main CI [38528200033](https://github.com/ksamint/taff01/actions/runs/38528200033)
and ancestor-head PR CI
[38525583386](https://github.com/ksamint/taff01/actions/runs/38525583386).
A clean detached checkout on macOS arm64, Node 24.19.0 and pnpm 12.10.1
passed lint, typecheck, licence, 814 tests in 77 files, build, build:server
and perf:budget (Today: 193,320 bytes gzipped, limit 204,800).
The browser suite completed with **154 passed, 2 failed** in 9.4 minutes.
Both failures are the `calendar phone touch, cancellation, month move, tray
scheduling, empty-slot create and list navigation` case, in **en** and
**zh-CN**, at `e2e/calendar.spec.ts:994:28`: expected a value greater than
zero, received zero. The zh-HK case passed. The API and web ports were free
before the run, agreed with the local origin settings, and the checkout-owned
helper servers were cleaned up afterward; this is not the R1b port conflict.
The failure's cause is not yet established. Step 1 forbids deployment after
a failed command, so MCP smoke, Lighthouse, LCP and production deployment
did not run. The build agent should investigate and publish a fresh candidate
with the assertion passing. Production remains
`23387723f8c438d990db00d561cba2899f48ab80`; no production lock, backup,
migration, image build or container replacement was started.

### Frontend v2 release candidate M16 — 2026-10-14 (answers the M15 calendar block)

**Source.** `main` at `78c68ab9182fa1d9bdbdd9219108f276176567db`. It is the
merge of PR #15 (calendar e2e fix) on top of PR #13 (`m16-timeline`, merged as
`4989a27`). It supersedes the blocked M15 candidate, so one deploy covers R1,
M15 and M16.

**Answer to the M15 `Blocked:` note** (`calendar.spec.ts:994`, "expected > 0,
received 0" in en and zh-CN on macOS arm64):

- **Cause:** `calendar-engine.tsx` switches to month view with
  `setView("month-grid")`. The SDK renders the month DOM on a later frame,
  and the engine itself waits for `.sx__month-grid-wrapper`. The test read
  `.sx__month-grid-day[data-date]` straight after the click, so a slower host
  could find no cells and count 0.
- **Fix (PR #15, test only):** the test now polls the grid until it contains
  today in the member's time zone, then counts. The assertion is unchanged; a
  grid that never shows today now fails with that message.
- **Validation:** `calendar.spec.ts` passed 15/15 in en, zh-CN and zh-HK with
  `TZ=Asia/Shanghai` on a fresh database.
- **Not reproduced here:** neither a browser time zone whose date differs from
  the member's (`TZ=Pacific/Honolulu`) nor full CPU load made the old test
  fail. The code path above is the only way the count can reach 0 without
  navigation.

**CI (Step 0 rule).**

- **`main` push CI on the exact source `78c68ab`:** [38544901342](https://github.com/ksamint/taff01/actions/runs/38544901342), success (pushed only after it succeeded).
- **PR #15 CI on its head `4d5a0ae8121477111010ed096b7ac9a78c8a30de`:**
  [38542333878](https://github.com/ksamint/taff01/actions/runs/38542333878),
  success. That head is an ancestor of the source.
- **PR #13 CI on its head `721887866ed725dbcea6675f5ce7dfd30d5525d7`:**
  [38538390232](https://github.com/ksamint/taff01/actions/runs/38538390232),
  success. Between that head and the source, only `docs/deploy.md` and
  `e2e/calendar.spec.ts` differ.
- **Visual baselines and gated Lighthouse on CI Chromium:**
  - [38530381663](https://github.com/ksamint/taff01/actions/runs/38530381663),
    which also ran the Lighthouse gate;
  - [38537224735](https://github.com/ksamint/taff01/actions/runs/38537224735),
    which recaptured the baselines after the fix below.

**What changes for people.**

- **Timeline (`?view=timeline`).**
  - **Display:** day and week zoom, summary bars, milestones and the critical
    path. Blocked and conflicting tasks are marked. Risk, forecast and slip
    come from the plan model.
  - **Editing:** move and resize bars; moving a parent bar moves its
    subtree. Add or remove dependencies by drag, link mode or form.
  - **Undo:** every change shows a toast with 撤銷 (undo), which calls the
    inverse API with `version`.
  - **Keyboard:** row selection, with a footer form for editing.
- **Relations graph (`?view=relations`).**
  - **Layouts:** layered and seeded-force, both deterministic.
  - **Navigation:** pan, zoom and fit, plus layer chips. The scope is this
    project or the workspace.
  - **Inspector:** reachable by keyboard, with an "as list" alternative.
- **Fix: Today opened an arbitrary workspace.** A person's default workspace
  could depend on the query plan when several workspaces were created
  together, as the seed does. `getMe` now breaks `createdAt` ties by name
  (`COLLATE "C"`), then id. Existing people may see seeded workspaces listed
  in a different order.

Report: `docs/milestones/16-timeline-relations.md`.

**Validation numbers.**

| Check | Result |
| --- | --- |
| lint, typecheck, licence | green |
| unit and integration tests | 839 / 839 (fresh database) |
| e2e | 165 / 165 (fresh database); green in PR CI |
| visual suite | 16 screens × 4 projects, green in PR CI |
| Today initial JS | 193,537 B gzipped / 204,800 B |
| Today LCP, median of 3, slow 4G, 4× CPU, local production build | en 636 ms, zh-CN 640 ms, zh-HK 640 ms |
| Lighthouse, gated, CI Chromium (performance / accessibility / best practices) | 99/100/100 in en, zh-CN and zh-HK |
| `pnpm mcp:smoke` against the production-mode stack | passed |

**Migrations.** None. The last migration is still `0025` from the M15
candidate.

**Environment.** No changes.

**Compose, Docker and Caddy.** No changes.

**Release checklist (plan §6.0).** It ran on PR #13 head `7218878` against a
local production-mode stack. That head has the source's application code:
only `docs/deploy.md` and the calendar test differ.

- **Setup:** `pnpm release:stack --build --migrate --seed` on a fresh database,
  then `RELEASE_MAIL_LOG=… pnpm release:checklist`.
- **Result: passed, 32 / 32,** with 0 failed and 0 skipped.
- **Sub-step skipped:** SMS sign-in, in every project, because
  `smsEnabled=false` locally.
- **MCP:** the `@modelcontextprotocol/client` round trip passed 42/42 checks
  over the 30 tools, in every project.

All eight items passed on phone-en, phone-zh-HK, desktop-en and desktop-zh-HK.

**Notes for the deploy.**

- If the live origin is still on `2338772`, migrations `0023`–`0025` apply
  together, as described in the M15 candidate.
- After the deploy, open a project's 時間線 (timeline) and 關係圖 (relations
  graph) views as an admin and as a member. Members must not see finance
  figures.

**Blocked: local `pnpm test` member-order assertion — 2026-10-14.** Source
`78c68ab9182fa1d9bdbdd9219108f276176567db` passed Step 0: exact-source
main CI [38544901342](https://github.com/ksamint/taff01/actions/runs/38544901342)
and ancestor-head PR CI
[38542333878](https://github.com/ksamint/taff01/actions/runs/38542333878)
are completed/success, the source is an ancestor of main, and its code diff
to main is empty. On a clean detached macOS arm64 checkout with fresh isolated
local databases, Node 24.19.0 and pnpm 12.10.1, lint, typecheck and licence
passed. `pnpm test` exited 1: **838 passed, 1 failed**, across **78 passed,
1 failed test files** (839 tests, 79 files total).
The failing test is `core PostgreSQL integration > signup provisions an
audited personal workspace and auth defaults`, at
`packages/core/src/integration.test.ts:91:7`. It compares the roster as an
ordered array `[person/admin, agent]`; the returned roster has the same two
fixture members in `[agent/member, person/admin]` order. The current
`listMembers` query in `packages/core/src/index.ts` orders by `createdAt`.
The reason that these fixture timestamps place the agent before the person
needs investigation; the ordered person-first assertion does not hold in
this local run. This needs investigation
and a fresh candidate; the deploy agent did not change tests or application
code, weaken the assertion, or retry the failed command.
Per Step 1, build, build:server, perf:budget, e2e, MCP smoke, Lighthouse, LCP
and production deployment did not run. Production remains
`23387723f8c438d990db00d561cba2899f48ab80`; no production lock, backup,
migration, image build or container replacement was started.

### Frontend v2 release candidate M17 — 2026-10-14 (answers the M16 member-order block)

**Superseded during deployment:** M18 was published while M17 was live under
the native lock. The user's effective 2026-10-14 rules require the newest
candidate to supersede an in-progress one. M17 was healthy, migrations
0023–0025 had applied, and the brief overlay passed on the live phone UI.
A proposal test failed only during harness cleanup of agent-assigned tasks;
its two residual verification tasks were completed through supported,
version-checked assignment/task APIs after repairing the helper. M17 was
not recorded as an accepted release. The same keeper retained the lock
while M18 took a fresh database/env backup and superseded it.

**Source.** `main` at `c38cde71ba7e2a5d440eed8da2052cd4fa6bb59c`. It supersedes
the M16 candidate, so one deploy covers R1, M15, M16 and M17. Since the M16
candidate's source `78c68ab`, it adds:

- **PR #14:** M17, the AI brief and Ask taff (rules-based).
- **PR #16:** an e2e fix for an intermittent `optimistic-m4` failure.
- **PR #17:** a core fix for the member-order assertion that blocked M16.

**Answer to the M16 `Blocked:` note.** The note reported
`integration.test.ts:91`: `listMembers` returned `[agent, person]`.

- **Cause:** `listMembers` ordered only by `createdAt`. Signup creates the
  person and the personal agent in one transaction, and the seed creates each
  workspace's members together, so the rows share `created_at`. The order was
  then left to the query plan.
- **Fix (PR #17):**
  - Members now order by `createdAt`, then `kind` (the enum lists person
    before agent), then `id`. The existing ordered assertion covers this.
  - Agent tokens, activity, MCP calls, invites and grants now break ties by
    `id`.

**Other fixes since M16.**

- **`e2e/optimistic-m4.spec.ts` (PR #16, test only):** it failed 5 of 36 runs
  on `78c68ab`.
  - Cause: the test removed its only route right after fulfilling a held
    request, which turns off request interception in Playwright 1.64. Chromium
    then left some already-paused app refetches hanging. The rejected
    mutation never settled, so no alert appeared and the controls stayed
    disabled.
  - Result after the fix: 45 / 45.
- **`assistant.integration.test.ts` (in PR #14, test only):** the "minimum
  context" check now masks random UUIDs before looking for the contract
  amount. A task id containing `1000` had tripped it. No finance data is
  sent.
- **Phone brief overlay (in PR #14):** closing it now returns focus to the 我的
  › AI 簡報 row. Before the fix, the production build restored focus to
  `<body>`.

**CI (Step 0 rule).**

- **`main` push CI on the exact source `c38cde7`:**
  [38553436097](https://github.com/ksamint/taff01/actions/runs/38553436097),
  success.
- **PR CI on the merged heads,** each an ancestor of the source, all success:

  | PR | Head | CI run |
  | --- | --- | --- |
  | #17 | `3cf187a0f441723b6ee7a9960cef80cd76adef73` | [38551082162](https://github.com/ksamint/taff01/actions/runs/38551082162) |
  | #16 | `9219f707e44c4c582d652aa5cb34fc4831ab3198` | [38550241804](https://github.com/ksamint/taff01/actions/runs/38550241804) |
  | #14 | `193f16cb264e09b2b06c8dfbeace67f58fc79b59` | [38547202218](https://github.com/ksamint/taff01/actions/runs/38547202218) |

- **Visual baselines and gated Lighthouse on CI Chromium:**
  - [38538826114](https://github.com/ksamint/taff01/actions/runs/38538826114):
    M17 baselines.
  - [38551080750](https://github.com/ksamint/taff01/actions/runs/38551080750):
    gated Lighthouse on PR #17's source, which includes M17.

**What changes for people.**

- **AI brief (M17).**
  - Where: on phone, 我的 › AI 簡報 opens `/brief` as a full-screen dialog; on
    desktop, it is the Me › AI 簡報 tab.
  - Content: a greeting, stat tiles, and risk and slip per project. Finance
    figures appear for admins only.
  - Suggested actions never decide anything in one tap. They open the review,
    the task or a confirm sheet.
- **Ask taff.** It answers by rules and needs no AI environment variables. The
  model path stays off in production because `compose.prod.yaml` does not
  pass the AI variables.
- **Member lists.** People are listed before agents when they were created
  together.

Report: `docs/milestones/17-ai-brief.md`.

**Validation numbers.**

| Check | Result |
| --- | --- |
| lint, typecheck, licence | green |
| unit and integration tests | 855 / 855 |
| e2e and visual suite | green in PR and `main` CI |
| Today initial JS | 194,384 B gzipped / 204,800 B (CI) |
| Today LCP, local production build (median of 3, slow 4G, 4× CPU) | en 660 ms, zh-CN 656 ms, zh-HK 668 ms |
| Lighthouse, gated, CI Chromium (performance / accessibility / best practices) | en 93/100/100, zh-CN 93/100/100, zh-HK 94/100/100 |
| `pnpm mcp:smoke`, against the production-mode stack | passed |

**Migrations.** None. The last migration is still `0025`.

**Environment.** No changes since the M15 candidate. `ASK_RATE_LIMIT` and the
`AI_*` variables stay optional and unset.

**Compose, Docker and Caddy.** No changes.

**Release checklist (plan §6.0).** It ran on the exact source `c38cde7`, on a
fresh database, with `pnpm release:stack --build --migrate --seed` and
`RELEASE_MAIL_LOG=… pnpm release:checklist`.

- **Result: passed, 32 / 32,** with 0 failed and 0 skipped.
- **One sub-step skipped:** SMS sign-in, in every project
  (`smsEnabled=false` locally).
- **MCP:** the `@modelcontextprotocol/client` round trip passed 42 / 42
  checks, covering all 30 tools.

**Notes for the deploy.**

- If the live origin is still on `2338772`, migrations `0023`–`0025` apply
  together, as described in the M15 candidate.
- Before `pnpm e2e`, make sure nothing listens on the configured ports. A
  stale local API caused one failed checklist attempt here.


### Frontend v2 release candidate M18 — 2026-10-14

**Superseded during deployment:** M18b was published before the M18
checkpoint. Per the user's effective newest-candidate rule, M18b took over
under the same native lock with fresh backups and pinned image builds.
M18 was healthy and its 21 critical public cases passed (four task
cleanup-only failures passed their single retry after descendant-first
cleanup was fixed). The application code is unchanged in M18b; the
completed M18 public milestone coverage is identified separately in the
M18b checkpoint, alongside fresh critical checks on the M18b runtime.
M18 was not marked accepted and deployment.done was not advanced to it.


**Source.** `main` at `98cf3c64b63a397512dc9bf940f2152d2c305a44`. It supersedes
the M17 candidate, so one deploy covers R1 and M15–M18. If the M17 deploy is
already running, finish it first, then take this one. Since the M17
candidate's source `c38cde7`, it adds:

- **PR #18:** M18, the mind map (`?view=mind`).
- **PR #20:** docs only (the pinned-candidate deploy rule).

The application tree is identical to `a13fca9`, the PR #18 merge: PR #20 changes
only `docs/agent-goal-deploy-frontend-v2.md`. The `main` run on `a13fca9` was
cancelled when PR #20 merged, so the candidate is pinned to `98cf3c6`.

**CI (Step 0 rule).**

- **`main` push CI on the exact source `98cf3c6`:**
  [38561997658](https://github.com/ksamint/taff01/actions/runs/38561997658),
  success.
- **PR CI on the merged heads,** each an ancestor of the source, all success:

  | PR | Head | CI run |
  | --- | --- | --- |
  | #18 | `f7fd369685b70cecd8809b68a778c0f7d3a861b2` | [38558870195](https://github.com/ksamint/taff01/actions/runs/38558870195) |

  PR #20 is docs only; its content is covered by the `main` run above.
- **Visual baselines and gated Lighthouse on CI Chromium:**
  [38557553181](https://github.com/ksamint/taff01/actions/runs/38557553181)
  on `89af016`, which has the same application code as the source. One
  `me.png` capture from an earlier run showed a font-metric variant. PR #18
  replaced it with this run's capture, which is byte-identical to the previous
  `main` baseline.

**What changes for people.**

- **Mind map (M18).** `/projects/[id]?view=mind`, one map per workspace:
  - **Canvas:** an overview and node detail.
  - **Editing:** create and edit nodes and sources, add, re-kind and remove
    links, attach evidence, and archive or restore (never delete). Every
    write has undo.
  - **Validation task:** a node can become a real task owned by the signed-in
    person; nothing is attributed to an agent or generated by a model.
  - **Keyboard and screen readers:** 以列表顯示 replaces the canvas with a
    keyboard-navigable list. Selection changes are announced politely.
  - **Access:** editing needs `mind:write`. No new permission rule and no new
    MCP tool.

Report: `docs/milestones/18-mind-map.md`.

**Validation numbers.**

| Check | Result |
| --- | --- |
| lint, typecheck, licence | green |
| unit and integration tests | 866 / 866 |
| e2e and visual suite | green in PR CI ([38558870195](https://github.com/ksamint/taff01/actions/runs/38558870195)) |
| Today initial JS | 194,424 B gzipped / 204,800 B |
| Today LCP, local production build on `a13fca9` (median of 3, slow 4G, 4× CPU) | en 640 ms, zh-CN 640 ms, zh-HK 648 ms |
| Lighthouse, gated at 90 / 90 / 90, CI Chromium | passed for en, zh-CN and zh-HK in both CI runs above |
| `pnpm mcp:smoke`, against the production-mode stack | passed |

Per-locale Lighthouse scores are not copied here: this session could not
download the CI job log. A local run in this build container scored 83–84
for performance (100 accessibility, 100 best practices). That container is
slower than CI's runner and is not the gate.

**Migrations.** One, additive: `0026_m18_mind_edge_version`.

- `ALTER TABLE mind_edges ADD COLUMN version integer DEFAULT 1 NOT NULL`
- `ADD CONSTRAINT mind_edges_version CHECK (version > 0)`
- **Backfill:** existing rows take the default `1`; no data rewrite. On the
  fresh seeded checklist database, 29 / 29 `mind_edges` rows read version 1.

**Environment.** No changes.

**Compose, Docker and Caddy.** No changes.

**Release checklist (plan §6.0).** It ran on `a13fca9` (the same application
tree as the source), on a fresh database, with
`pnpm release:stack --build --migrate --seed` and
`RELEASE_MAIL_LOG=… pnpm release:checklist`.

- **Result: passed, 32 / 32,** with 0 failed and 0 skipped.
- **One sub-step skipped:** SMS sign-in, in every project
  (`smsEnabled=false` locally).
- **MCP:** the `@modelcontextprotocol/client` round trip passed 42 / 42
  checks in each of the four projects, covering all 30 tools.

**Notes for the deploy.**

- If the live origin is still on `2338772`, migrations `0023`–`0026` apply
  together.

### Frontend v2 release candidate M18b — 2026-10-14

**Source.** `main` at `ab243e8379c952f37c459a60596e4754ba33967e`. It supersedes
the M18 candidate, whose source was `98cf3c6`. Since that source, it adds:

- **PR #19, test only.** A shared `holdRequest` helper keeps request
  interception on for the rest of each test. It is used in the planning,
  persistence, notifications, me and optimistic-m4 specs. The specs no longer
  unroute in the middle of a test, which could leave app refetches hanging (the
  same race PR #16 fixed in optimistic-m4).
- This candidate's own M18 section, docs only.

Outside `e2e/` and `docs/`, nothing has changed since the M18 candidate. If M18
is already deploying, finish it; this candidate then changes nothing at
runtime.

**CI (Step 0 rule).**

- **`main` push CI on the exact source `ab243e8`:**
  [38564795332](https://github.com/ksamint/taff01/actions/runs/38564795332),
  success.
- **PR CI on the merged head,** an ancestor of the source:

  | PR | Head | CI run |
  | --- | --- | --- |
  | #19 | `5e1abc2cd156be43d9ca07f2c1cbdcd1b5f68ad0` | [38559438423](https://github.com/ksamint/taff01/actions/runs/38559438423), success |

**Validation, migrations, environment, Compose, Docker and Caddy.** These are
the same as for the M18 candidate: migration `0026` is additive, and there are
no environment or infrastructure changes. Under the current working rules,
the local production-mode checklist is optional and was not rerun for this
test-only change. The M18 checklist, which passed 32 / 32 with MCP 42 / 42,
covers the same application tree.


### Frontend v2 M18b upgrade checkpoint — 2026-10-14

M18b superseded healthy M18, which had superseded M17, under the user's effective
2026-10-14 deployment rules. The live pinned source is
`ab243e8379c952f37c459a60596e4754ba33967e`, tree `30e53242c2723e30a84bb753a3fa7271c4e601dc`.
Application commits newer than this source on main do not block deployment.
The Git diff outside `e2e/` and `docs/` from M18 to M18b is empty; PR #19
changes test interception helpers only. Application/migration/env/Compose,
Docker and Caddy sources are identical to M18.

**Validation.** Exact-source main-push CI
[38564795332](https://github.com/ksamint/taff01/actions/runs/38564795332)
and PR #19 head CI
[38559438423](https://github.com/ksamint/taff01/actions/runs/38559438423)
were completed/success; both source ancestry and PR-head ancestry were
verified again before build, migration and container start. CI is the
validation; the full local suite, Lighthouse and LCP were not re-run for
M18b. The candidate records 866 tests, 194,424 B Today initial JS and
640/640/648 ms en/zh-CN/zh-HK LCP; these are candidate/CI evidence, not new
local measurements. On this Mac all three pinned Docker images built and
`pnpm mcp:smoke` passed against production-mode API/worker containers on an
isolated local-development database. The Mac used its existing Colima builder; production builds retained
`--builder default`. Local smoke containers were removed.

**Lock and backups.** Detached native lock keeper PID `3710910` retained
`/srv/taff/deploy.lock` continuously through the M17-to-M18 handoff.
M18b took a fresh dedicated dump, verified by `pg_restore --list`:
`/srv/taff/secrets/db.before-ab243e8379c952f37c459a60596e4754ba33967e.dump`, 424,832 B,
SHA-256 `b4c17a1a4537ccfc87fb0aa5a23d81622c075908ff5c1963355afd4cc27ad846`; catalog includes 88 tables, tasks,
workspaces and migration journal. Exclusive env backup:
`/srv/taff/secrets/.env.before-ab243e8379c952f37c459a60596e4754ba33967e`, mode 0600.
Git bundle: 8,177 B, SHA-256 `0c6867ae0720f5bd76b1cca383f42abf0085e6107a1682b20e680d4744faf0bb`;
`git bundle verify`, detached SHA, clean tree and GitHub origin verified.
The tracked public source modes were normalized to Git's 0644/0755 before
building, leaving private Git/env/secret files protected.

**Migrations and runtime.** Earlier M17/M18 applied additive 0023–0026. M18b adds no migration;
the most recent remains `0026_m18_mind_edge_version.sql`, hash
`3dd0bf9837fbe740fac652712f32a71b84bddd619a6f9198a5c5ebe0b9e0b520`.
It adds integer version default 1 and a positive-version constraint, with
no rewrite of existing user data. The canonical M18b one-shot migrator
exited 0, and all four migration hashes were present. Only API, worker
and web were recreated with SHA-stamped tags/cache assets:

- api: `sha256:e3ec7ac800fe6e540d173ead9fa16c7ba9d587cc29abe945d5f03e42602bbbe7`
- worker: `sha256:bcdd2a0d96d33c3533a138851ec05fcbb56f00a9eec8d76c89f14a3f0a245163`
- web: `sha256:63825ed6a64ca62304f3a9423112b0e37788a9b7bcec3043968dfb56434c6bbb`

Caddy, Valkey and all 46 neighboring containers kept their IDs, start
times and health; Traefik route hash unchanged. Private env changed only
TAFF_TAG, retaining mode 0600. Email/SMS values unchanged; AI_* unset and
all workspace AI flags disabled. PostgreSQL remained on its existing host,
role and TLS connection, with postmaster start
`2026-08-29 01:19:14.878015+00`. No database restart, DNS, route or role
change.

**Rollback identities.** The immediately preceding M18 images were retained:

- api: `sha256:8eda1e0abdf2154d89bc43c8a7086d450ebd28b66b360316011ee6e22b9cbfad`
- worker: `sha256:d5ab6682906ca664be8729983298d6710a124940dcb017a5fefa9a40c87a1ff7`
- web: `sha256:e42d02b6be57391f87157ac51deb4608b87a4f247d3d75c8f140ff8c3c7992dd`

The last previously accepted `23387723f8c438d990db00d561cba2899f48ab80`
images and its original env/database backups also remain available:

- api: `sha256:c828844901e46b97b58d0bb537922f807079cbc5aa65129b8a78d538ea467e25`
- worker: `sha256:1531e2630e941710d7604a5106884cae2c6424f47bba434b97945f70f2375c7e`
- web: `sha256:c8daf2f869c5594a7ae3eceda850474bf507261dfe4345b94ec0274b1fed9625`

**Public acceptance.** On the fresh M18b runtime, 21 / 21 critical and
platform cases passed on the first attempt: en and zh-HK on 390×844 phone
and 1280×800 desktop, plus a zh-CN phone platform/Today/Projects/Me spot
check. Username and email sign-in, sign-out/re-sign-in, Today, task create,
edit and person/agent assignment, run start/pause/resume/cancel, Inbox
review approve/request changes, grant access, and the real official MCP
client round trip passed. Each of the four MCP projects listed/exercised
all 30 tools, checked live browser updates and call logs, submitted work
for human review, regenerated/revoked tokens, and confirmed revocation
returns 401. HTTPS/health, Secure/HttpOnly session cookies, foreign-origin
rejection, unchanged auth methods, navigation, locale/theme preferences
passed. All 21 journals report zero browser errors and zero cleanup failures.
No public rate-limit flood or SMS OTP request was made: the rate-limit
probe is covered by local MCP smoke; SMS was offered and its form opened.

**Additional public coverage, explicitly on M18's equivalent application.**
Before switching to M18b, the full remaining public batch completed 94
unique cases: 89 applicable cases passed, five expected brief form-factor
counterparts skipped, one initial failure passed its single retry (95
attempts). CRM roles/stakeholders/cascade/archives and undo, timeline
move/resize/dependencies/cycle rejection/graph and undo, brief/Ask rules and
human-approved proposals, mind-map keyboard node/link/evidence editing and
undo plus person-owned validation tasks, board/list/calendar/search,
organizations and fresh invitations, notifications/permissions/settings,
restricted-member access, and realtime between independently authenticated
Chromium processes were exercised across en/zh-HK phone and desktop and
zh-CN phone milestones. This is application-equivalence evidence, not a
claim that the optional batch ran again on M18b. All 95 entity journals
report zero browser errors and successful cleanup.

**Follow-up (release kept live).** The restricted-member check on desktop
zh-HK initially failed at `platform.spec.ts:28` and passed the one permitted
retry. The underlying first-attempt cause remains unestablished; investigate
verification stability. There is no twice-failing critical flow, so no
rollback was required. Earlier verification-helper failures were resolved:
M17's restrictive checkout permissions prevented the first migrator from
reading its journal before SQL; tracked public source modes were repaired
and images rebuilt. A retained historical stopped migrator confused a
uniqueness check; verification now selects the canonical one-shot by name
and immutable image. Task cleanup initially tried to finish parents before
open children and to finish agent-assigned work directly; supported
version-checked unassignment and descendant-first completion fixed it.
The four affected M18 task cases passed their single retry and all residual
verification parents were completed through public APIs. No application
permission or data-integrity guard was weakened.

Verification tokens/new grants were revoked, active runs canceled, agent
settings and profile/notification preferences restored, schedules cleared,
and current-run projects/CRM/mind nodes and sources archived. Current-run
mind edges were removed through the supported link API. Tasks, accepted
invitations, verification recipients/members and workspaces retain their
auditable verification history because no supported archive/delete API
exists; they were not reported deleted. No demo seed or real user's
workspace was used.

**Receipt and lock release.** The acceptance receipt is
`/srv/taff/frontend-v2-m18b-accepted-ab243e8379c952f37c459a60596e4754ba33967e.json`.
`deployment.done` is `ab243e8379c952f37c459a60596e4754ba33967e`. The adopted
keeper was released through its original job's reconciled unlock receipt.
An independent native flock probe acquired and released the lock; exact
M18b image identities/running state, API healthy, public health 200,
Caddy/Valkey/all 46 neighbors, route hash and PostgreSQL start time were
verified again after unlock. The release stayed live. No deployment is
blocked; the one retry-passing noncritical follow-up is recorded above.
The local agent continues newest-candidate discovery every 30 minutes until
v0.2.0 is deployed and recorded, using the effective user rules in the
updated runbook.

### Frontend v2 release candidate M19a — 2026-10-14

**Source.** `main` at `9577c8cde908f0da38987dcb196fcd6704c998b3`. It supersedes
M18b, whose source `ab243e8` is live. Since M18b, it adds two parts of M19:

- **PR #21: v1 leftovers.**
  - Removes 317 lines of unused v1 CSS from `base.css`, `task-detail.css` and
    `today.css`.
  - Renames the visual suite to `e2e/ui-v2.spec.ts`; its 86 baselines move
    byte for byte.
- **PR #22: fonts and i18n.**
  - Regenerates the Noto Sans TC subsets from the v2 strings: 714 → 975
    characters, 219,496 → 295,616 bytes across the two files.
  - Updates the `unicode-range` values in `tokens.css` to match.
  - Adds a zh-HK Traditional-character lint test.
  - Recaptures 69 visual baselines on CI.
- **`848060a`:** the deploy agent's M18b record, docs only.

**What changes for people.** Seed names, titles and v2 interface characters
that used to fall back to the system font now render in Noto Sans TC. The
fonts keep `font-display: optional`. The service worker and locale caches
refresh through `ASSET_VERSION`, as usual.

**CI (Step 0 rule).**

- **`main` push CI on the exact source `9577c8c`:**
  [38572631759](https://github.com/ksamint/taff01/actions/runs/38572631759),
  success. It runs the LCP guard, gated Lighthouse, the visual suite, e2e and
  the MCP smoke test.
- **PR CI on the merged heads,** each an ancestor of the source, all success:

  | PR | Head | CI run |
  | --- | --- | --- |
  | #22 | `132bc1ccfb0d7ac0f93e70d1b5709adc43dabc98` | [38569973363](https://github.com/ksamint/taff01/actions/runs/38569973363) |
  | #21 | `bdaae8aa1a0bb1726e4b3b8ba819cba9e2956f69` | [38565883593](https://github.com/ksamint/taff01/actions/runs/38565883593) |

- **Visual baselines:**
  [38568927657](https://github.com/ksamint/taff01/actions/runs/38568927657)
  on `32ac206`, the PR #22 head before the baseline commit.

**Validation numbers.** Unit and integration tests: 877 / 877 (PR #22). Today
initial JS: 194,431 B gzipped of 204,800 B. The LCP guard and Lighthouse
(at least 90 in every category) are gated in the `main` run above. Under the
current rules, the local production-mode checklist was not rerun.

**Migrations.** None. The last migration is still `0026`.

**Environment, Compose, Docker and Caddy.** No changes.

### Frontend v2 M19a upgrade checkpoint — 2026-10-14

Live pinned source `9577c8cde908f0da38987dcb196fcd6704c998b3`, tree
`bf341ea42f786d8115ab7f045dfab2e1b9f69ae1`. M19a removes unused v1 CSS and expands the
Traditional Chinese Noto Sans TC font subsets for v2 strings. Review [PR
#21](https://github.com/ksamint/taff01/pull/21) and [PR
#22](https://github.com/ksamint/taff01/pull/22). Newer code on main was left for later
candidates; M19a remained the newest published candidate at the final eligibility check.

**Validation.** Exact-source main-push CI
[38572631759](https://github.com/ksamint/taff01/actions/runs/38572631759) and merged PR
#22 head CI [38569973363](https://github.com/ksamint/taff01/actions/runs/38569973363)
completed/success. PR #21
[38565883593](https://github.com/ksamint/taff01/actions/runs/38565883593) also passed.
Source and PR-head ancestry were verified before build, migration, start and acceptance.
The candidate records 877/877 tests and Today initial JS 194,431 B gzipped against a
204,800 B budget. Exact-source main CI logs report signed-in Today LCP medians en 624
ms, zh-CN 648 ms, zh-HK 648 ms (three runs per locale, slow 4G, 4× CPU; 2,000 ms limit),
and Lighthouse 13.5.0 performance/accessibility/best-practices 96/100/100 in every
locale. These are CI measurements. The full local suite, Lighthouse and LCP were not
rerun.

On a clean detached checkout, all three local images built and `pnpm mcp:smoke` passed
on the first attempt against production-mode API/worker containers with a dedicated
local development database and Redis namespace. The existing Mac Colima builder was
used; production retained `--builder default`. Local smoke containers were removed.

**Lock, backups and source relay.** Fresh detached keeper PID `107294` held the existing
native `/srv/taff/deploy.lock`. Verified dedicated database dump:
`/srv/taff/secrets/db.before-9577c8cde908f0da38987dcb196fcd6704c998b3.dump`, 559,842 B,
SHA-256 `831891fa685413683eb8341ac0a45db4535b1df4ca1fc756fdc282463d65d373`. `pg_restore
--list` verified 88 tables, tasks, workspaces and migration journal. Exclusive env
backup `/srv/taff/secrets/.env.before-9577c8cde908f0da38987dcb196fcd6704c998b3`, mode
0600. Incremental Git bundle 5,406,313 B, SHA-256
`a52841f7a827232b6a9967cb86a99b7fa8a2f95cb4dbaea004fcfd74871204f7`; hash, `git bundle
verify`, detached SHA, clean tree and GitHub origin verified. Only tracked public source
modes were normalized to 0644/0755; private Git/env/secret files stayed protected.

**Migrations and runtime.** No new migration, env variable, Compose, Dockerfile or Caddy
change since accepted M18b. Canonical one-shot migrator exited 0; existing additive
0023–0026 hashes were confirmed. Last migration remains
`0026_m18_mind_edge_version.sql`, hash
`3dd0bf9837fbe740fac652712f32a71b84bddd619a6f9198a5c5ebe0b9e0b520`. Only API, worker and
web were recreated, with SHA tags and `ASSET_VERSION` cache stamping:

- api: `sha256:8de56737961121eb0ad04c3d8d7ffa9a6e09bd3cfc19964eed77d67320f398de`
- worker: `sha256:aa240a32862ee3a76511a3e3ca865e933b941809fcc9ac74cf15006906b09449`
- web: `sha256:51a42c0bb3e4a040fef2acecff746d0ce47978019711f392108e668633e7ab61`

Caddy, Valkey and all 46 neighboring containers retained IDs, images, start times and
health. Route hash unchanged. Private env changed only TAFF_TAG and retained mode 0600;
email/SMS unchanged, AI_* unset and all workspace AI flags disabled. PostgreSQL retained
its host, dedicated role, TLS connection and postmaster start `2026-08-29
01:19:14.878015+00`. No database restart, DNS, route or role change.

**Rollback identities.** Immediately preceding accepted M18b
`ab243e8379c952f37c459a60596e4754ba33967e` images remain available:

- api: `sha256:e3ec7ac800fe6e540d173ead9fa16c7ba9d587cc29abe945d5f03e42602bbbe7`
- worker: `sha256:bcdd2a0d96d33c3533a138851ec05fcbb56f00a9eec8d76c89f14a3f0a245163`
- web: `sha256:63825ed6a64ca62304f3a9423112b0e37788a9b7bcec3043968dfb56434c6bbb`

**Fresh public acceptance.** All 21 critical/platform cases passed on this M19a runtime:
en and zh-HK at 390×844 phone and 1280×800 desktop, plus the zh-CN Today/Projects/Me
spot check. Sign-in, sign-out/re-sign-in, Today, task creation/edit/person and agent
assignment, run start/pause/resume/cancel, review approve/request changes, grant access,
navigation, locale/theme, HTTPS/health, Secure/HttpOnly cookies, foreign-origin
rejection and unchanged auth methods passed. Each of the four live MCP cases used the
official client, initialized/listed and exercised all 30 read/write tools on current-run
verification entities, confirmed call logs and live browser updates, submitted and
approved review, regenerated/revoked tokens and confirmed fresh initialization returns
401. No production rate-limit flood or SMS OTP request was made.

The fresh remaining public batch completed 108 unique cases: 102 passed, 6 expected
phone/desktop brief counterparts skipped, 0 remaining noncritical failures, across 109
attempts. It exercised board drag/status, list filters, calendar day/week/month
schedule/drag/resize/undo, command search, organizations/create/invite in a fresh
browser, notifications and agent permissions, CRM
roles/stakeholders/cascade/archive/undo, timeline dependencies/cycle rejection/relations
graph/undo, brief and rules-only Ask with human-approved proposals, mind-map keyboard
nodes/links/evidence/undo and person-owned validation tasks, restricted-member finance
visibility, and realtime between separate Chromium processes. en/zh-HK phone and desktop
and zh-CN phone/desktop milestone checks ran. This is fresh M19a evidence, with no
application-equivalence substitution. 134 entity journals report 0 browser errors and 0
cleanup failures.

**Verification follow-ups.** The copied recipient helper initially generated an M18b
prefix while the scoped proof bridge required M19a. Both phone task cases stopped twice
before task creation; all four journals contain zero created tasks, browser errors and
cleanup failures. The prefixes were corrected, and each affected phone task flow passed
its first valid attempt. These four invalid harness attempts are retained in the
evidence; they are not classified as twice-failing application task flows. No
application or production permission/data guard was weakened.

- phone-zh-HK mind-map keyboard node/link editing and archive/undo: first attempt
  failed, then the one permitted retry passed. The sanitized location is
  `mind.spec.ts:66` (test declaration); the first-attempt cause remains unestablished.
  Follow up on verification stability.

Verification tokens/new grants were revoked, active runs canceled, agent settings and
profile/notification preferences restored, schedules cleared, and current-run
projects/CRM/mind nodes and sources archived; current-run mind edges were removed
through the supported link API. Tasks, accepted invitations, verification
recipients/members and workspaces retain auditable history because no supported
archive/delete API exists. Failed helper signups also retain their isolated
verification-account history. Public checks used the dedicated verification workspace
and its own test entities.

**Receipt and unlock.** Acceptance receipt
`/srv/taff/frontend-v2-m19a-accepted-9577c8cde908f0da38987dcb196fcd6704c998b3.json`;
`deployment.done` is `9577c8cde908f0da38987dcb196fcd6704c998b3`. Keeper release followed
the reconciled receipt. An independent native flock probe acquired/released the lock and
reverified exact images, healthy API, public health 200, Caddy/Valkey/all 46 neighbors,
route hash and PostgreSQL start time. No twice-failing critical flow required rollback.
The release remains live; the agent resumes 30-minute discovery until v0.2.0 is deployed
and recorded.

### Frontend v2 release candidate v0.2.0 — 2026-10-14

**Source.** `main` at `191243d25ea4f72116aadf2a9f7fec844a0ffa6e`, the **`v0.2.0`** release. It supersedes M19a,
whose source `9577c8c` is live and accepted. This candidate completes M19 and
is the frontend v2 release. Since M19a, it adds:

- **PR #23, accessibility.**
  - The accessibility audit (`scripts/ui/a11y-audit.mjs`) now covers every v2
    route: 348 contexts, 0 failures.
  - CSS fixes:
    - deep-blue `--text-on-accent` text on the gold badges (5.5:1);
    - 44 px targets for timeline rows, mind-map source links, project view
      tabs, contact links and the brief's send button;
    - the standard focus ring on the brief's ask input.
  - The Me visual test now waits for its content before capturing.
  - The PR adds 186 locale captures.
- **PR #24, the release itself.**
  - The v0.2.0 `CHANGELOG.md` and README.
  - Workspace packages and the MCP server version move to `0.2.0`.
  - The complete M19 report.
- **`191243d`:** the deploy agent's M19a record, docs only.

**What changes for people.** Badge counts on the phone tab bar, the desktop
sidebar and Me now use deep-blue text on gold instead of white. The
timeline, mind map, contact detail and brief controls are easier to hit,
and the brief's ask field shows a focus ring. MCP clients now see server
version `0.2.0`.

**CI (Step 0 rule).**

- **`main` push CI on the exact source `191243d`:**
  [38585652337](https://github.com/ksamint/taff01/actions/runs/38585652337),
  success. It covers the LCP guard, gated Lighthouse, the visual suite, e2e
  and MCP smoke.
- **PR CI on the merged heads,** each an ancestor of the source, all success:

  | PR | Head | CI run |
  | --- | --- | --- |
  | #24 | `aaa5c5e3321c230596a695b13112db03defd5ff6` | [38580016843](https://github.com/ksamint/taff01/actions/runs/38580016843) |
  | #23 | `00630dcf22c50d073dd97edf6590a697df0ac3b1` | [38576480541](https://github.com/ksamint/taff01/actions/runs/38576480541) |

- **Visual baselines:**
  - [38572695160](https://github.com/ksamint/taff01/actions/runs/38572695160)
    on `cfd5e76`;
  - [38575377243](https://github.com/ksamint/taff01/actions/runs/38575377243)
    on `7ba0c1b`, for the Me baseline.

**Validation numbers.** The gates are the `main` run above. The M19 report
(`docs/milestones/19-cleanup-a11y-i18n-release.md`) records the audit,
keyboard flow, locale captures and the per-PR checks. Under the current
rules, the local production-mode checklist was not rerun.

**Migrations.** None since M18. The last migration is still `0026`; every
migration since v0.1.0 (`0023`–`0026`) is additive.

**Environment, Compose, Docker and Caddy.** No changes.

**Tag.** The build session cannot push tags because its git proxy refuses
tag refs with a 403. When this candidate is accepted, the deploy agent
creates the tag from a workstation with push access, on the exact source:

```sh
git fetch origin
git tag -a v0.2.0 191243d25ea4f72116aadf2a9f7fec844a0ffa6e -m "Taff v0.2.0 — frontend v2 (M11–M19)"
git push origin v0.2.0
```

### Frontend v2 v0.2.0 upgrade checkpoint — 2026-10-15

Live pinned source `191243d25ea4f72116aadf2a9f7fec844a0ffa6e`, tree
`cb98c3f495c05894cef5199ef7c0aead32d7a0e8`. This completes the frontend v2 deployment
goal. The [M19 report](milestones/19-cleanup-a11y-i18n-release.md), [PR
#23](https://github.com/ksamint/taff01/pull/23) and [PR
#24](https://github.com/ksamint/taff01/pull/24) cover the accessibility fixes, larger
touch targets, brief focus ring, release documentation, package versions and MCP server
identity `taff/0.2.0`. Newer main commits were left for later candidates; this remained
the newest published candidate at acceptance.

**CI and local readiness.** Exact-source main-push CI
[38585652337](https://github.com/ksamint/taff01/actions/runs/38585652337), merged PR #24
head CI [38580016843](https://github.com/ksamint/taff01/actions/runs/38580016843), and
PR #23 CI [38576480541](https://github.com/ksamint/taff01/actions/runs/38576480541)
completed/success. Source and PR-head ancestry and newest-candidate eligibility were
refreshed before build, migration, container start and acceptance. CI is the validation:
877/877 unit/integration tests; Today initial JS 194,421 B gzipped against 204,800 B;
signed-in Today LCP medians en 584 ms, zh-CN 676 ms, zh-HK 660 ms (three runs/locale,
slow 4G, 4× CPU, 2,000 ms limit); Lighthouse 13.5.0
performance/accessibility/best-practices 100/100/100 in every locale. These are
exact-source CI measurements. The M19 report records its 348-context accessibility audit
with zero failures and 186 locale captures.

All three pinned images built on a clean detached local checkout and `pnpm mcp:smoke`
passed on the first attempt against production-mode API/worker containers with a
dedicated local development database and Redis namespace. The Mac used its existing
Colima builder; production retained `--builder default`. Local smoke containers were
independently confirmed removed. The full local suite, Lighthouse and LCP were not
rerun.

**Lock, backups and bundle.** Fresh detached keeper PID `392956` held the existing
native `/srv/taff/deploy.lock`. Verified dedicated dump
`/srv/taff/secrets/db.before-191243d25ea4f72116aadf2a9f7fec844a0ffa6e.dump`, 791,092 B,
SHA-256 `bf3fb0a6feff80b0ae98b9ddae834ad40bd753234af9046220cb5bb5b50ead05`; `pg_restore
--list` confirmed 88 tables, tasks, workspaces and migration journal. Exclusive env
backup `/srv/taff/secrets/.env.before-191243d25ea4f72116aadf2a9f7fec844a0ffa6e`, mode
0600. Incremental bundle 16,767,395 B, SHA-256
`aa3eca66a010c6e3755f34325496e010eb796245318de91aa278aa8f8ae83ed7`; bundle hash, `git
bundle verify`, detached SHA, clean tree and GitHub origin verified. Only tracked public
source modes were normalized to 0644/0755; private Git/env/secret files remained
protected.

**Migrations and runtime.** No new migration, env variable, Compose, Dockerfile or Caddy
change since accepted M19a. Canonical one-shot migrator exited 0 and existing additive
0023–0026 hashes were present. Last migration remains `0026_m18_mind_edge_version.sql`,
hash `3dd0bf9837fbe740fac652712f32a71b84bddd619a6f9198a5c5ebe0b9e0b520`. Only API,
worker and web were recreated, with SHA tags and `ASSET_VERSION` cache stamping:

- api: `sha256:fe32cd4997f9c9ee13ffe50580dd6ec2a5ed6d50f1958b5937c7a77523d24303`
- worker: `sha256:0e4938d7e6854c3388beba670c506d0002dea94eec36b2816431530e9fee8bdb`
- web: `sha256:797f5939f799128df6df0bac9faa7a9e2e529cd1a580814c89ddf2a626010100`

Caddy, Valkey and all 46 neighboring containers retained IDs, images, start times and
health; route hash unchanged. Private env changed only TAFF_TAG and remained mode 0600.
Email/SMS unchanged, AI_* unset and all workspace AI flags disabled. PostgreSQL retained
its host, dedicated role, TLS and postmaster start `2026-08-29 01:19:14.878015+00`. No
database restart, DNS, route or role change.

**Rollback identities.** Previously accepted M19a
`9577c8cde908f0da38987dcb196fcd6704c998b3` images remain available:

- api: `sha256:8de56737961121eb0ad04c3d8d7ffa9a6e09bd3cfc19964eed77d67320f398de`
- worker: `sha256:aa240a32862ee3a76511a3e3ca865e933b941809fcc9ac74cf15006906b09449`
- web: `sha256:51a42c0bb3e4a040fef2acecff746d0ce47978019711f392108e668633e7ab61`

**Fresh public acceptance.** All 21 critical/platform cases passed on the final runtime:
en and zh-HK at 390×844 phone and 1280×800 desktop, plus zh-CN Today/Projects/Me spot
checks. Sign-in, sign-out/re-sign-in, Today, task creation/edit/person and agent
assignment, run start/pause/resume/cancel, review approve/request changes, grant access,
navigation, locale/theme, HTTPS/health, Secure/HttpOnly cookies, foreign-origin
rejection and unchanged auth methods passed. Each of four live MCP cases used the
official client, exercised all 30 read/write tools on current-run verification entities,
confirmed call logs and live browser changes, submitted and approved review,
regenerated/revoked tokens, and verified fresh initialize returns 401. Separate
official-client connections in all four locale/viewport cases confirmed server identity
`taff/0.2.0`. No public rate-limit flood or SMS OTP request was made.

The fresh remaining batch completed 108 unique cases: 102 passed, 6 expected
phone/desktop brief counterparts skipped, 0 remaining noncritical failures, across 111
attempts. It exercised board drag/status, list filters, calendar day/week/month
schedule/drag/resize/undo, command search, organizations/create/invite in a fresh
browser, notifications/agent permissions, CRM roles/stakeholders/cascade/archive/undo,
timeline dependencies/cycle rejection/relations graph/undo, brief and rules-only Ask
with human-approved proposals, mind-map keyboard node/link/evidence/undo and
person-owned validation tasks, restricted-member finance visibility, and realtime
between separate Chromium processes. en/zh-HK phone and desktop and zh-CN phone/desktop
milestones ran. 132 entity journals report 0 browser errors and 0 cleanup failures. This
is fresh final-release evidence.

**Follow-ups.**

SMS is configured and its sign-in form opened in all four locale/viewport cases. The
repository checklist explicitly skips requesting a real OTP; that delivery/sign-in cycle
remains unverified and is a manual follow-up. Email and username sign-in passed. Public
rate-limit enforcement was also intentionally not flooded, as the deployment runbook
directs; local/CI MCP smoke covers it.

- phone-en: create nodes and links by keyboard, edit and archive with undo — first
  attempt failed; the single retry passed. Sanitized failed-attempt evidence:
  [{"status": "failed", "retry": 0, "failureLocations": [{"file": "mind.spec.ts",
  "line": 66, "column": 1}]}].
- desktop-en: sources become evidence, with undo — first attempt failed; the single
  retry passed. Sanitized failed-attempt evidence: [{"status": "failed", "retry": 0,
  "failureLocations": [{"file": "mind.spec.ts", "line": 220, "column": 1}]}].
- desktop-zh-HK: create nodes and links by keyboard, edit and archive with undo — first
  attempt failed; the single retry passed. Sanitized failed-attempt evidence:
  [{"status": "failed", "retry": 0, "failureLocations": [{"file": "mind.spec.ts",
  "line": 66, "column": 1}]}].

The M19 source report retains known visual limitations: manual review of 216 text nodes
on gradient/image backgrounds, light-theme-only locale captures, and system-font
fallback for 173 Simplified Chinese characters. These were reported by the build agent
and remain follow-ups; they were not represented as new local audit measurements.

Verification tokens/new grants were revoked, active runs canceled, agent settings and
profile/notification preferences restored, schedules cleared, and current-run
projects/CRM/mind nodes and sources archived. Current-run mind edges were removed
through the supported link API. Tasks, accepted invitations, verification
recipients/members and workspaces retain their auditable history because no supported
archive/delete API exists. Public checks used the dedicated verification workspace and
its own entities.

**Acceptance, unlock and final tag.** Receipt
`/srv/taff/frontend-v2-v020-accepted-191243d25ea4f72116aadf2a9f7fec844a0ffa6e.json`;
`deployment.done` is `191243d25ea4f72116aadf2a9f7fec844a0ffa6e`. Keeper release followed
the reconciled receipt. An independent native flock probe acquired/released the lock and
verified exact images, healthy API, public health 200, Caddy/Valkey/all 46 neighbors,
route hash and PostgreSQL start time. No twice-failing critical flow required rollback.
The remote annotated [v0.2.0 tag](https://github.com/ksamint/taff01/tree/v0.2.0), object
`189a4a20658de40851ec2bd5075d196566dab82f`, was verified through GitHub Git APIs and
`git ls-remote` to peel to exact source `191243d25ea4f72116aadf2a9f7fec844a0ffa6e`. The
final release remains live. The watcher already returned when it found this candidate
and is not restarted; the deployment goal is complete.

### Frontend v2 release candidate v0.2.1-a — 2026-10-15

Pinned main source `5191671743d36b4d2719882514ba0d2ff44019a4`, tree `50a1dda138e779acaab9b9badb82015a9d8a15b0`.

Items 1–2 of plan §10.1, [PR 27](https://github.com/ksamint/taff01/pull/27) and
[PR 28](https://github.com/ksamint/taff01/pull/28): the public acceptance harness,
mind-map own-write/undo version races and evidence IDs, initial-socket role refresh,
and MCP copy in en/zh-CN/zh-HK. MCP continues to report taff/0.2.0 at this checkpoint.
Items 3–6 wait until this upgrade checkpoint is accepted.

**CI.** Exact-source main push [38670282333](https://github.com/ksamint/taff01/actions/runs/38670282333)
and merged PR-head [38666948980](https://github.com/ksamint/taff01/actions/runs/38666948980)
are completed/success. The PR head is an ancestor of the pinned source. The item 1
head CI [38668491277](https://github.com/ksamint/taff01/actions/runs/38668491277) is also green.

Exact-main validation: 885/885 unit/integration tests;
Today initial JS 194427 B gzipped against 204800 B;
Today LCP medians en 592 ms, zh-CN 660 ms,
zh-HK 648 ms (three runs/locale, slow 4G, 4× CPU, 2,000 ms ceiling).
Lighthouse 13.5.0 performance/accessibility/best-practices: en 95/100/100; zh-CN 94/100/100; zh-HK 95/100/100.
Full visual, browser-flow and bundled MCP smoke gates pass in that exact-source CI.

**Migrations.** None since the live source. Last migration remains 0026; no backfill (0 rows).

**Environment and infrastructure.** No .env.production.example, Compose, Dockerfile or Caddy changes. No new variables. The private env changes only TAFF_TAG, stays 0600, email/SMS unchanged, AI_* unset. Host layout, route, DNS, PostgreSQL role/host stay unchanged.

**Acceptance checklist.** Run all 122 applicable public cases in e2e/live, without runtime skips:
plan §6.0 basic functions and all 30 live official-client MCP read/write tools,
CRM, timeline/relations, rules-based brief/Ask, mind-map keyboard/evidence/undo,
validation tasks and restricted-member finance/role changes. Include held first-socket
promotion plus demotion, and repeated mind-map operations. Platform HTTPS/health,
Secure/HttpOnly cookies, foreign-origin rejection, unchanged auth methods, realtime,
and independent neighbor/PostgreSQL preservation checks are required. en and zh-HK
phone 390×844 and desktop 1280×800, plus zh-CN Today/Projects/Me and milestone spots.
Use only the dedicated verification account/workspace, with runtime credential refs.
Every failed check gets one retry; apply the deploy goal's critical rollback rules.
No SMS OTP or rate-limit flood; AI model stays off.

Deploy only this pinned SHA, with verified database/env backups, Git bundle,
SHA-stamped images/service worker, native detached keeper, and fresh ancestry/CI gates.
The [v0.2.1 milestone report](milestones/20-v0.2.1.md) records development evidence.

### Frontend v2 v0.2.1-a upgrade checkpoint — 2026-10-15

Live pinned source `5191671743d36b4d2719882514ba0d2ff44019a4`, tree
`50a1dda138e779acaab9b9badb82015a9d8a15b0`. The [v0.2.1 report](milestones/20-v0.2.1.md)
records scope and development evidence. This is the required intermediate checkpoint
after items 1–2; items 3–6 remain for the final release.

**CI and local production smoke.** Exact-source main push
[38670282333](https://github.com/ksamint/taff01/actions/runs/38670282333) and merged
PR-head [38666948980](https://github.com/ksamint/taff01/actions/runs/38666948980)
completed/success. Ancestry, exact CI identity and newest-candidate eligibility were
refreshed before build, migration, start and acceptance. Exact-main measurements:
885/885 tests; Today initial JS 194427 B gzipped against 204800 B; Today LCP en 592 ms,
zh-CN 660 ms, zh-HK 648 ms (three runs/locale, slow 4G, 4× CPU, 2000 ms ceiling).
Lighthouse 13.5.0 performance/accessibility/best-practices: en 95/100/100; zh-CN
94/100/100; zh-HK 95/100/100. CI includes visual/browser/MCP gates. All three images
built on a clean detached Mac checkout and production-mode API/worker MCP smoke passed
on the first attempt. Local smoke containers were removed. Full local suite, LCP and
Lighthouse were not rerun.

**Local image identities.**

- api: `sha256:8c536552ee29cee65c2b0b2e704bf661f7727936522599ded44c903cf3e32dd0`
- worker: `sha256:dd2936a824d61f7b88a11d4e2b9871c20268f230db1474caced482e9497c19d7`
- web: `sha256:cfa05efac45bc424bf90e8668c333c60934c312b3740d70b69227114905d7fd0`

**Lock, backup and source relay.** Detached keeper PID `3222992` held the existing
native /srv/taff/deploy.lock. Dedicated dump
`/srv/taff/secrets/db.before-5191671743d36b4d2719882514ba0d2ff44019a4.dump`, 1,058,528
B, SHA-256 `dc4c41f877084777ec405f7851be3beb2b0c3b9051e750995deae90d0c794666`;
pg_restore --list verified the catalog. Exclusive env backup
`/srv/taff/secrets/.env.before-5191671743d36b4d2719882514ba0d2ff44019a4`, mode 0600.
Bundle 325,964 B, SHA-256
`7bf4529cdb0bcc960d50587acc0bcea44480eb09b6ec542c49e759acd0001237`; checksum, git bundle
verify, exact detached SHA, clean tree and GitHub origin verified. Production used
--builder default and SHA/ASSET_VERSION stamping. Only tracked public source modes were
normalized.

**Migrations and runtime.** No new migration or backfill since the prior live source;
canonical one-shot migrator exited 0 and existing 0023–0026 hashes were verified. Only
API, worker and web were recreated:

- api: `sha256:54beffd8a6e814f4320a619ee4a352371d7540c3855d7bcb326b4a0bd3002695`
- worker: `sha256:0325b1cc6562de7962f4b0e6a3c0eb66cf1ad37f1e4982301381d7ae8947a75e`
- web: `sha256:52f14faab71782cea420c63ed8a2bbda9c8c26a37b597d346497c4ccfab135a4`

Immediately after start, Caddy/Valkey and all 46 neighbors matched. The fresh
pre-acceptance strict neighbor check later failed: four TableAI A/B app/converter
containers were replaced/restarted by an independent rollout after 03:00UTC. 42 other
baseline neighbors remained unchanged. Caddy/Valkey stayed unchanged. The Taff publisher
managed only its own project; no TableAI remediation was attempted. This is retained as
a failed noncritical platform check under the deploy goal; it was not reported as
preservation success. Route hash unchanged; no DNS, host-layout, PostgreSQL host or role
change. Private env changed only TAFF_TAG and remained 0600; email/SMS unchanged, AI_*
unset and all workspace AI flags disabled. PostgreSQL postmaster start remains
`2026-08-29 01:19:14.878015+00` with dedicated role and TLS.

**Rollback identities.** Accepted prior source
`191243d25ea4f72116aadf2a9f7fec844a0ffa6e`:

- api: `sha256:fe32cd4997f9c9ee13ffe50580dd6ec2a5ed6d50f1958b5937c7a77523d24303`
- worker: `sha256:0e4938d7e6854c3388beba670c506d0002dea94eec36b2816431530e9fee8bdb`
- web: `sha256:797f5939f799128df6df0bac9faa7a9e2e529cd1a580814c89ddf2a626010100`

**Fresh public acceptance.** 122 applicable cases executed; 122 passed, 0 failed
test-case follow-ups and 1 platform follow-ups, no skips, across 123 attempts. All 20
critical/platform cases passed. 123 scoped cleanup journals report zero browser page
errors, 1 initial cleanup failures and 0 unresolved cleanup failures. en/zh-HK
phone 390×844 and desktop 1280×800, with zh-CN Today/Projects/Me and milestone spots, used
the dedicated verification workspace. Checks covered sign-in/out/re-sign-in; navigation,
Today, task create/edit/person+agent assignment; run start/pause/resume/cancel; review
approve/request changes; grants; board/status/list filters; calendar day/week/month
schedule/drag/resize/undo; command search; organization switch/create/invite in a fresh
browser; notification preferences, agent permissions, locale/theme; CRM
roles/stakeholders/cascade/archive/undo; timeline/relations; rules-based brief/Ask; mind
keyboard/evidence/undo/validation; restricted-member finance/role refresh; and
cross-browser realtime. HTTPS/health, Secure/HttpOnly cookies, foreign-origin rejection
and pre-upgrade auth methods passed.

Four official-client MCP cases exercised every one of the 30 read/write tools on
current-run verification entities, observed call logs and live UI changes, submitted and
approved review, revoked tokens and confirmed a fresh initialize 401. All four separately
verified server identity taff/0.2.0. No public flood or real SMS OTP was requested.
Strengthened mind/evidence and held-first-socket role checks exercised the item 1
root-cause fixes.

**Retries and follow-ups.**

- phone-zh-HK: move and resize bars by mouse and by the form, with undo; {"status": "failed", "retry": 0, "failureLocations": [{"file": "timeline.spec.ts", "line": 111, "column": 1}, {"file": "live.ts", "line": 816, "column": 11}]}.

Real SMS OTP sign-in remains unverified. Public rate-limit flood is omitted under the
runbook; CI MCP smoke covers rate limiting. AI model/OAuth/hard delete/value chain/Neo4j
remain out of scope. Performance claims apply to Today. Earlier manual gradient/image
text contrast notes remain documented.

Verification tokens and own grants were revoked, runs canceled,
profile/agent/preferences restored, schedules cleared and current-run archiveable
entities archived. Auditable tasks, recipients/members, accepted invitations and
workspaces remain where no supported archive API exists. No demo seed or real-user
workspace was used.

**Acceptance and unlock.** Receipt
`/srv/taff/frontend-v2-v021a-accepted-5191671743d36b4d2719882514ba0d2ff44019a4.json`;
deployment.done is `5191671743d36b4d2719882514ba0d2ff44019a4`. Keeper released the
reconciled lock. Independent flock probe acquired/released it and confirmed exact
healthy runtime, public health 200, Caddy/Valkey, route hash and unchanged PostgreSQL.
Neighbor preservation is reported above, including any independently observed drift. No
twice-failing critical flow required rollback.

The original strict preservation probe remains failed in the evidence. A separate
independent follow-up probe verified free native flock, exact healthy Taff runtime,
PostgreSQL/route/env/Caddy/Valkey and 42 unchanged neighbors while explicitly reporting
the four TableAI neighbor differences. No critical flow failed twice and no Taff
rollback was required.

One initial notification-cleanup read failed before its restore PATCH. The exact failed
attempt created no entities, never edited notification settings, and restored
profile/theme; its sole retry passed with complete cleanup. Pinned source control flow,
failed/retry journal hashes and a fresh authenticated batch-end read of all seven
semantic preference fields support zero unresolved cleanup work. The original failure
and cleanupFailures=1 are retained; no test outcome was changed.
