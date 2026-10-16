# 24 — Phone/password sign-in

Date: 2026-10-16 UTC. ADR 0019. Released as v0.2.7.

- Existing phone identities can use provisioned passwords, including without SMS.
- SMS remains the default where configured; all three locales offer a password toggle.
- The native auth endpoint returns secure cookies through a validated thin adapter.
- Private stdin-only setup adds salted credentials only for existing system admins.
  Atomic/idempotent; no account creation, promotion, phone verification or password reset.
- Two requested existing admins configured; both distinct live password logins passed.
  Memberships retained, zero SMS requests and browser errors. No secrets recorded.
- HK/Macau, including en-HK, still default to Traditional Chinese (ADR 0018 closed).
  Live saved-English and code/password-toggle checks passed.
- Source `e6928f066616b400ad2f2740c5e3e388beae5eb3`; annotated tag `v0.2.7`.
- [PR #56](https://github.com/ksamint/taff01/pull/56), [main CI](https://github.com/ksamint/taff01/actions/runs/38930534663), [PR CI](https://github.com/ksamint/taff01/actions/runs/38929288044) green.
- 1662 unit/integration, 264 browser and 166 visual cases. Twelve home baselines
  reviewed; final-source capture matched exactly, unchanged tolerances.
- Local production checklist 32/32, three pinned images and all-31-tool smoke passed.
- Live 22/22 critical/platform/realtime/MCP cases; retries 0; zero cleanup failures.
- Today JS 190.7 KiB; LCP en/CN/HK 624/676/680 ms; Lighthouse P 98/99/99, A/BP 100.
- Steps 0–6: native lock, verified private DB/env backups, scoped replacement;
  no migrations, AI_* unset, neighbors and PostgreSQL preserved.
- Before verification: 3 business orgs, 167 test and 3 admin personal workspaces.
  Test signups auto-create personal workspaces; retained history causes accumulation.
- Open: verification workspace accumulation; no cleanup/deletion change requested.
- Rollback: v0.2.6 source `69434acc66851c766f43834131a449382b461ce7`.
