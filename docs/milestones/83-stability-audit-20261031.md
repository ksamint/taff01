# Stability audit and release preparation — 2026-10-31

- Requested baseline: PR #81, `55718da1637ef92c76b72e1c80f1b531aa9f6a64`; remote main at start `749811497ce1cc053d098c61570b43101b14b2d6`.
- Production read-only check: API/worker/web remain `b52866ddaf72b09637ca3c7db4e4c5b7a31b0a96`, all restart counts zero. No accepted deployment yet.
- Owner authorizes full isolated verification instead of Actions 8/8, SSH deployment of Taff resources, and at most five minutes of maintenance. Actions 8/8 is not claimed as executed.
- Shared PostgreSQL, ingress, neighboring projects, runner pool and COS configuration remain outside mutation scope.
- Discovery now selects token-bound organization candidates, retaining current authority checks. Fresh-fixture SQL counts before/after 40 unrelated organizations: baseline 10→90; candidate 11→11.
- OAuth fixes cover authenticated authorization-code replay, supervision changes, refresh-family replay detection; consumed refresh hashes are peppered and migration 0039 is additive.
- Capability writes and signed operations serialize on the agent member row. Archive coordination uses compatible shared mutation locks and a rare exclusive archive lock; archive briefly delays writes in other organizations.
- Runtime shutdown waits for all ingress drains, attempts all dependency cleanup, and has a bounded deadline. Valkey deployment configuration specifies noeviction, AOF everysec and a dedicated volume.
- Internal architecture evidence lives in `docs/audit/`; it is excluded from Docker context and is not a deployed route. Source-backed security/runtime findings live in `docs/audits/`.
- Final runtime verification: 117 test files / 1,872 tests passed; lint and six-package typecheck passed. Runtime SQL has a default 20-second statement deadline; explicit URL settings and raw migration connections retain their existing policies.
- Production builds, official MCP refresh-family smoke, local nonroot image smoke and isolated fault/recovery checks passed before the final statement-deadline change; affected final image/smoke checks are being repeated. Full final browser/visual/performance, protected production backup/cutover and observation remain in progress. Exploratory measurements are not release acceptance.
- Original native administrator session verified read-only against all three organizations and original token ID; no production grants have been changed.
- Release harness is staged locally at `/Users/af/cpro01/taff01-stability-release-20261031`; it cannot authorize release until actual final-source evidence and runtime pins are supplied.
