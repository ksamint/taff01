# 93 — Review: Rust and TypeScript path, Twin organization access, access matrix, open work (2026-11-05)

Docs-only milestone on `claude/nifty-pascal-tm5d5d` from `main` `ed84cab`; no code, schema or runtime change.

## What was done

- Rust review: ADR 0026 and the migration guide exist only on PR #84 (37
  files, review of 2026-11-01: two of five blocking items addressed, three
  plus twelve follow-ups unconfirmed; it still edits the deleted `ci.yml`
  and its permissions golden predates ADR 0027). Path recorded in the goal
  §1: rebase, fix, local `pnpm rust:gate`, phase 1, then one module per
  milestone; new logic keeps landing in TypeScript as pure functions with
  goldens.
- Twin (fenshen01, cloned read-only at `0327f47`): one Taff token in
  `tool_servers`, a tool whitelist, `mcp_source` reads `context.get`; on
  `main` the token reaches one workspace. PR #81 adds per-organization
  grants and `workspaceId` per call. ADR 0028 (proposed) adds a
  system-administrator token policy `all_organizations` with materialized,
  audited grants, enrollment on organization creation, admin revoke with
  sticky revocation, and three new `can()` actions.
- Access matrix: no admin dashboard exists (`orgs/` and `orgs/summaries/`
  only; milestone 36 "no frontend permission center"). Planned as
  `/orgs/access` and `/admin/access` over one core read, with the `can()`
  rows exported to a generated `docs/spec/permissions-matrix.md`.
- Inventory of open work: 46 items with evidence from milestones, reviews,
  the audit, plans and source; sixteen earlier "missing" items confirmed closed.
- `docs/agent-goal-access-and-completion.md`: releases v0.2.18 (PR #81 +
  ADR 0028 + MCP update + SSR `private`), v0.2.19 (matrix, CHANGELOG
  backfill), v0.2.20 (JS→TS + six small fixes); PR #82 and Rust phases
  without a release. Upgrade plan gains the sequence table; JS→TS re-sequenced.

## Missing

- Everything in the goal; ADR 0028 awaits the owner's answer on its three
  open decisions (policy scopes, personal workspaces, summary MCP tools).
- Twin-side changes (whitelist `workspaces.list`, per-workspace context) belong to fenshen01's plan.

## Validation

Docs only: `git diff --check` clean; relative links resolve. No test, build or e2e run was needed or claimed.
