# v0.2.23 — pending grants and audience editing

Status: implemented on the candidate branch; integration acceptance precedes PR merge.

## Targets

- Strict TypeScript: workspace access UI, summary administration forms, existing
  query invalidation, shared validation, browser and authorization tests.
- Existing TypeScript core remains the database, session and permission authority.
- Rust: existing stateless summary renderer is retained; no renderer/engine change.

## Contract

- Show pending permission requests in the workspace access matrix with agent,
  capability, reason, scope and state. Reuse existing GrantActions expiry/allow/
  deny controls and canDecideGrants, and refresh the matrix after each decision.
- Workspace administrators edit audience organization/label and recipient fields
  through existing versioned patches. Validate using the shared schemas, preserve
  drafts after failures, support keyboard cancellation, and retain immutable
  already-generated summary snapshots.
- Retain existing low-role and demotion boundaries. No new authority, permanent
  capability grants, schema migration, dependency, environment or MCP tool.
- Three locales and living specs ship with the behavior. The final branch is
  based on current main; local full-gate evidence is bound to its exact tree.

## Acceptance

Follow [release closeout check 1](release-closeout.md) for the full local gate.
Focused coverage lives in e2e/access.spec.ts, e2e/audience-editing.spec.ts,
packages/core/src/access-matrix.integration.test.ts and web query invalidation
unit tests. Read-only v0.2.22 operator closeout remains a separate running release;
these v0.2.23 UI changes do not authorize a new production rollout.
