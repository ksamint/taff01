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
`node_modules` produced by `pnpm deploy`. The web image bakes
`API_INTERNAL_URL=http://api:3001` into its rewrites; behind Caddy the `/api`
and `/mcp` paths go straight to the API and never reach Next.js.

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
