# Changelog

## v0.2.25 — timeline, calendar, graph and Sectors views (deployed and accepted)

- Timeline exports fit the full chart with the current critical-path highlight, task bars, milestones and dependencies; up to 60 rows with localized overflow.
- Calendar exports show the visible week or month in the saved viewer's zone, with DST-aware civil days, a separate all-day band, next-day midnight labeled 24:00 and at most eight items per day. Unscheduled tray changes do not affect the image or its hash.
- Mind and relations toolbars export their visible archived, layout, scope and layer options. Graphs use shared web geometry, fit label bounds and show at most 150 nodes and 600 rendered edges with exact localized omitted counts. Relations geometry uses all unique edges between retained nodes; only node truncation can change web positions.
- Confirmed non-guests use the existing preview, send, copy and save dialog. Calendar day/list and relations list presentations hide the export control. Agents use the existing `views.image` tool with current workspace grants and both required read scopes.
- Each view uses authorized core reads, canonical TABLE AI colors, exporter watermark, content hash, the shared quota and bounded snapshot audit. Timeline/calendar PNGs are 1600 px wide, graphs 1080 px; all are palette PNGs at most 4000 px high and 400 KB. These new views contain no finance or private source details.
- Projects → More gains 營運視圖 / Sectors: the 通用營運模板 / generic operation template regroups every task in the workspace by its sector tag (財務與現金, 客戶與市場, 營運與交付, 人才與組織, 風險與安全, 未來), then by project, with each sector's 領先指標 and 結果指標. Untagged tasks are not shown. Tag a task with Quick Add `+財務與現金` or in the task editor.
- Fix (pre-release review of the v0.2.25 exports): a control character in a task title, project, workspace or person name no longer makes timeline, calendar, graph or summary images fail; the renderer draws it as a space.
- Fix (pre-release review of #102): force-layout relations images now place every node exactly where the screen does; the image builder had laid out edges in key order instead of the canonical order core and the web use.
- Together with existing summary images, these complete six outputs: summary, timeline, week, month, mind and relations, using saved locale/time zone unless an allowed locale override is supplied.
- Legacy MCP uses the supported JSON transport so delayed image failures are logged as failed calls after completion. Modern handling and existing limits remain; cancellation settles the HTTP call and releases transport resources without undoing a snapshot already constructed.
- Membership-event bursts now share one refresh batch and a trailing read for current data, preserving immediate session revocation and first-open stale-only behavior. PR104 merged the repair as `08b884a`, with the exact validated source tree.
- No new migration, environment variable, dependency, permission, scope or MCP tool (the Sectors view is client only, and nothing is created when it opens); the catalog remains at 38 tools. All four images now run deployed source `e5a42c51eb8f096b94c34eaa052657afbb00a3d3`, tree `4703801890ecae415bbaba00ba13784c913c758e`, after the full exact-source gate and successful live acceptance. **Tag, receipt, keeper release and independent probe passed** ([milestone 128](docs/milestones/128-v0.2.25.md)); final closeout is accepted. Prior accepted v0.2.24 `ff411c6` remains the rollback source. All four owner checks remain pending after unlock; XIDING creation is separate and pending, and no organization was created.

## v0.2.24 — view exports and workspace lifecycle

- Projects gain Export image: the current project, or the workspace overview with every active project, drawn by the existing Rust renderer as one 1080 px palette PNG of at most 400 KB, watermarked with the exporter, workspace and date and carrying the content hash. The dialog previews it and offers Send (system share sheet), Copy image and Save.
- Members and admins export images; agents use the new `views.image` MCP tool when their effective workspace grant has both `tasks:read` and `summaries:read`. Finance follows the exporter's existing read authority. Image binaries are not stored; REST and MCP share a quota of 10 requests per person or agent per minute.
- Each authorized export snapshot records one `view.export` audit row with bounded metadata and no realtime notification. Workspace administrators see it with a localized label in `/orgs/audit`.
- Desktop Me and search link to shareholder summaries. Pending task-scoped grant requests show an authorized task title and link, with an unavailable fallback.
- Project administrators edit saved-zone deadlines and delivery progress in the existing dialog; summaries and exports reflect those values.
- Organization administrators archive by confirming the exact name and restore archived organizations. Personal workspaces cannot be archived; restore preserves cleared defaults and existing revocations.
- OAuth refresh can issue narrower access scopes while retaining the original refresh grant ceiling. Additive migration 0043 stores that ceiling in nullable `refresh_scopes`; existing grants remain compatible.
- MCP now has 38 tools. Deployment uses the existing internal renderer URL; no new environment value or dependency is required. Timeline, calendar and graph exports follow in v0.2.25.

## v0.2.23 — grant decisions and audience editing

- Workspace access shows pending grant requests with agent, capability, scope and reason; existing expiry, allow and deny controls refresh the matrix after a decision.
- Workspace administrators edit audience organization/label and recipient identity, contact, language, time zone and delivery time using the existing versioned APIs. Existing summary snapshots remain unchanged.
- No new authority, migration, environment value, dependency or MCP tool.

## v0.2.22 — admin screens

- Workspace access gains a Permissions tab: what admins, members, guests and agents may do by default, grouped by area, from the same rows the permission tests use.
- Projects gain a finance panel on the timeline. Every non-guest person reads the contract amount, the collected amount and percent and the payments; administrators set the contract, currency and client company and record append-only payments. A contract needs a currency and the currency locks once money is received.
- Workspace administrators gain an audit log at `/orgs/audit`: the newest 200 recorded changes with actor names, filterable by trace, request, approval or receipt id.
- Web font subsets gain the glyphs the new Chinese strings use; none removed.
- No migration, no new environment value, no new dependency, no MCP or agent change.

## v0.2.21 — candidate designed daily report

- Daily summaries share one display layout across the web page, the text and the image, so all three show the same facts and wording: audience and tag, "prepared for", full date, KPIs, risk, progress, finance, agent runs, counted sections, confidentiality and hash.
- The image (`image-2`) is a colour document in the TABLE AI tokens with KPI tiles, risk badges, labelled progress and finance bars and a short-hash footer; the full hash is in the PNG metadata. Long reports are fitted under a 3,400 px estimate and name what they omit.
- The text (`text-2`) is structured plain text for chat apps that never splits a label from its value.
- The renderer still accepts the previous input for one release and reports its version; the worker stores only `image-2` PNGs. Existing renders are unchanged.
- TypeScript and Rust are the only source languages (ADR 0030): the PostCSS configuration is JSON, and the neighbour check, live e-mail proof and audit checks run as TypeScript. The font subsetter remains Python until a Rust subsetter keeps variable-font tables.
- No migration, no new environment value, no new dependency name.

## v0.2.20 — candidate typed tooling and hardening

- Owned scripts run as strictly checked native TypeScript; the service worker is generated from a separately checked source before web dev/build. PostCSS remains the documented JavaScript configuration exception.
- OAuth setup links to organization management and returns with its original request; desktop Me panels show localized loading feedback.
- Brief workload questions rank current unfinished task ownership counts in all three locales, with source IDs/numbers and current workspace-read authority.
- Reused OAuth codes require the original client and PKCE proof before revocation; replayed refresh credentials end the affected access/refresh family.
- Current supervision and agent permissions remain stable through authorized writes; workspace discovery queries only token-bound candidates.
- Runtime recovery adds bounded shutdown, 20-second SQL statement defaults, persisted noeviction Valkey configuration and tracked dependency fixes. Production activation is pending.
- Additive migration 0042 stores peppered consumed refresh hashes without changing existing credentials, grants or scopes.

## v0.2.19 — access matrices and summary renders

- Workspace/system access matrices reuse current permission checks and existing management operations, with explanations and reversible controls.
- Daily summaries gain immutable, watermarked text and PNG files, generated by the worker and available through the app, shared page and REST.
- A stateless internal Rust renderer ships as a fourth application image; PNGs are 1080px wide and capped at 400KB.
- Scoped agents can read summaries through three MCP tools; audiences, previews and shares remain human-only.
- Permission documentation is generated from the tested permission rows; local Rust parity and licence gates replace runner workflows.

## 0.2.18 — organization access

- Personal MCP tokens can select explicitly authorized workspaces and discover them through context.
- System administrators can enroll a token in active organizations and future organizations without rotation; personal workspaces are excluded.
- Workspace administrators can inspect grant origin, revoke access and explicitly restore it.
- Authenticated SSR application pages use private, no-store caching.

## v0.2.17 — release candidate, 2026-11-05

Shareholder daily summaries (ADR 0027).

- Admins tag projects for a shareholder organization (`Shareholder · {org}`)
  and add recipients with a language, time zone, delivery time and finance and
  names switches. A worker job writes one immutable summary per recipient per
  local day, with the timeline's own risk numbers, a recipient watermark and a
  content hash.
- Recipients with an account read `/summaries`; admins manage audiences at
  `/orgs/summaries` and share a summary by link. A link expires (7 days by
  default, at most 90), is revoked at once, and stops when the recipient is
  paused or the tag archived. The public page `/s/[token]` renders outside the
  app in the recipient's language and is not indexed.
- The public read is rate-limited in Valkey before the database; the token never
  appears in an API path or a log. Agents get no summary access.
- Additive migration 0038 (five audited tables). No new environment variable or
  dependency. The CJK font subsets gain 13 glyphs; none is removed.

## v0.2.16 — 2026-10-31

- Agent project create/edit tools prepare human-confirmed operations with current authority/version checks, explicit currency, amounts, receipts, deadline and progress.
- Private Master confirmation dispatches a signed operation through the original agent; additive migrations preserve audited approval and receipt state.
- See [milestone 82](docs/milestones/82-v0.2.16.md) for runtime evidence and deferred live checks.

## v0.2.15 — 2026-10-28

- New organizations receive a safe default agent; personal signup provisions its own default atomically. Existing workspaces without agents receive an idempotent backfill.
- Organization and MCP settings expose agent creation and explain unavailable or empty states in three languages.
- See [milestone 37](docs/milestones/37-default-organization-agents.md).

## v0.2.14 — 2026-10-28

Node 26 runtime for API, web and worker (ADR 0024).

- Runtime: Node 26 (ADR 0024). CI and the production images use Node 26;
  `@types/node` 26. No source or migration change.
- Live acceptance: the verification-member finance case now matches ADR 0021
  (non-guest people read finance; a guest demotion hides it on an open page).
  Cleanup reads for task calendars, project archives and invitations retry a
  dropped connection or gateway 502/503/504 twice; writes never retry.
- Live acceptance gains a member-supervisor OAuth case (desktop-en only, one
  grant per run). A fresh invited member supervises the Verification agent
  and runs approve, exchange, list, refresh, revoke and restore. It is
  refused above the member scope ceiling, and refused restore after losing
  supervision; a refresh after the loss ends the grant. The full live matrix
  is now 147 cases.
- Live acceptance repeats a timed-out or dropped setup page load once, recorded
  as a `retry|` check; writes never repeat.

## v0.2.13 — 2026-10-21

- Security fix (ADR 0023 amendment): a member could undo an admin's
  revocation of their own OAuth grant within the 10-minute undo window. While
  still supervising the agent, that kept the grant alive; after losing
  supervision, its access token worked again until the next refresh (up to an
  hour). Members now undo only revocations they made, and only while still
  allowed to connect that agent with the grant's scopes. Admins keep undo.
- Release closeout has one checklist, `docs/release-closeout.md`.

## v0.2.12 — 2026-10-20

- Role-based MCP OAuth approval: members connect supervised agents within their
  scope ceiling, manage their own Connected apps, and lose refresh access when
  supervision or role changes (ADR 0023).

- MCP supports OAuth 2.1 (ADR 0022): Claude.ai custom connectors and other
  OAuth clients connect with only the server URL. Dynamic client
  registration, PKCE, hourly access tokens with rotating refresh tokens and
  revocation; an admin or supervising member approves the agent and scopes in the
  browser, and the grant is listed and revoked on the MCP page.
- Additive migration 0032. The web app forwards `/.well-known/oauth-*` to the
  API; Caddy and Traefik are unchanged.

## v0.2.11 — 2026-10-20

- Every MCP tool carries annotations: the 14 read tools are read-only, so
  MCP clients can run them without asking; changes are marked additive or
  updating. The smoke now also covers protocol 2026-07-28 without initialize.

- Visual capture waits for each board card's task access (PR #63); no baseline or product change.

## v0.2.10 — 2026-10-19

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
