# Resync to the release frontier — 2026-11-01

A coding session resynchronized a stale local checkout and re-ran the
validation gate on the current development frontier.

## What was resynchronized

- Local checkout was on `codex/m9-neo4j-release` @ `a7be469` (2026-10-12), a
  side branch whose Neo4j-relationships work was never merged. Its merge-base
  with `main` was `017aa03` (M9 accessibility).
- `origin/main` had advanced linearly to `707161c` (v0.2.16, merged
  2026-10-31), passing frontend v2 and milestones M11–M38+.
- Local `main` was fast-forwarded to `707161c`. A new branch
  `dev/m9-continue` was created from the frontier
  `origin/fix/audit-stability-20261031` (`2b773c3`, milestone 83), which
  stacks on `codex/mcp-multi-workspace` (`55718da`, milestone 82).

## Validation on the frontier (`2b773c3`)

Green, matching the milestone-83 report:

| Gate | Result |
| --- | --- |
| `pnpm lint` | 563 files, clean |
| `pnpm typecheck` | 6 packages |
| `pnpm licence:check` | 304 packages, 7 documented exceptions |
| `pnpm test` | 117 files / **1872 passed** |
| `pnpm build` | web + server, clean (after clearing stale `.next`) |
| `pnpm build:server` | api + worker produced |
| `pnpm perf:budget` | Today 192.3 KiB ≤ 200 KiB |

`pnpm e2e` still needs a full clean run. A spot run of `ssr-session.spec.ts`
(en) returned 5/7 with two failures, both pre-existing on `main` (the
frontier commits do not touch `apps/web/app/layout.tsx`, `next.config.ts` or
`server-me.ts`):

- `Cache-Control` on authenticated SSR HTML is `no-store` without `private`
  (the API already emits `private, no-store`; the web page does not).
- The signed-in `fresh session failure can retry` flow cannot find
  `open-quick` after a 500 retry.

The first is security-relevant (a shared cache must not store per-user HTML)
and merits its own focused fix off `main`; it is recorded here as an open
item, not silently patched into the stability-audit branch.

## Open decisions

- The two frontier branches (`82` multi-workspace and `83` stability-audit)
  are not merged to `main` and remain the active work.
- Remaining milestone-83 acceptance (final browser/visual/performance,
  protected production backup/cutover) requires owner SSH/production access.
- A Rust backend migration was requested; see ADR 0026.
