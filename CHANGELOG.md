# Changelog

## v0.1.0

The release tag is created only after complete M9 validation and green CI. The
accepted live application remains `23387723f8c438d990db00d561cba2899f48ab80`;
subsequent source preparation does not update production automatically.

- M1: TABLE AI design tokens, light/dark mobile-first shell, Today, Projects,
  Calendar, Inbox and Me; English, Simplified Chinese and Hong Kong Traditional
  Chinese; shared accessible buttons, fields and dialogs.
- M2: one-time agent token display, peppered token hashes, Streamable HTTP MCP,
  per-token Valkey limits, authorized call history and MCP configuration.
- M3: agent runs and state transitions, actual events/artifacts, capability
  permissions and expiring grants, recipient Inbox, human review checklist and
  per-item decisions. Agent output waits for human approval.
- M4: workspace-authorized WebSockets, cache reconciliation after reconnect and
  optimistic task/run/review/permission/Inbox/settings changes with rollback.
- M5: versioned tasks, subtasks/comments, project boards/lists, authorized search,
  editable Quick Add, organizations, invitations and admin/member/guest roles.
- M6: day/week/month calendar, authorized moves/resizes with Undo, slot creation,
  unscheduled tasks and agent time; bounded recurrence with saved time zones.
- M7: authenticated IndexedDB query cache, public-only service-worker caching,
  notification preferences and recipient-scoped daily digest snapshots.
- M8: authorization/concurrency audit fixes, hardened MCP boundary and rate limits,
  socket lifecycle, database vocabulary constraints, production server bundles,
  Docker Compose/Caddy images, licence gate and performance measurement.
- M9: signed-in Today bootstrap and performance improvements, strict
  all-locale Lighthouse reports and LCP CI guard, keyboard and locale QA,
  idempotent prototype content including digest snapshots, SMTP invitations and
  independent email ownership verification, accessible light/dark tokens and
  targets, refreshed visual baselines, and a dedicated base-Compose worker image.
  Final integration acceptance is recorded in
  `docs/milestones/09-hardening-and-handoff.md`.

Additional accepted changes include the prototype source port and reviewed
visual baselines, workspace `KEY-number` task references with additive
rollback-compatible migrations, username and optional Tencent SMS login,
protected system administration and workspace-admin agent creation from Team.
The public agent flow is verified through official SDK submission, Inbox human
approval and token revocation.

Invited users must prove ownership of the invited email before joining. Existing
email/password, username and SMS sign-in remain available. SMTP delivery failure
preserves the committed invitation and copyable link; development fallback mail
contains secret verification links in a private file, never ordinary logs.

Open product decisions: MCP OAuth 2.1 authorization server, BullMQ PostgreSQL
backend and scheduled stack upgrades. Neo4j integration still requires graph
model and isolation scope. No offline write synchronization is provided.
