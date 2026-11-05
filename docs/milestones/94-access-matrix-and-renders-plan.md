# 94 — Detailed development plan: access fix, matrix, Twin access, summary text and image renders (2026-11-05)

Docs-only milestone on `claude/nifty-pascal-tm5d5d`; no code, schema or runtime change.

## What was done

- `docs/agent-goal-access-matrix-and-renders.md`: 21 task cards with files,
  tests and commit subjects. Release v0.2.18 (A1–A10): land PR #81 with its
  migration renumbered to 0039, ADR 0028 policy and enrollment (0040), the
  three new `can()` actions and the AGENTS.md access-change matrix, MCP
  `workspaces.list` with grant origin and `authorizedWorkspaces` in
  `context.get`, REST and the MCP page UI, the SSR `private` header, spec
  `agent-access.md`. Release v0.2.19 (B1–B11): access matrix read models,
  `/orgs/access` and `/admin/access`, generated permissions matrix, text
  render with goldens, Rust `taff-render` image service, `summary_renders`
  (0041) and worker jobs, REST/public/web delivery, MCP `summaries.list/get/
  image` under scope `summaries:read`, spec DS-8/DS-9, CHANGELOG backfill.
- ADR 0029 (proposed): text render as a pure TypeScript function with
  goldens, image render as a stateless Rust axum service (resvg, tiny-skia,
  fontdb; TTF subsets from the existing font pipeline), renders stored
  beside the summary, delivery over REST, the public page and MCP; agents
  read summaries only with the new scope. Supersedes ADR 0027 decision 4.
- Twin side recorded as T1–T4 (whitelist, `taff_summaries` source profile,
  text then image delivery through the outbox and media route, workspace
  mapping) for fenshen01's own plan; file names verified at `0327f47`.
- Upgrade plan and the sequencing goal updated for the renders.

## Missing

- All implementation. This environment has no installed dependencies, Node
  22 against engines ≥ 24, and no PostgreSQL, so nothing was built or run.
- Owner answers to ADR 0028 (3) and ADR 0029 (3) open decisions; defaults
  are stated and the plan builds on them.

## Validation

Docs only: `git diff --check` clean; relative links resolve. No test, build or e2e run was needed or claimed.
