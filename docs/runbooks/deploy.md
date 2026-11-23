# Runbook: deploy and roll back

The short path. Detail and history live in [deployment](../deploy.md); what a
deploy must prove lives in [the closeout checklist](../release-closeout.md).
Run from the operator machine only, on a clean checkout of the exact commit.

**Open gap:** there is not yet one deploy command. Steps 2 to 6 are run by the
operator with private helpers kept under the release's own directory on the
host. `pnpm check` is the one command for step 1.

## Deploy

1. **Gate.** `pnpm check` on the exact commit. Only the result `passed`
   continues. Keep `release-reports/check-report.md` for the milestone.
2. **Lock and snapshot.** Take the native deploy lock. Record every container
   (id, image, created, startedAt, health) for the neighbour check.
3. **Backups.** An exclusive mode-0600 copy of the environment file and a
   verified database dump, before any migration.
4. **Migrate.** Run the bundled migrator. Migrations are additive; record its
   exit code and the journal before and after.
5. **Replace.** Start the renderer and the Rust API from the verified images
   and wait for both health checks. Replace API, worker and web with the
   images built from the gated commit. Activate the Rust path matchers in
   Taff's own Caddyfile and check the path through Caddy before closeout.
6. **Verify.** Closeout checks 2 to 4: the replaced services run the recorded
   images, are healthy and have not restarted; `node
   scripts/deploy/neighbor-preservation.mts` reports no unexplained drift;
   the release's public checks pass (health, OAuth metadata, the `/mcp` 401
   challenge); live acceptance passes read-only.
7. **Close out.** Closeout checks 5 to 8: annotated tag on the deployed
   commit, the docs commit with the milestone and the deploy report, the
   receipt, and the lock released and probed.

## Roll back

Roll back when any check in step 6 fails, before the lock is released.

1. Restore the environment backup from step 3.
2. Restore Taff's previous Caddyfile and reload Taff's proxy. On the first
   Rust rollout this removes the `/api/costs/*` matcher. Remove the Rust
   service if the previous accepted release had none.
3. Recreate the app services from the previous accepted release's images
   (the release milestone names them). Preserve PostgreSQL, its additive
   migrations and current data, Valkey, DNS and every neighbouring service
   (ADR 0011).
4. Re-run step 6 against the previous release.
5. Write the deploy report with the result `rolled back`, and say why.

Restoring the database dump is a destructive data operation: stop and ask the
owner, with the dump verified first.

## Local proxy switch rehearsal

Before changing a Rust route matcher, rehearse the switch with a
standalone, loopback-only Caddy instance. Start the local Node API and
`taff-api`, then confirm that Caddy serves `/api/health` from Node.
Add this block before the fallback for the local site:

```caddyfile
handle /api/health {
	reverse_proxy 127.0.0.1:3003
}
```

Reload the local instance using its dedicated admin address. Verify
`/api/health` reaches Rust and an ordinary API path still reaches Node.
Remove the block, reload and confirm health returns to Node. Record the
status and upstream for each probe.

## Report

Every attempt, accepted or rolled back, leaves
`deploy/reports/<utc>-<tree12>.md` ([format](../../deploy/reports/README.md)),
committed with the closeout docs commit.

## Stop and report

Shared proxies, DNS, firewall, shared ports, another project's containers,
creating or printing secrets: the operator stops and the owner decides
(`AGENTS.md`, "Stop and report").
