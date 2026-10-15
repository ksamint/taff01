# UI and UX specification (prototype v2)

The approved UI is **prototype v2** in [`prototype-v2/`](prototype-v2/README.md)
(ADR 0014). It is a working React prototype viewed through `support.js` and
built on the TABLE AI design system (`prototype-v2/_ds/`). The review,
line maps, do-not-port list and milestones are in
[`../frontend-v2-plan.md`](../frontend-v2-plan.md). When the prototype and
this file disagree, the prototype wins for visuals and this file wins for
data and behaviour. The v1 mapping is kept as history in
[`README-v1.md`](README-v1.md).

To view the prototype, serve `docs/ui` statically and open
`/prototype-v2/Team%20Tasks.dc.html` (`?reset` clears its demo state). Click
開始 (phone) and 進入工作區 (desktop). Language and theme live in 我的 ›
偏好設定. Reference captures of every screen, both languages and both themes
are in [`reference-v2/`](reference-v2/README.md)
(`pnpm ui:prototype-shots --v2`). The prototype's strings, mapped to app
keys with the Traditional-character fixes, are in
[`prototype-v2/strings.csv`](prototype-v2/strings.csv).

## Design system

Unchanged from v1 apart from `fonts.css`, so
`apps/web/src/styles/tokens.css` stays the only token source.

- White ground, Universe Deep Blue `#0A1626` for text and structure, Sundial
  Dark Gold `#A88B52` for at most 8 % of a view (one CTA, active and focus
  states), hairline borders `#C5C6CD`, square cards, 2 px controls, 4 px
  dialogs. The dark theme is the prototype's deep-blue range.
- Fonts: Manrope for Latin; Noto Sans TC (self-hosted subsets) for Chinese.
  Chinese never gets letter spacing; the root `lang` follows the locale.
- Icons: Lucide, 1.5 px stroke, `currentColor`. Agent = `sparkles`, person =
  `user`.
- Status colours: success `#2F5D4E`, warning `#8A5A12`, error `#BA1A1A`, with
  pale containers.
- Motion: one easing `cubic-bezier(0.16,1,0.3,1)`, 300/400/500 ms;
  `prefers-reduced-motion` disables it.

**Accessibility floor** (wins over the prototype): 44 px touch targets, 12 px
minimum text, visible `:focus-visible`, names on icon-only buttons, real
buttons and links (no clickable `<div>`), labelled inputs and selects,
dialogs and sheets trap focus and restore it, live regions for optimistic
results and errors, and a keyboard alternative to every drag (board, calendar,
timeline bars and dependency links).

## Navigation

| | Phone (< 1024 px) | Desktop (≥ 1024 px) |
| --- | --- | --- |
| Primary | Tab bar 今天 · 日曆 · 項目 · 我的; FAB for quick add; badge on 我的 | Foldable sidebar: org switcher, ⌘K field, 今天 · 日曆 · 項目 › 公司 · 聯繫人, user footer with badge; fold state remembered per user |
| Secondary | Pushed screens: Inbox, Search, Notifications, Agent, Team, MCP, Company, Contact | Per-view header and filter bar; right detail panel with an empty state; Me tabs 收件箱 · AI 簡報 · 智能體 · 設定 |
| Feedback | Toast with 撤銷 (undo) | Same toast, same undo |
| Signed out | Home landing with sign-in (email, username, SMS) | Same |

The badge count is unresolved reviews plus blockers, everywhere (Today ›
待你處理, 我的, Me › 收件箱). Mentions stay in Inbox › 全部.

## Screens, routes and data

