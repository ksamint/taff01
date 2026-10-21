# Release closeout checklist

The single source for what a deploy must prove before tagging and releasing
the native lock. Goals and prompts reference this file instead of restating it
(AGENTS.md). Each check names where its evidence comes from; a check whose
source was not recorded cannot be required after the fact. Record a missing
source as a process gap in the milestone and fix the capture step below.

## Captured during the deploy (before and right after replacement)

| Evidence | When | Source |
| --- | --- | --- |
| Pre-deploy snapshot of every container: id, image, created, startedAt, health | Under the lock, before backups | Docker inspect, sanitized for `scripts/deploy/neighbor_preservation.py` |
| Exclusive database dump and env backup, mode 0600 | Before migration | Deployment log |
| Migrator exit code and migration journal | Migration | Deployment log |
| Replaced api/web/worker: container id, image id, startedAt, restartCount | Right after replacement | Docker inspect, recorded beside the image ids |
| Local checklist, live acceptance, MCP smoke counts | Before and after replacement | Playwright and smoke output |

## Closeout checks (still under the lock)

1. Exact-source `main` CI on the deployed SHA is green (8/8).
2. Replaced services: image ids equal the recorded ones, running, healthy;
   container ids and startedAt equal the post-replacement record (no restart
   since acceptance).
3. Preserved services: `neighbor_preservation.py` against the pre-deploy
   snapshot reports no unexplained drift (Caddy, Valkey, PostgreSQL start time,
   neighbors).
4. Public checks named by the release (health, and for MCP OAuth the
   authorization-server metadata and the `/mcp` 401 `resource_metadata`).
5. Annotated tag `vX.Y.Z` on the deployed SHA, verified on origin.
6. Docs-only PR: `docs/deploy.md` checkpoint and `docs/milestones/NN-vX.Y.Z.md`
   (≤ 40 lines), merged on green CI. Owner decisions and pending checks are
   quoted there and in the receipt.
7. Receipt written; `deployment.done` holds the accepted SHA only (pending
   items live in the receipt and milestone, never in `deployment.done`).
8. Keeper logs `LOCK_RELEASED` and removes its owner file; an independent
   nonblocking flock probe acquires the lock and sees the accepted images
   running and the API healthy.

Checks that need a person (for example a Claude.ai sign-in) are listed as
pending with exact steps when the owner accepts that; they never hold the lock
and run later without it.
