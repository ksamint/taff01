# 0001 — Audit auth and application mutations in PostgreSQL

## Context

Better Auth owns its user, session and account lifecycle through the Drizzle adapter. Application-only audit helpers would miss those writes, while database hooks cannot independently guarantee an atomic audit with the underlying auth write.

## Decision

Keep Better Auth construction in core, use its official Drizzle adapter with transactions enabled, and audit mutable tables with PostgreSQL row triggers. Every row change inserts an activity record and queues `NOTIFY taff_changes` within the same transaction. Core and seed operations set a transaction-local actor user ID; auth triggers derive their actor from the auth row. Verification maintenance is attributed explicitly to `system:auth` because it may precede an authenticated user.

A user-insert trigger creates a personal workspace and admin person membership within that insert's transaction. Database constraints enforce workspace-local assignees, and a trigger enforces person owners. The core `can` function controls application authorization: workspace members may read/create, task owners and workspace admins may assign, and people may update only their own profile.

## Consequences

Audit and notifications roll back with failed writes; notifications contain identifiers only, never auth contents. New mutable tables must add an audit trigger. A migration is required before auth can run. A signup may generate several events (user, account, workspace, member, session), and clients should invalidate once per affected workspace. Verification is currently unused by the enabled email/password flow; email verification and recovery are future phases.