| Screen (prototype lines, §2.1) | Route | Data | Milestone |
| --- | --- | --- | --- |
| Signed-out home and sign-in (phone 48–77, desktop 1152–1183) | `/` signed out | auth methods | M13 |
| Today: agents at work, 待你處理 (top three), due today (phone 83–139, desktop 1359–1404) | `/` | server bootstrap: me, tasks, runs, inbox count | M13 |
| Calendar day / week / month, unscheduled tray, drag with undo; desktop adds 今天 and click-to-create (phone 141–247, desktop 1405–1442) | `/calendar` | `task_calendar`, rrule occurrences | M14 |
| Projects: 項目 · 公司 · 聯繫人 switch; 看板 · 列表 · 時間線 · 更多; status tabs with counts; desktop 4-column board, table list, filter chips (phone 249–369, desktop 1538–1579) | `/projects/[id]?view=board\|list\|timeline\|stakeholders\|relations\|mind` | tasks by project and status; plan model | M14, M16, M18 |
| Task detail: v2 field rows, 聯繫人, review deliverables, subtasks, activity; desktop status control, description, comment input (phone 526–691, desktop 1585–1707) | `/tasks/[id]` (sheet; `@modal` intercept) and `#task=ID`; desktop right panel | task, subtasks, comments, run, task contacts | M14 |
| Review workspace | `/tasks/[id]/review` | run output, checks, comments | M14 |
| Inbox (phone 371–412, desktop Me tab 1444) | `/inbox` (pushed); desktop `/me?tab=inbox` | inbox items, grants | M13 |
| Me: profile, 收件箱 and AI 簡報 rows, agents, 組織 · 團隊 · MCP, preferences (language ×3, appearance, notifications), sign out (phone 414–496, desktop 1443–1537) | `/me`, `/me?tab=agents\|settings` | user, workspaces, members, preferences | M13 |
| MCP: endpoint, OAuth metadata, token shown once, regenerate and revoke with confirm and undo, client config, scopes, tool toggles, integrations, call log (phone 910–988, desktop Me › 設定) | `/me/mcp` | `agent_tokens`, `mcp_calls` | M13 |
| Search ⌘K with tasks, comments, companies, contacts (phone 693–749, desktop 1744–1796) | overlay | search | M14 |
| Notifications, agent profile, team, organizations | `/me/notifications`, `/agents/[id]`, `/orgs` | as v1 | M13 |
| Companies list, detail, create, edit, archive (phone 308, 805–835, desktop 1270–1317) | `/companies`, `/companies/[id]`; desktop split | `companies`, links, roles | M15 |
| Contacts list, detail, create, edit, company change, archive (phone 320, 837–864, desktop 1318–1358) | `/contacts`, `/contacts/[id]`; desktop split | `contacts`, links, roles | M15 |
| 相關方 stakeholders (phone 333, desktop 1239–1269) | `/projects/[id]?view=stakeholders` | `project_contacts`, client company | M15 |
| Timeline (Module Plan 105–187, logic 448–550) | `?view=timeline` | `task_plans`, `milestones`, `task_dependencies`, plan model | M16 |
| Relations graph (Module Relations) | `?view=relations` | `relationGraph` read model | M16 |
| AI brief and Ask taff (Module Plan 240–285, 626–646) | `/brief` (phone overlay); desktop `/me?tab=brief` | `GET /api/brief`, `POST /api/ask` | M17 |
| Mind map (Module Plan 198–237, 552–599) | `?view=mind` | `mind_nodes`, `mind_edges`, sources | M18 |
| Digests | `/digests`, `/digests/[id]` | as v1, restyled on v2 tokens | M19 |

## Prototype data mapped to Taff

| Prototype (`Team Tasks.dc.html`, `taff-store.js`) | Taff |
| --- | --- |
| `ORGS` organization (with one `proj`) | `workspaces`; many `projects` per workspace, client company per project |
| `PEOPLE`, `AGENTS` (supervisor, client) | `members.kind = person \| agent`; `agent_profiles.supervisor_id` |
| `PERMS`, grants | `agent_permissions`, `grants` |
| `REVIEW_CHECKS` | `review_checks` |
| Status `todo`, `doing`, `review` (待確認), `done` | `todo`, `in_progress`, `needs_review`, `done` |
| Task `due` + `dur` (days) | `tasks.due_at`; `task_plans(start_date, duration_days)` keeps `due_at` at the plan end |
| `PLAN`, `DEPS`, `MILESTONES` | `task_plans`, `task_dependencies` (typed task or milestone ends), `milestones` |
| `FINANCE` (contract, collected, HK$) | `projects.contract_amount`, `currency`, `client_company_id`; `project_payments`; `Intl.NumberFormat` in the project currency; admins only |
| `CRM_SEED` companies, contacts | `companies`, `contacts` (archive, never delete) |
| `contact_links` + `contact_link_roles` (polymorphic) | typed `company_contacts`, `project_contacts`, `task_contacts` with role rows checked against `CONTACT_ROLE_RULES` |
| `crmRepair` on load | not ported; read-only admin `auditCrm()` returns `[]` |
| Mind data | `mind_nodes`, `mind_edges`, `mind_sources`, `mind_node_sources` (workspace-scoped) |
| `SUGG` suggestions | pending reviews and grants (existing), plus `suggestions` a person applies |
| `canned` Ask answers | rules fallback behind `POST /api/ask` |
| `TODAY`, `NOW`, `'lx'`, HK$/萬 | member time zone, signed-in member, `Intl` |

## Locales

