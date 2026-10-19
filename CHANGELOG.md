# Changelog

## v0.2.10 — 2026-10-19

- Every MCP tool carries annotations: the 14 read tools are read-only, so
  MCP clients can run them without asking; changes are marked additive or
  updating. The smoke now also covers protocol 2026-07-28 without initialize.

- Admins can rename or archive projects while retaining a person in charge who was later demoted to guest.

- People in charge can move their project's stage from the header with Undo;
  profile and finance edits remain admin-only. Guests cannot be assigned as leads.
- Brief shows stage and person in charge, filters rows and currency totals by
  stage, and exposes both fields over MCP. Project switching groups the pipeline.

- Projects gain a stage (lead, proposal sent, contract signed, in service,
  closed) and a person in charge, set by admins and shown under the title.
- Every person in the organization reads contract, collected and collection %;
  guests and agents see delivery % only. Admins still edit amounts and payments.
- MCP `projects.list` returns stage and `leadId`. Additive migration 0031 (ADR 0021).

## v0.2.8 — 2026-10-17

- Ask for the account first, then a password or an explicitly requested SMS code.
- Preserve the account when changing steps; support keyboard focus and password-manager pairing.
- Match the approved signed-out design with existing ink tokens, underline fields,
  round buttons and system serif headlines in all three locales.
- No migrations or bundled font changes.

## v0.2.2 — 2026-10-15

Accepted live and annotated-tagged on exact source `8d335ff7a9513bf35bcaf6b99c7f54935a0446e4`; 146/146 fresh checks and supplemental route cleanup passed.

- Guard Timeline subtree Undo and commit CRM Undo atomically, protecting newer
  edits and rejecting stale inverses without partial writes.
- Give human task owners/admins the shared reviewable proposal path and person
  attribution; agent scope, assignment and grant restrictions remain.
- Keep MCP limit refusals outside PostgreSQL; guard self identity reads with can().
- Patch the scoped legacy esbuild dependency. Additive migration 0029 supplies
  seven missing relationship/ledger version columns and revision triggers.
- Repair Calendar multi-day target size/ARIA semantics and Relations label
  contrast, with localized browser and rendered-pixel regression evidence.

Release acceptance, exact deployed source, CI and tag are recorded in
`docs/deploy.md` and `docs/milestones/21-v0.2.2.md`. The v0.2.1 audit retains
remaining larger quality work and product/infrastructure recommendations.

## v0.2.1

- Reproducible public acceptance harness; mind-map write/undo and initial-socket
  membership races fixed. Runtime-only credentials and sanitized per-run reports.
- Correct MCP bearer-token copy, verified demo email, queued digest choices and
  optimistic phone status with rollback and Undo. Late reads preserve pending choices.
- Contact-to-project links and role labels; editable/archivable milestones, keyboard
  timeline nudges and whole-day behind values; audited proposal Undo; phone mind
  detail scrolling; desktop snoozed Inbox and embedded agent profile.
- Admin Settings exposes the workspace AI switch in its off state. No model is enabled.
- V2-only visual baselines, Simplified glyph coverage, a small symbols face for
  English Relations and dark locale captures. No dependency is added.

Migration `0027` adds nullable archive/inverse metadata for versioned suggestion
undo, with zero backfill. Generated tasks retain history; concurrent work rejects
undo. Production source, CI, backups and acceptance are recorded in `docs/deploy.md`;
the release tag is created on the exact deployed SHA after acceptance.

## v0.2.0

The frontend v2 release. Prototype v2 (ADR 0014) replaces the v1 UI on phone
and desktop. The tag is created only when every M19 gate and CI are green;
production follows the pinned release candidates in `docs/deploy.md`.

- M11: v2 intake. ADR 0014 records the prototype as the UI source of truth,
  with the plan's decisions D1–D11. It adds the v2 reference captures and
  string table, and makes `main` green again.
- M12: planning and CRM backend. Additive migration `0023` adds plans,
  milestones, dependencies, payments, companies, contacts and their roles.
  The planning read model gives progress, forecast, critical path and risk.
  Finance figures are visible to admins only.
- M13: v2 shell. Phone has four tabs (今天 · 日曆 · 項目 · 我的) with one badge
  count; desktop has a sidebar with ⌘K and fold-to-rail. Also new: Today,
  Me with the Inbox, the MCP page and a signed-out home. Every write goes
  through shared mutation hooks.
- M14: projects board and list, task detail with contacts, the desktop
  calendar and ⌘K search. The plan §6.0 release checklist and the MCP round
  trip run against a production-mode stack.
- M15: companies, contacts and project stakeholders (相關方). Archive and
  restore replace deletion, and every change offers undo.
- M16: the timeline (a Gantt with drag, resize and dependency links,
  critical path and risk) and the relations graph. MCP gains
  `relations.get`.
- M17: the AI brief and Ask taff. Both are rules-based. The model path is off
  unless a workspace opts in and the deployment sets the AI variables
  (ADR 0016); production ships without them.
- M18: the editable mind map (`?view=mind`). It has a canvas and an
  accessible list view, evidence sources, archive and restore, and
  validation tasks. Migration `0026` (edge versions) is additive.
- M19: v1 leftovers are removed and the visual suite is renamed
  `ui-v2.spec.ts`. The Noto Sans TC subsets are regenerated from the v2
  strings, and a lint test catches Simplified characters in zh-HK strings. A
  rerun accessibility audit covers 348 contexts with 0 failures, and the
  locale route captures cover 186 states.

All migrations since v0.1.0 (`0023`–`0026`) are additive. MCP has 30 tools.
Release candidates, CI evidence and deployment checkpoints are recorded in
`docs/deploy.md`. Milestone reports are in `docs/milestones/11-*` to `19-*`.

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
