# 103 — Twin controller identity receipt compatibility

- Deployed Twin IDU4 adds `controller_identity_id` to trusted review and original-agent signed receipts; Taff's strict schemas rejected both variants.
- Both schemas now accept an optional UUID and retain it in signature/hash checks and the allowlisted integration audit context. Archived receipts without it remain supported.
- The identity claim grants no authority: controller/workspace mapping, current verifier and membership, original credential, scopes and capabilities retain their checks.
- Regression first reproduced with two failing signature tests; both new formats, malformed UUIDs, unsigned tampering and unrelated fields are covered.
- Focused pure signature/audit checks: 9 passed. Authorization matrix and legacy run integration: 837 passed against an isolated native PostgreSQL database; no skipped cases.
- Core typecheck, selected Biome checks and diff validation passed. No dependency or database migration added.
- Spec: agent-access AA-5.7. No push, production mutation or real signed write probe; final v0.2.20 gate and deployment remain pending.