`en`, `zh-CN` and `zh-HK` (ADR 0005). The prototype's `zh` strings are
Traditional (Hong Kong) and seed `zh-HK`; `zh-CN` is derived and reviewed.
Every string goes through i18next with the three locales in the same commit.
Dates, numbers and currency go through `Intl` in the member's locale and time
zone.

## Port method

The milestone-10 method still applies (`../milestones/10-ui-parity.md`): take
the markup block from the line map, convert it to TSX, lift inline styles into
token-based classes in one stylesheet per area under
`apps/web/src/styles/`, map `Icon`, `Button`, `Switch` and `Badge` to
`apps/web/src/components/ui`, and bind real data where the prototype binds
`st`. Every mutation is an extracted, optimistic hook in `apps/web/src/lib`
that sends `version` and rolls back. Visual baselines are replaced per screen
through `.github/workflows/visual-baselines.yml` and committed beside the
reference capture in the milestone report.

### Visual API calendar clock

Only `playwright.visual.config.ts` starts its dedicated API with
`TAFF_VISUAL_API_CLOCK=ui-v2 node --import ./scripts/ui/visual-clock.mjs …`.
The preload fails closed without that flag and refuses server reuse. Brief and
project Timeline GET requests calculate their real seeded data at
2026-10-08T11:20:00Z, matching the browser capture clock. AsyncLocalStorage keeps
concurrent unrelated requests on real time. Auth middleware inside those two
GET scopes shares the capture date; auth endpoints and write requests do not.
Explicit Date arguments, SQL time, timers and the production source are unchanged.
The capture helper checks both API civil dates and Brief's rendered localized date.
Ordinary browser, MCP and production launches never enable this preload.

`ui:app-shots` connects to an existing isolated stack; start only that stack's API
with the same flag/preload when capturing Brief or Timeline. Never add this flag
to a production environment or a general development API. The native dark-route
workflow owns and cleans up its separate capture API/web process groups.

Native capture supports an explicit partial matrix through the optional
`visual-baselines.yml` `screens` input (space-separated allowlisted screen names,
for example `brief timeline`). An empty input requires 26 light screen groups
(104 cases, 126 PNGs) plus ten v2 dark groups across three locales and both
viewports (60 cases, 60 PNGs): 164 cases and 186 committed references in total.
A partial manifest declares its selected screens, case count and exact expected
PNG paths. Every selected screen runs all four light viewport/locale cases;
selected v2 screens also run six dark cases. Partial artifacts must only replace
their declared paths and do not substitute for the complete CI visual comparison.

The v0.2.1 visual review found that the global desktop shell sidebar column also
constrained the signed-out landing to 240px. Desktop sidebar columns now apply
only to `.app-shell.signed-in`; guests and loading states retain the full viewport.
The shared Home capture readiness check requires the landing width to equal its
phone or desktop viewport within one pixel before approving a reference.


### v0.2.1 capture evidence

The 186 approved baseline PNGs, including 60 dark v2 references, are committed in
[`e2e/__screenshots__/ui-v2.spec.ts`](../../e2e/__screenshots__/ui-v2.spec.ts).
The [import ledger](screenshots/v021-fonts-baseline-import.json) records captured
and repository hashes separately: approved raster-only references were retained.

The additional **186 authenticated dark route PNGs are artifact-only**, covering
31 routes × three locales × two viewports. They are not stored under this
repository's `docs/ui/screenshots/v021-dark/`. Their original archive directory is
`docs/ui/screenshots/v021-dark/`, indexed by the committed
[source/hash manifest](screenshots/v021-dark-route-capture-manifest.json).
Download the [source-pinned GitHub artifact](https://github.com/ksamint/taff01/actions/runs/38679409752/artifacts/11948110771)
from the [successful native run](https://github.com/ksamint/taff01/actions/runs/38679409752).
GitHub Actions retention is 14 days; access can require GitHub sign-in. The index
retains the exact source, archive digest, PNG dimensions and per-file hashes after
artifact expiry. For an available artifact:

```sh
gh run download 38679409752 --repo ksamint/taff01 \
  --name visual-baselines-faf22e04a78622997c5ac21bf95b84ff01640fee \
  --dir /tmp/taff-v021-native-review
```

The archive SHA-256 is
`b7497ffc9bc81ed73f3095fa8e6f5433f73c04ab260fc69836f45f69fc29f7e2`.
The [native network receipts](screenshots/v021-font-native-network.json),
[cold-transfer comparison](screenshots/v021-font-network-comparison.json), and
[font typography A/B](screenshots/v021-font-shaping-comparison.json) explain the
font coverage, transfer and wrapping tradeoffs.
