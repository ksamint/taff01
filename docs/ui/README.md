# UI and UX specification

The approved UI lives in `prototype/`: a working single-file React prototype
(`team-tasks.dc.html`, viewed through `support.js`) built on the TABLE AI design
system (`_ds/table-ai-design-system/`). `prototype/audit-and-upgrade-plan.md` is
the designer's audit of it and the product decisions taken on 2026-10-08. This
file maps the prototype to Taff's routes, data and milestones. When the prototype
and this file disagree, the prototype wins for visuals and this file wins for
data and behaviour.

To view the prototype, serve `docs/ui/prototype/` with any static file server and
open `team-tasks.dc.html`. The page exposes `theme` (light/dark), `lang` (zh/en)
and `agentSpeed` controls. `agent-teammates.dc.html` is an empty placeholder.

## Design system

- Tokens: `_ds/table-ai-design-system/tokens/*.css` (colors, typography,
  spacing, radius, motion, base). They are imported into
  `apps/web/src/styles/tokens.css` and mapped to Tailwind 4 `@theme` names.
  White ground, Universe Deep Blue `#0A1626` text and structure, Sundial Dark Gold
  `#A88B52` for at most 8% of a view (one CTA, active and focus states), hairline
  borders `#C5C6CD`, square cards, 2px controls, 4px dialogs.
- Fonts: Manrope (variable, bundled, OFL) for everything; Noto Sans TC for
  Traditional Chinese (loaded from Google Fonts in the prototype; the app
  self-hosts a subset in Phase 3). Chinese never gets letter spacing: set
  `lang="zh-Hant-HK"` or `lang="zh-Hans-CN"` on the root.
- Icons: Lucide, 1.5px stroke, `currentColor`, sizes 12/14/16/20. Agent =
  `sparkles`, person = `user`.
- Product UI uses semibold headings (`--type-product-*`), status colours
  success `#2F5D4E`, warning `#8A5A12`, error `#BA1A1A` with pale containers.
- Motion: one easing `cubic-bezier(0.16,1,0.3,1)`, 300/400/500 ms, no springs;
  `prefers-reduced-motion` disables everything.
- Dark theme: derived from the deep-blue range in the prototype; carried over as
  is until the brand team reviews it.
- Accessibility floor: 44px touch targets, 12px minimum text (Chinese), visible
  `:focus-visible` ring, screen-reader labels on icon-only buttons, focus trapped
  and returned by sheets and dialogs, a keyboard alternative to every drag.

## Screens and routes

| Screen (prototype) | Route | Data | Milestone |
| --- | --- | --- | --- |
| Today: agents-at-work card, schedule, due today, avatar opens Me | `/` | tasks due today or unscheduled, runs in progress, events | M1 shell, M3 agents card |
| Calendar: day, week, month; day strip; tap day/cell; tap block; drag with undo; tap empty slot to create; drag edge to resize; unscheduled tray; agent background lane | `/calendar` | events (task with start/end), rrule occurrences, tz | M6 |
| Projects: column tabs with counts, board, phone list view with filters and sorting; desktop drag between columns | `/projects`, `/projects/[id]` | tasks by project and status | M5 |
| Task detail: editable title, owner, due date and time, priority, project, labels, subtasks; status picker; assign agent; start agent; pause, resume, cancel; comments; sheets cancel on outside tap | `/tasks/[id]` | task, subtasks, comments, run | M3 (run, assign), M5 (fields) |
| Review workspace: deliverable preview, diff, sources, test results; three-item checklist; approve or request changes with comment; per-item comments | `/tasks/[id]/review` | run output, review checklist | M3 |
| Inbox: All / Reviews / Blockers tabs; approve; grant access; mentions; unread; snooze; grouped by task; badge count; empty state; desktop inbox | `/inbox` | notifications, reviews, grants | M3, M4 |
| Me: organization, team, MCP, language, appearance, notifications | `/me` | user, workspace, preferences | M1 (language, appearance), M2 (MCP), M5 (organization, team), M7 (notifications) |
| Agent profile: tools it may use, supervisor, limits, history; permissions Allow / Ask / Deny; review policy; scoped grants with expiry and history | `/agents/[id]` | member (kind agent), permissions, grants, runs | M3 |
| MCP page: single Streamable HTTP endpoint `/mcp`; OAuth 2.1 metadata; personal access token shown once, regenerate and revoke with confirm, undo and log; copyable client config; clients with scopes; tool toggles; integrations; call log with method and tool | `/me/mcp` | agent_tokens, mcp_clients, mcp_calls | M2 (tokens, log, config), M8 (OAuth 2.1) |
| Search (⌘K): idle state, recent, quick filters, type chips; this org vs all orgs; matches in comments; settings results; keyboard navigation | overlay | tasks, comments, settings pages | M5 |
| Organizations: switch from sheet and desktop menu; create; invite; roles; data changes per org | `/orgs` | workspaces, members, invites | M5 |
| Desktop: sidebar (Today, Calendar, Inbox, Team, Settings), board with filters, selected card, assign, approve, request changes, ⌘K, New task dialog, organization menu | ≥1024px layouts of the above | | M1 shell, then each milestone |
| Quick add: natural-language line parsed into fields the user can edit before creating | sheet on Today and Projects | | M5 |

## Prototype data mapped to Taff

| Prototype | Taff |
| --- | --- |
| Organization (`ORGS`) | `workspaces` |
| People (`PEOPLE`), agents (`AGENTS` with supervisor and client) | `members.kind = person | agent`; `agents.supervisor_id` is a person |
| Status `todo`, `doing`, `review`, `done` | `todo`, `in_progress`, `needs_review`, `done` |
| Priority 1–4 (Urgent, High, Medium, Low) | `tasks.priority` 1–4 |
| Project | `projects` per workspace; `tasks.project_id` |
| Agent run steps, run log | `runs`, `run_events` (tool calls, files, duration, cost) |
| Permissions `allow` / `ask` / `deny` per capability (`tasks.read`, `web.search`, `files.attach`, `repo.read`, `repo.pr`, `repo.merge`, `deploy.prod`, `staging.read`, `staging.write`, `alerts`) | `agent_permissions` with `decision`; `can()` consults them |
| Scoped grants with expiry and history | `grants` (+ activity rows) |
| Review policy (default always review) | `agents.review_policy` |
| Review checklist: matches description; sources or tests verifiable; no actions beyond granted permissions | `review_checks` on a run |
| MCP tools `tasks.list`, `tasks.create`, `tasks.update`, `calendar.schedule`, `inbox.request_review`, `files.attach` | MCP tools over core, arguments from `packages/schemas` |
| MCP scopes `tasks:read`, `tasks:write`, `calendar:write`, `inbox:review` | `agent_tokens.scopes` |
| Call log rows (method and tool) | `mcp_calls` |
| Integrations (GitHub, Figma, Slack, Google Calendar) | Phase 4 backlog; shown as "not connected" |
| Seed: Northwind (5 people, 3 agents), Qingshi Studio, Personal | `pnpm db:seed` recreates Northwind as the demo workspace |

## Locales

`en`, `zh-CN` and `zh-HK` (ADR 0005). The prototype's `zh` strings are
Traditional (Hong Kong) and seed `zh-HK`; `zh-CN` is the Simplified counterpart.
