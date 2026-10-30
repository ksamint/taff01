# Local audit privacy verification — 2026-10-30

Active checkout: `taff01-master-approvals`, branch
`codex/master-approvals-20261029`, committed base `89484b1`, including the
existing uncommitted integration permission/audit work. The older `taff01`
checkout remains on `codex/m9-neo4j-release` (`a7be469`) and was not changed.

## Fixed

Actor grant objects contain complete database rows despite their narrowed static
type. The integration audit context and permission explanation previously copied
these rows, including private free-text grant reasons. Both now share an explicit
projection of capability/decision and grant capability, task/run IDs, status and
expiry. Existing authorization and business mutations are unchanged.

A new unit regression reproduces the previous extra-field leakage and verifies
that persisted context excludes grant reasons, internal permission fields and the
credential hash. It exercises the actual SQL parameter sent to set_config.

## Validation

- Before repair: new privacy regression failed on leaked permission metadata.
- After repair: Vitest 85 files / 880 tests passed; 21 files / 873 tests skipped
  because isolated database/Neo4j services were not configured.
- Six package typechecks passed with `--force` (no cached results).
- Biome passed 536 files; licence gate passed 304 packages; diff whitespace clean.
- Server build passed: five bundles and API/worker production runtime packaging;
  Lighthouse and axe-core were confirmed absent from both runtime trees.

## Remaining

Docker daemon is unavailable; only local PostgreSQL 16 is installed, while the
integration suite explicitly requires PostgreSQL 18. Migration 0035 and current
approval/audit transactions still need fresh isolated PostgreSQL 18 validation.
No frontend build, browser/performance runs, remote CI, push, deployment, shared
host mutation or data migration was performed. Existing dirty work is preserved;
this change is uncommitted with that work for review. Production remains unchanged.
