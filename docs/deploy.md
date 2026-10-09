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
Its `/api/bootstrap` read does not renew sessions; the browser's `/api/me`
request performs confirmation and receives any renewal cookie. If the internal
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
first: `docker compose -f compose.prod.yaml exec -T postgres pg_dump -U taff taff > backup.sql`.

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

## Operations

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
- `pnpm perf:lcp` is not part of CI because shared runners make LCP timing
  unreliable; run it on a quiet machine before a release.

## Not configured yet

- Outgoing email: invitations are copyable links; sign-up does not verify
  email addresses, so invitations rely on the invitee signing in with the
  invited address.
- OAuth 2.1 for `/mcp`: personal access tokens are the only credential.
- Push notifications: digests are in-app pages.
