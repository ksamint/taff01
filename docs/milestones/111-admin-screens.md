# 111 — GUI alignment review and three admin screens (2026-11-07)

From `main` `fbd6fac` (v0.2.21), not released. Plan: [v0.2.22 goal](../agent-goal-v0.2.22-admin-gaps.md).

## Review

All 151 API routes mapped to web callers and specs to components. Three
back-end capabilities had no screen: project finance (ADR 0021), the
milestone 36 audit endpoints, the matrix permission rows (AM-3.1). Still
open: pending grants in the matrix; recipient language/zone/time/contact and
tag label not editable after creation.

## Works

- G3 Permissions tab on `/orgs/access`: grouped, localized, phone-friendly. Spec AM-3.4.
- G1 finance panel on the timeline: non-guests read; admins edit contract,
  currency, client and add payments (`canManageFinance`). Spec `project-finance.md`.
- G2 `/orgs/audit`: newest 200 changes, actor names, four validated filters;
  `integrationAuditResultSchema`. Spec `audit.md`.
- Fonts: pinned pipeline added 临宽币 (SC) and 寬幣臨誌貨踪蹤追 (TC); none removed.

## Validation (Node 26.13.0, PostgreSQL 18.6, Redis 7.0.15, Rust 1.97, Chromium 1243)

| Check | Result |
| --- | --- |
| `pnpm test` (fresh test database) | 138 files, 2,232 passed |
| `pnpm rust:gate`; lint, licence gate, all typechecks | passed; 29 Rust tests |
| Web build, `build:server`, Today JS | passed; 197,427 bytes gzipped |
| Full `pnpm e2e`, three locales | 325 passed, 2 failed, 3 dev-only skips |
| The 2 failures (brief proposal, zh-CN/zh-HK) on a fresh seeded database | 3/3 passed |

Those failures and one summaries unit failure came from long-lived local
databases (leftover proposals filled the Brief's capped list; old summaries
passed the 500-row render scan). Clean main fails identically on that data;
fresh databases pass. Both tests depend on earlier runs; worth hardening.

## Missing

- Recapture the six access images (fifth tab) and the organizations image
  (Audit log button) on the pinned build-1248 pipeline; release v0.2.22 prep.
