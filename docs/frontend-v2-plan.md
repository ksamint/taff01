# Frontend v2 — review and implementation plan

Status: delivered. All of M11–M19 is merged, and v0.2.0 (`191243d`) is live
on `https://taff.apuch.cn` and tagged (2026-10-15). §10 lists what is open.

**User directive, 2026-10-14:** do not stop for decisions. The agent builds
every default in §5 and develops through to a live, working frontend on
`https://taff.apuch.cn` for review. Basic functions and MCP come first (§6.0). The agent prompt
that executes this plan is [`agent-goal-frontend-v2.md`](agent-goal-frontend-v2.md).

## 1. Goal

Replace the current web frontend (the v1 prototype port merged through PR 2 and
milestone 10) with the approved **prototype v2** in
[`ui/prototype-v2/`](ui/prototype-v2/README.md). Ship every screen on phone and
desktop in en, zh-CN and zh-HK, backed by real data. Keep the architecture,
security, performance and test rules of `instruction_v0.md` and
`docs/agent-goal.md`.

v2 is not just a reskin. It adds four product areas that have no backend
today:

1. **CRM:** companies, contacts, project stakeholders, task contacts, and roles
   with integrity rules.
2. **Planning:** a timeline (Gantt) with durations, dependencies, milestones,
   critical path and slip forecast.
3. **Relations graph and mind map.**
4. **AI brief:** portfolio risk, finance, suggestions and "Ask taff".

So the plan is backend first, then screens, then the new modules.

## 2. Inputs reviewed

The upload `Human-AI_task_collaboration_prototype_2.zip` (SHA-256 `08ee5ea3…efb4`)
is committed unchanged in `docs/ui/prototype-v2/`, apart from two offline
patches listed in its README. Reviewed:

- **`Team Tasks.dc.html`** (3,036 lines): every block, against the v1 prototype
  in `ui/prototype/team-tasks.dc.html`.
- **`Team Tasks Module Plan.dc.html`** (timeline, mind map, AI brief) and
  **`Team Tasks Module Relations.dc.html`** (graph).
- **`taff-store.js`:** the data layer, CRM rules, planning model and seeds.
- **`db/schema.sql`:** the designer's reference schema.
- **`DEPLOY.md`:** the designer's parity table, CRM rules and release checklist.
- **The current app:** `apps/web` routes, components, libraries, locales, e2e and
  visual suites, gates, CI, and the M9 and M10 milestone reports.
- **A headless Chromium smoke run** of the prototype, offline, with every
  external request blocked:
  - No page errors and no failed requests.
  - 45 parse-time SVG attribute console errors from the status-glyph
    templates. These are harmless noise.
  - Tabs, desktop sidebar views, inbox, AI brief, timeline, companies and
    contacts all render and respond.

### 2.1 Prototype v2 line map (`ui/prototype-v2/Team Tasks.dc.html`)

**Phone (H5)**

| Block | Lines | Block | Lines |
| --- | --- | --- | --- |
| Home overlay | 48–77 | Search | 693–749 |
| AI brief overlay | 79–81 | Notifications | 751–772 |
| Today (agents 93–108, 待你處理 110–122, due 125–138) | 83–139 | Agent profile | 774–803 |
| Calendar (day 159, week 195, month 228) | 141–247 | Company page | 805–835 |
| Projects: board 260, list 289, companies 308, contacts 320, stakeholders 333, embeds 362–364 | 249–369 | Contact page | 837–864 |
| Inbox (pushed screen) | 371–412 | Team | 866–908 |
| Me (inbox and brief rows, agents, settings, preferences, sign out) | 414–496 | MCP | 910–988 |
| FAB, tab bar | 498–524 | Sheets (quick add 995 … new company 1107, new contact 1112, changes 1120) | 990–1129 |
| Task detail (contacts 577–597, review 606–637) | 526–691 | Toast | 1131–1136 |

**Desktop**

| Block | Lines | Block | Lines |
| --- | --- | --- | --- |
| Home overlay | 1152–1183 | Me tabs (inbox 1444, agents 1470, settings 1498) | 1443–1537 |
| Sidebar open / folded rail | 1185–1218 | Board / list | 1538–1572 |
| Header bar, filter bar | 1221–1238 | Embedded timeline / relations / mind | 1573–1579 |
| Stakeholders | 1239–1269 | AI brief | 1580–1582 |
| Companies (list + detail) | 1270–1317 | Right detail panel (contacts 1600–1620) | 1585–1707 |
| Contacts (list + detail) | 1318–1358 | Org popover, quick-add modal | 1709–1742 |
| Today | 1359–1404 | ⌘K palette | 1744–1796 |
| Calendar | 1405–1442 | | |

**Script and data**

- Strings `S`: lines 1852–1889, extended at 2131–2139. They are zh (zh-Hant-HK)
  and en only, 299 keys.
- Seed constants: `PEOPLE` 1815, `AGENTS` 1822, `ORGS` 1831, `PERMS` 1901,
  `REVIEW_CHECKS` 1907, `initTasks` 1917, `initEvents` 1968.
- Behaviour: `Component` at 2141–3033, with CRM methods at 2220–2319 and
  `renderVals0` at 2679.
- `CORE`, `PLAN`, `DEPS`, `MILESTONES`, `SUGG`, `ROLES` and `CRM_SEED` live in
  `taff-store.js`.

**Module Plan**

- Headers: 33–56. Gantt: 105–187, logic 448–550. Mind map: 198–237, logic
  552–599.
- Brief: 240–285, logic 419–446 and 679–699. Ask: 626–646.
- Strings `T`: 316–323. Mind data: 325–364.

**Module Relations**

- Props: 82. Node and edge styles: 91–101. Force layout: 163–182. Layered
  layout: 245–261.
- Pan and zoom: 148–199. Inspector: 58–78 and 311–332.

### 2.2 What changed from v1 (what the current app shows)

**New**

- Signed-out home page.
- CRM: the 項目 · 公司 · 聯繫人 switch in Projects; company and contact lists and
  detail pages; 相關方 (stakeholders) view; 聯繫人 section in task detail;
  role chips; toasts with 撤銷 (undo).
- Projects views: 時間線 (timeline) and 更多 › 相關方 · 關係圖 · 心智圖.
- AI 簡報 (brief) on phone and desktop.
- Today › 待你處理 (top three awaiting you).
- Desktop:
  - Today and Calendar views.
  - Me tabs: 收件箱 · AI 簡報 · 智能體 · 設定.
  - Companies, contacts and stakeholders views.
  - Foldable sidebar rail with a user footer.
  - Agent filter chip.
  - Empty-panel state.
- `#task=ID` deep links.

**Changed**

- Phone tab bar goes from 5 tabs to 4: 今天 · 日曆 · 項目 · 我的. The
  inbox badge moves to 我的.
- Today loses the 日程 timeline and gains 待你處理.
- Me gains:
  - a 收件箱 row with a badge;
  - an AI 簡報 row;
  - an 智能體 list;
  - 跳過首頁 (skip home);
  - 登出 (sign out).
- Desktop sidebar is now 今天 · 日曆 · 項目 › 公司 · 聯繫人. The agent list and
  inbox item leave the sidebar.
- Status wording: 待審核 / "Needs review" becomes 待確認 / "To confirm", but
  only half-migrated (see §2.4).

**Moved**

- Inbox: from a phone tab to a pushed screen reached from 我的, Today ›
  查看全部 or the toast. On desktop it becomes the Me › 收件箱 tab.
- Agent list: from the desktop sidebar to Me › 智能體.

**Unchanged**

- These phone blocks match v1 apart from markup normalisation:
  - calendar
  - search
  - notifications
  - agent profile
  - team
  - MCP
  - toast
  - all sheets except the two new CRM sheets
- Task detail is also unchanged apart from the contacts section.
- The design system is byte-identical to v1 except `tokens/fonts.css`. The
  current `apps/web/src/styles/tokens.css` therefore stays the token source;
  no palette change.

### 2.3 Current frontend: keep and replace

**Keep, then extend or restyle:**

- `apps/web/src/lib/*`: API client, query hooks, optimistic helpers,
  session cache, server bootstrap, realtime, IndexedDB persistence, PWA,
  i18n, locale loader, theme.
- From `providers.tsx` and `app/layout.tsx`: server bootstrap
  (ADR 0008/0012), locale and `lang`, theme and invite boot scripts.
- From `app-shell.tsx`: the session-confirmation gating, workspace persistence,
  profile mutation, realtime wiring and ⌘K handling, extracted from its markup.
- Route handlers (`locales`, `manifest.webmanifest`, `offline`) and
  `public/sw.js`.
- `src/styles/tokens.css`.
- Locales. The keys are reused wherever the meaning is unchanged.
- Gate scripts: budget, LCP, Lighthouse, licence, server build.
- Schedule-X for the calendar. It is part of the fixed stack and the phone
  calendar is unchanged in v2.

**Replace:**

- Every screen component under `src/components`, plus the `ui/` primitives
  where v2 needs other variants.
- About 6,900 lines of route CSS (`base.css`, `projects.css`, `*-parity.css`
  and so on).

**Handle with care:**

1. **Inline mutations.** About 35 optimistic `useMutation`s live inside screen
   components (organizations 6, agent profile 3, MCP 2, review 2, task detail 2,
   task editor 2, quick add 2, SMS 2, email verification 2, app shell 2, and
   one each in today, inbox, projects, calendar scene, run panel, grant actions
   and auth). Move them into `src/lib` hooks before deleting any screen.
2. **E2E coupling.** The behavioural suite uses about 725 `getByTestId`, 83
   CSS-class locators, Schedule-X `.sx__*` internals, native `<dialog>`,
   `<select>` and `<details>` semantics, and about 76 `messages[locale].<key>`
   lookups. The perf scripts depend on `today-heading` and the `auth-*` test
   ids.
3. **Visual CI.** CI compares 86 visual baselines (16 screens × 4 projects)
   before it runs e2e. `visual-baselines.yml` pins that count, and
   `ui-v2.spec.ts` (formerly `ui-parity.spec.ts`) pins the screen list and
   asserts exactly four font faces.
4. **Budget headroom.** The Today bundle has about 8.6 KB of gzip headroom
   (196,205 / 204,800 B). Every new area must be a lazy route chunk.
5. **Font subsets.** The Noto Sans TC subsets in `public/fonts` were cut from
   the v1 strings. New Chinese strings fall back to system fonts until the
   subsets are regenerated.

### 2.4 Defects in the prototype: do not port

The prototype is the visual source of truth, not the behavioural one. Fix
each of these in the port.

**Counts, navigation and actions**

1. **Count mismatch.** Today's 待你處理 count uses all inbox items, including
   mentions. The 我的 badge and the inbox count use reviews + blockers only.
   Use one count: unresolved reviews + blockers. Mentions stay in Inbox ›
   全部.
2. **Home overlay.** It shows on every load and covers `#task=` deep links. In
   the product it is the **signed-out** landing (it absorbs the current
   `<Auth/>` screen). Signed-in users land on Today, and deep links always
   open their target. 跳過首頁 is not ported (decision D3).
3. **Desktop toast.** Desktop has no toast, so undo is invisible there. Port
   the toast to both layouts.
4. **⌘K on desktop.** Desktop results open phone screens. Results must
   navigate within the active layout.
5. **Desktop review and token actions.**
   - 要求修改 (request changes) must open the comment input, not send canned
     text.
   - The grant action keeps 始終允許 (always allow).
   - Regenerating the personal access token keeps its confirm step.
6. **Undo model.** Undo restores whole snapshots and ignores versions. Undo
   must call the inverse API operation with `version` (the existing
   optimistic-rollback pattern), never restore a blob.

**CRM**

7. **Role toasts.** Plain role edits show no toast, which contradicts
   DEPLOY.md. Every CRM mutation gets a toast with 撤銷.
8. **Editing gaps.**
   - Contact email cannot be entered.
   - The desktop contact form lacks phone.
   - Contacts and companies cannot be edited.
   - Deleting a contact has no confirm.
   - CRM records are not searchable.

   Add edit forms, a confirm, and CRM results in search.

**Other behaviour**

9. **Calendar and due date.** A calendar move does not update `due`. Keep the
   app's current rule from `docs/calendar.md`; the timeline, by contrast,
   edits the plan dates (§4.1).
10. **One project per org.** The prototype assumes it (`ORGS[org].proj`). The
    product supports many projects; the client company is per project.
11. **Hard-coded data and formatting.**
    - Clock: `TODAY = 8`, `NOW = 680`, a 42-day window.
    - Current user: `'lx'` and the greeting.
    - Currency: the HK$ and 萬 formatter.
    - Review meta: shows ¥.

    Use the user's time zone, the signed-in member, and `Intl.NumberFormat`
    with the project currency.
12. **Fake intelligence.**
    - Suggestion `sg-147` invents subtasks attributed to an agent.
    - One-tap Approve and Grant from the brief bypass review.
    - The mind map's "AI insight" is static text.
    - Progress is simulated from fake agent steps.

    These break "agent output waits in needs_review" and `docs/planning.md`.
    See §4.4.

**Strings and accessibility**

13. **Strings.**
    - Simplified or variant characters in the Traditional table: 搜寻, 資讯,
      注冊, 復制, 合並, 内, 准備, 標准, 重復, 帐戶, 標簽, and 周 against 週.
    - The review vocabulary is half-migrated (§5, D5).
    - About 65 inline `zh ? … : …` strings.
    - Mismatched pairs: 開始 / "Start agent", 關係 / "Graph".

    All strings go through i18next in three locales.
14. **Accessibility.**
    - 169 text sizes below 12 px.
    - Many phone targets of 28–40 px.
    - `all:unset` removes visible focus.
    - 17 clickable `<div>`s.
    - Unlabelled selects and inputs.
    - Gantt handles of 9 px.
    - No keyboard alternative to the timeline drag, board drag or link drag.

    The `docs/ui/README.md` floor wins (44 px targets, 12 px text, focus,
    names, keyboard alternatives).
15. **DEPLOY.md.** It disagrees with the prototype in four places: 我 vs
    我的, 簡報 vs AI 簡報, 關係/心智 vs 關係圖/心智圖, and the settings
    order. Where they disagree, the prototype markup wins.

### 2.5 `db/schema.sql` is a reference, not a migration

It conflicts with the repository on almost every axis:

- **Ids:** text slugs, while the repo uses uuid plus a per-workspace number.
- **Tenancy:** `organizations` and `actors`, while the repo uses `workspaces` and
  `members`.
- **Content language:** bilingual `*_zh`/`*_en` columns, while the repo stores
  single-language content.
- **Dates:** `due_date` plus `duration_days`, while the repo uses `due_at` plus
  `task_calendar`.
- **Versions:** none.
- **Integrity:** polymorphic ids without foreign keys; untenanted
  `mind_*`/`value_edges`.
- **Audit:** its own `notify_change()`, while the repo uses
  `taff_audit_change()`.

Its free-text `RAISE` exceptions would also surface as HTTP 500s. Port the
**concepts** into Drizzle migrations shaped like the existing ones:

- `id uuid` and `workspace_id`, with `unique(workspace_id, id)`.
- Composite foreign keys.
- `version` on editable rows.
- An `_audit` trigger on every table, because the trigger reads `row->>'id'`
  and `row->>'workspace_id'`.
- Typed link tables instead of polymorphic ones.

## 3. Principles for the port

- **Port from source, not from images.** For each screen:
  1. Take the markup block from §2.1.
  2. Convert it to TSX.
  3. Lift the inline styles into token-based CSS classes.
  4. Map `Icon`, `Button`, `Switch` and `Badge` to `apps/web/src/components/ui`.
  5. Bind real data where the prototype binds `st`.

  The M10 method still applies.
- **One CSS system.** One stylesheet per area under `apps/web/src/styles/`
  (not one per screen version), built only on `tokens.css`. Delete each v1
  file when its last user is gone.
- **Every mutation is an extracted hook in `src/lib`.** It is optimistic,
  rolls back, and sends `version`. Screens hold no `useMutation`.
- **Server reads are pure core functions.** Timeline model, forecast, critical
  path, brief and graph are pure functions in `packages/core` (for example
  `plan-model.ts`) with unit tests. The client only renders.
- **Embedded modules become lazy route components.** They are not iframes or
  `dc-import`, and they render hand-rolled SVG with no graph or Gantt library.
  - Ruled out by licence: `elkjs` (EPL-2.0) and `dhtmlx-gantt` (GPL).
  - Ruled out by the 20 KB rule: `cytoscape`, `vis-network` and `dagre`.
  - `frappe-gantt` ships its own CSS system.
  - `d3-force` (ISC) is the only fallback, and only with a size measurement
    and an ADR.
- **Keep test contracts.** Keep a test id or role name wherever the semantics
  survive (`today-heading`, `auth-*`, `task-detail-heading`, `review-approve`,
  `quick-title` and so on). When markup must change, update the selector in
  the same commit, never the behaviour.
- **Lazy-load.** The Today route must not grow. CRM, timeline, relations, mind
  map and brief load on demand. Check `pnpm perf:budget` after every
  milestone.

## 4. Backend additions

Each item goes through `packages/schemas` (Zod), then `packages/core` (one
transaction, an `activity` row and `NOTIFY` via the audit trigger, and
`can()` with table-driven tests), then a thin REST route, then an MCP tool where
listed. Each new table is added to the change-event whitelist
(`packages/schemas/src/changes.ts`), the realtime routing
(`apps/api/src/realtime.ts`), the web invalidation families
(`apps/web/src/lib/realtime.ts`) and the seed. Each new MCP tool is added to
`pnpm mcp:smoke`.

### 4.1 Planning: timeline, dependencies, milestones, finance

**Tables**

- **`task_plans`**: `id = task id`, `start_date date`, `duration_days`, `version`.
  - Core keeps `tasks.due_at` at the end of the plan's end date in the editor's
    time zone.
  - A separate table keeps timeline drags from bumping `tasks.version`.
- **`milestones`**: project, name, date.
- **`task_dependencies`**: typed nullable predecessor and successor columns
  (task or milestone), with `num_nonnulls` checks and cascading foreign keys.
  Core rejects duplicates and cycles (recursive CTE under a workspace lock,
  like `lockWorkspace`) with `taff_conflict` → 409.
- **Project finance**: `projects` gains `contract_amount numeric(14,2)`,
  `currency`, `client_company_id`. A new `project_payments` table records
  payments.

**Core read model `plan-model.ts`**

- Start and end dates, with default durations.
- Parent spans and duration-weighted progress.
- `behind`, the forecast end date, and conflicts.
- Critical path.
- Risk level and reason as a code, never text.
- Delivery and collected percentages.

**REST**

- `GET /api/projects/:id/timeline`
- `PATCH /api/tasks/:id/plan` (accepts `shiftChildren`)
- Milestones: `POST /api/projects/:id/milestones` and
  `PATCH`/`DELETE /api/milestones/:id`
- Dependencies: `POST /api/dependencies` and `DELETE /api/dependencies/:id`
- Payments: `GET`/`POST /api/projects/:id/payments`
- `PATCH /api/projects/:id`, extended with the finance fields

**MCP**

| Tool | Gate |
| --- | --- |
| `timeline.get` | `tasks:read` |
| `tasks.plan` | `calendar:write`, own tasks only |
| `dependencies.add` / `dependencies.remove` | `tasks:write`, worker of the successor |

**Permissions**

- `task:schedule` (reused) for plans.
- `dependency:edit`: owner or admin of the successor; an agent only as its
  worker.
- `milestone:manage`: reuse `project:manage`.
- `finance:read` and `finance:manage`: admins by default (D7).
- `getWorkspaceAccess` gains `canEditPlan` and `canReadFinance`.

### 4.2 CRM

**Tables**

- `companies`.
- `contacts`, with `company_id` as a composite foreign key and `ON DELETE SET
  NULL (company_id)` in hand-written SQL.
- Link tables:
  - `company_contacts`, with a foreign key to `contacts(id, company_id)` so
    only the employer can be linked.
  - `project_contacts`.
  - `task_contacts(task_id, project_id, contact_id)`, with a foreign key to
    `project_contacts` that cascades. This makes "task contact ⇒ project
    stakeholder" and "removing a stakeholder removes its task links"
    declarative.
- Role rows, with a CHECK on the allowed (scope, role) pairs.
- A partial unique index for the exclusive roles: `chair` per company,
  `signoff` per project or task.

**Roles**

- One `CONTACT_ROLE_RULES` table in `packages/schemas` drives Zod, core, the UI
  and the CHECK constraint:

  | Role | Scopes | Exclusive |
  | --- | --- | --- |
  | decider | company, project, task | no |
  | chair | company | yes |
  | ops | company, project, task | no |
  | broker | project | no |
  | tech | project, task | no |
  | finance | company, project | no |
  | signoff | project, task | yes |

- Role labels live in i18next, not the database.

**DEPLOY.md rules 1–7**

- Implemented in core functions that return what changed, for the toasts:
  - `setContactRoles` returns `{replaced, addedProjectStakeholder}`.
  - `unlinkContact` returns `{cascadedTaskLinks}`.
  - `setContactCompany` returns `{dropped}`.
- `updateTask` moves the task's contacts when its project changes. The
  prototype misses this case.
- Repair-on-load is **not** ported. A read-only admin `auditCrm()` returns `[]`
  after every test scenario.
- Archive, don't delete (D4).

**REST**

- Full CRUD on `/api/companies` and `/api/contacts`.
- `PATCH /api/contacts/:id/company`.
- `GET /api/{companies|projects|tasks}/:id/contacts`.
- `PUT` and `DELETE …/contacts/:contactId`.

**MCP and permissions**

- Read-only tools: `companies.list`, `contacts.list`, `contacts.get`.
- A new token scope `crm:read` and capabilities `crm.read` (default `ask`) and
  `crm.write` (default `deny`). Agents never receive contact phone numbers or
  email unless granted.
- `contact:read` and `contact:manage`/`company:manage` for non-guest people;
  archive is admin-only.
- Search covers companies and contacts.

### 4.3 Relations graph and mind map

**Relations**

- A read-only core read model `relationGraph(workspace, {projectId, layers})`
  built from projects, tasks, members, runs, dependencies and CRM.
- Value-chain nodes (service, data, value) are new data: `value_nodes` and
  `value_edges`. Ship them only if D8 keeps them. Otherwise drop that layer.
- Endpoint: `GET /api/workspaces/:id/graph`.
- MCP: `relations.get`.

**Mind map**

- New tables `mind_nodes` (layer, angle, strength, momentum), `mind_edges`,
  `mind_sources` and `mind_node_sources`, all workspace-scoped.
- "Turn into a validation task" creates a real task, owned by the signed-in
  person and due in their time zone, and links it.
- The prototype's insight copy is static. It ships labelled as a note, not as
  AI, until §4.4's model path exists.
- Scope (per project or per workspace) is D8.

### 4.4 AI brief, suggestions and Ask taff

- **Brief.** `GET /api/brief?scope=` is deterministic. It is built from
  `plan-model.ts` across the caller's memberships only, and returns codes and
  numbers that the web localizes. It ships in v2.
- **Suggestions.** Pending reviews and grants are already modelled.
  - The brief's Approve opens the existing review workspace.
  - Grant uses the existing grant-decision endpoint.
  - No one-tap bypass.
  - Agent proposals (split, reschedule) get a `suggestions` table with a Zod
    union payload. A **person** applies them through the normal core
    functions; agents can only propose (`suggestions.create`).
- **Ask taff.**
  - `POST /api/ask` uses a rules fallback (the ported `canned` router) that
    returns structured answers.
  - A model provider is optional, behind `AI_BASE_URL`, `AI_API_KEY` and
    `AI_MODEL` (plain `fetch`, key redacted in pino), and only when the
    workspace's `ai_enabled` is on (default off).
  - The provider choice needs an ADR. Sending workspace data to a third party
    stays off until the user configures it (D6).
  - Ask is rate-limited per user in Valkey.
  - No `ask` MCP tool. Expose `brief.get` instead.

## 5. Open decisions

The user delegated every decision below (2026-10-14). The agent builds the
default, records it in ADR 0014 or a later ADR, and never stops to ask. The
user redirects asynchronously.

| # | Decision | Default |
| --- | --- | --- |
| D1 | Tag `v0.1.0` from the current UI before v2 starts? | Only if `main` CI is already green: tag it and continue. Otherwise do not block on it; v2 becomes `v0.2.0`. |
| D2 | One feature branch or a branch per milestone? | Branch per milestone from `main`, each merged green. The 4-tab shell switch (M13) lands in one PR so `main` never shows a mixed navigation. |
| D3 | Home page and 跳過首頁 | Home is the signed-out landing with sign-in. Signed-in users go to Today. No skip-home setting. |
| D4 | Delete or archive contacts and companies | Archive with undo; the UI's 刪除 action archives. No hard delete, so no data is lost. |
| D5 | Review vocabulary (prototype half-migrated) | Status and request: 待確認 / "To confirm" and 請求確認 / "requests confirmation". Review-workspace nouns stay 審核 / "Review". zh-CN follows zh-HK. Recorded in ADR 0014. |
| D6 | LLM provider for Ask taff and AI insight, and sending data to it | Ship the rules-based brief and Ask. Build the model path as a generic OpenAI-compatible `fetch` adapter, env-gated (`AI_*` unset in production) and per-workspace opt-in (default off), with an ADR. No workspace data leaves the system until the user sets the env and opts in. |
| D7 | Who sees finance (contract amount, collected) | Admins only. Members see delivery %. |
| D8 | Mind map and value chain: scope and whether they ship in v2 | Mind map per workspace, shipped last (M18). Value-chain layer deferred. Relations shows people, dependencies, org and CRM layers. |
| D9 | Relations "company" node: workspace or CRM client company? | CRM client company. The workspace is the root. |
| D10 | Moving a parent bar: whole subtree or direct children only? | Whole subtree, one transaction, one undo. |
| D11 | Retire v1 references (`docs/ui/prototype`, `docs/ui/reference`, 86 baselines)? | Keep v1 files as history. Replace the baselines screen by screen. Delete only the v1 CSS and components. |

## 6. Milestones

### 6.0 Delivery order: basic functions and MCP first, then live

**Phase A, to the first live review release (R1):**

1. M11, kept lean: ADR, README and references.
2. M12, backend.
3. M13, shell, Today, Me, Inbox and sign-in.
4. M14, projects, task detail, calendar and search.
5. The MCP items in M13 and M14.
6. **R1**: publish the release candidate; the local agent deploys it to `https://taff.apuch.cn`.

**Phase B:** M15–M18, each redeployed live when green.

**Phase C:** M19, which ends with the `v0.2.0` release.

The basic-function checklist below must pass on the live site, in en and
zh-HK, on phone and desktop, before R1 is reported:

1. **Sign-in and preferences.** Sign up and sign in (email and username;
   SMS where configured), sign out. Switch language (three) and theme.
2. **Tasks.** Create a task from the FAB or quick add and from the desktop
   新建任務 button. Edit title, owner, due date, priority, project, labels and
   subtasks. Comment.
3. **Agents and review.** Assign to a person and to an agent. Start, pause,
   resume and cancel a run. Approve and request changes from the inbox and
   the review workspace. Grant access to a blocked agent.
4. **Projects.** Change status on the board by drag and by the status control.
   Use the list view with filters.
5. **Calendar.** Use day, week and month. Schedule an unscheduled task. Drag,
   resize and undo.
6. **Search and organizations.** Search (⌘K) and open a result. Switch
   organization, create an organization, invite a member, change a member's
   role.
7. **Settings.** Notification preferences. Agent profile permissions and
   review policy.
8. **MCP.** The MCP page shows the endpoint `/mcp`, the copyable client
   config, the scopes and the call log. Issue a token (shown once),
   regenerate with confirm, revoke with confirm and undo.

   A real MCP client (`@modelcontextprotocol/client`, the same code as `pnpm
   mcp:smoke`) runs against the **live** endpoint with a freshly issued
   token. It calls every tool and sees the rate limit; its calls appear in the
   call log and the created task appears in the UI in real time. Revoke the
   token afterwards.

   Record the result without printing the token.

**Who deploys.** The cloud build agent cannot reach the host, so it never
deploys. For each release it:

- merges to `main` with green CI;
- passes the checklist against a local production-mode stack;
- appends a `Frontend v2 release candidate` section to `docs/deploy.md`.

The local agent deploys each candidate with
[`agent-goal-deploy-frontend-v2.md`](agent-goal-deploy-frontend-v2.md),
using the same lock, backups, detached SHA, migrator and API/worker/web-only
replacement as earlier releases. It runs the same checklist plus a live MCP
round trip on the public site, writes the upgrade checkpoint, and rolls back
on failure.

Migrations stay additive. Never drop or rewrite production data.

### 6.1 Milestone list

Numbering continues from the last report (`10-*`). The ADR numbering continues
from 0013. Each milestone ends with:

- a push;
- `docs/milestones/NN-title.md` covering what works, what is missing, open
  decisions and validation numbers, with app captures beside the prototype
  captures;
- then the next milestone, with no waiting.

### M11 — v2 intake, references and decisions

1. **ADR 0014**, "Prototype v2 is the UI source of truth":
   - the navigation change (4 tabs, inbox in Me);
   - home as the signed-out landing;
   - the vocabulary (D5);
   - the do-not-port list in §2.4.
2. **Rewrite `docs/ui/README.md`** for v2:
   - point it at `prototype-v2/`;
   - update the screen → route → data table (§7);
   - map the prototype data.
3. **Reference captures.** Extend `scripts/ui/prototype-shots.mjs` with a
   `--v2` mode:
   - serve `docs/ui` as the root;
   - block external requests;
   - drive the prototype by role or text and coordinates, since the v1
     `data-reference-*` hooks are gone;
   - dismiss the home overlays;
   - drive the `lang` and theme state.

   Capture every phone and desktop screen in §2.1 in zh and en, light and dark,
   into `docs/ui/reference-v2/`.
4. **String extraction.** Extract `S`, Module Plan `T` and the inline
   `zh ? … : …` strings into a mapping table
   `docs/ui/prototype-v2/strings.csv` with four columns: prototype key, app
   key (reuse existing), zh-HK, en. Fix the Traditional characters (§2.4 item
   13). zh-CN is derived and reviewed.

### M12 — Planning and CRM backend

Ships §4.1 and §4.2 in full:

- migrations, schemas, core, REST, MCP, permissions with table tests, realtime
  families;
- seed: Northwind's companies, contacts, links, plans, dependencies,
  milestones and finance from `taff-store.js` `PLAN`, `DEPS`, `MILESTONES`,
  `FINANCE` and `CRM_SEED`, plus the Qingshi and personal orgs;
- `auditCrm` returns `[]` after every scenario.

Acceptance: `pnpm test`, `pnpm mcp:smoke` (new tools) and the existing e2e suite
all pass. The UI is unchanged.

### M13 — Shell, navigation, Today, Me, Inbox, sign-in

1. **Prep commit.** Extract all inline mutations into `src/lib` hooks with no
   UI change, and record a test-id contract list in `e2e/support/`.
2. **Phone shell:**
   - 4-tab bar with the badge on 我的;
   - FAB;
   - toast on both layouts;
   - pushed-screen stack for Inbox, Search, Notifications, Agent, Team, MCP,
     Company and Contact.
3. **Desktop shell:**
   - sidebar with org switcher, ⌘K field, 今天 · 日曆 · 項目 › 公司 · 聯繫人,
     fold to rail (remembered per user), user footer with badge;
   - per-view header and filter bar;
   - right detail panel with empty state.
4. **Today** on phone and desktop:
   - agents at work;
   - 待你處理 (with the count fix from §2.4 item 1);
   - due today.

   This must stay inside the LCP, budget and Lighthouse gates. Today still
   renders from the server bootstrap in one pass.
5. **Me.**
   - Phone: profile; 收件箱 and AI 簡報 rows; agents; 組織 · 團隊 · MCP;
     preferences (language with three options, appearance, notifications);
     sign out.
   - Desktop: tabs 收件箱 · AI 簡報 · 智能體 · 設定, with 設定 covering
     organization, members, notifications, MCP, connected clients and
     preferences.

   Desktop gets parity features the prototype left out: create organization,
   invites, quiet hours and digest time.
6. **Inbox** as a pushed screen on phone and as the Me tab on desktop. Same
   rows and actions as now.
7. **MCP page** on v2 markup (phone lines 910–988; desktop Me › 設定 ›
   MCP and 已連接客戶端), with full parity on both layouts:
   - endpoint and OAuth metadata panel;
   - personal access token shown once, regenerate and revoke with confirm and
     undo;
   - copyable client config;
   - client scopes, tool toggles and integrations;
   - call log with method and tool.

   Keep the `mcp.spec.ts` flows and test ids.
8. **Signed-out landing** replaces `<Auth/>`. Keep the email, username and SMS
   flows and the `auth-*` test ids.
9. **Routes.**
   - `/inbox` stays as a direct route: a pushed screen on phone, `/me?tab=inbox`
     on desktop.
   - `#task=ID` and `/tasks/:id` both open the task.

Acceptance:

- Behavioural e2e is updated for the 4-tab navigation, selectors only.
- New visual baselines for shell, today, me and inbox replace the old ones
  (regenerated through `visual-baselines.yml` and committed beside the
  references).
- The perf gates are green in all three locales.

### M14 — Projects, task detail, calendar, search

1. **Projects.**
   - Header with the 項目 · 公司 · 聯繫人 switch and project title.
   - 看板 · 列表 · 時間線 · 更多 segmented control; 時間線 and 更多 open
     placeholders until M16.
   - Status tabs with counts.
   - Board cards and list exactly as in the prototype.
   - Desktop: 4-column board and table list, filter chips (全部 / 智能體執行 /
     我負責的 / agent).
   - Board drag keeps its keyboard and menu alternative: the desktop panel
     gains a status control.
2. **Task detail** (sheet on phone, right panel on desktop):
   - the v2 field rows;
   - the 聯繫人 section (backed by M12);
   - review deliverables, subtasks and activity;
   - desktop also gets the status control, description and comment input.
3. **Calendar.**
   - Phone stays on Schedule-X, restyled to the v2 markup (unchanged from v1).
   - The new desktop calendar view (lines 1405–1442) adds a 今天 button and
     click-to-create, with the hour grid and month view on Schedule-X.
4. **Search (⌘K).**
   - Adds companies and contacts.
   - Desktop results open desktop views.

### R1 — Live review release

The Phase A exit described in §6.0. The build agent publishes the R1
candidate and continues with M15 without waiting. The local agent deploys
it, and the checklist passes on the live site. The upgrade checkpoint in
`docs/deploy.md` and the milestone report link the evidence.

### M15 — CRM screens

- Companies: list, create, detail with client projects, members and company
  roles, edit, archive (D4).
- Contacts: list and search, create (name, title, company, phone, email),
  detail, edit, company change with the dropped-roles toast and undo, archive
  with confirm.
- 相關方 (stakeholders) on phone and desktop, with the client-company select.
- One shared `ContactRoleRow` component replaces the six copy-pasted blocks.

Acceptance:

- Playwright in all locales covers:
  - an exclusive-role move;
  - auto-add of a stakeholder from a task contact;
  - the stakeholder cascade;
  - a company change;
  - each of the four with toast and undo.
- `auditCrm` returns `[]` afterwards.

### M16 — Timeline and relations

1. **Timeline.** Lazy route component, hand-rolled SVG.
   - Day and week zoom.
   - Bars for people (filled) and agents (dashed), with progress.
   - Conflict and blocked borders, critical-path ring.
   - Milestones as diamonds, indented subtasks, today tick.
   - Drag to move, resize the right edge, link by drag and by link mode,
     click an arrow to remove.
   - Undo via the inverse API call.

   **Keyboard and form alternative.** The selection footer edits start,
   duration and predecessors. Handles are at least 24 px hit targets and 44 px
   on phone. Each row is labelled for screen readers.

   For long projects, virtualize rows over about 200.
2. **Relations.** Lazy, hand-rolled SVG.
   - Layered and force layouts (deterministic seed).
   - Pan, wheel and pinch zoom, fit.
   - Layer chips, a scope select, the inspector.
   - Open task and open in timeline.

   Keyboard: nodes are reachable in list order from the inspector's
   relations list, and an "as list" toggle gives the same information
   without the canvas.

Acceptance:

- Playwright flows in all locales:
  - move, resize, add and remove a dependency, cycle rejected;
  - open a task from the graph.
- `perf:budget` is unchanged for Today.

### M17 — AI brief and suggestions

- Brief on the phone overlay and in the desktop Me tab:
  - greeting with the signed-in name;
  - stat tiles;
  - deterministic brief text from codes;
  - risk and slip forecast per project, with finance if allowed;
  - suggested actions routed through review and grants.
- Ask taff with the rules fallback.
- The model path built but disabled (D6).

Acceptance:

- Brief numbers equal the `plan-model.ts` unit-test fixtures.
- Ask works with no AI env set.

### M18 — Mind map (D8)

- Lazy radial SVG.
- Node detail with evidence and sources.
- "Turn into a validation task".
- Create and edit nodes, edges and sources.
- Keyboard list alternative.

### M19 — Cleanup, accessibility, i18n, release

- **Remove the v1 leftovers:**
  - unused components and route CSS;
  - the 86 v1 baselines;
  - v1 screens from `ui-parity.spec.ts`, renamed to `ui-v2.spec.ts`;
  - the screen list in both Playwright configs, `ci.yml` and
    `visual-baselines.yml`, with the new PNG count.
- **Fonts.** Regenerate the Noto Sans TC subsets from the v2 strings.
  `prepare-fonts.ts` must still find exactly the expected faces; update the
  count if the subsets change.
- **Accessibility.** Rerun the 288-context audit and the keyboard-only flow.
- **i18n.** Rerun key parity, the 126+ locale route captures, and the
  Traditional-character lint (a test that fails on the §2.4 characters in
  zh-HK).
- **Release.** Update `CHANGELOG.md`, the README quick start and
  `docs/deploy.md`. Tag `v0.2.0` when all gates and CI are green, then deploy
  with `docs/agent-goal-deploy.md`.

## 7. Routes after v2

| Screen | Phone | Desktop (≥1024 px) |
| --- | --- | --- |
| Signed-out home and sign-in | `/` (signed out) | same |
| Today | `/` | `/` |
| Calendar | `/calendar` | `/calendar` |
| Projects board, list, timeline, stakeholders, relations, mind | `/projects/[id]?view=board\|list\|timeline\|stakeholders\|relations\|mind` | same |
| Companies | `/companies`, `/companies/[id]` (pushed) | split list and detail |
| Contacts | `/contacts`, `/contacts/[id]` (pushed) | split list and detail |
| Task | `/tasks/[id]` (sheet; `@modal` intercept kept) and `#task=ID` | right panel |
| Review | `/tasks/[id]/review` | `/tasks/[id]/review` |
| Inbox | `/inbox` (pushed from 我的) | `/me?tab=inbox` |
| AI brief | `/brief` (overlay) | `/me?tab=brief` |
| Me, agents, settings | `/me`, `/agents/[id]`, `/me/mcp`, `/me/notifications`, `/orgs` | `/me?tab=agents\|settings` |
| Digests | `/digests`, `/digests/[id]` (no v2 markup; restyle on v2 tokens) | same |

## 8. Validation (every push)

```
pnpm lint && pnpm typecheck && pnpm licence:check && pnpm test && pnpm build
&& pnpm build:server && pnpm perf:budget && pnpm e2e && pnpm mcp:smoke
```

Also run before each milestone report:

- `pnpm perf:lcp` with `LCP_LOCALE=en`, `zh-CN` and `zh-HK` (each median ≤ 2,000 ms);
- `pnpm perf:lighthouse` (≥ 90 in every category);
- the visual suite against the committed v2 baselines.

CI (`ci.yml`) stays green on every merged PR.

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Today budget (8.6 KB headroom) | No new code in the Today chunk. CRM, timeline, graph and brief are lazy. Measure after each screen. |
| Visual CI red during the swap | Replace baselines per screen in the same PR as the screen, generated by `visual-baselines.yml` on CI's Chromium. |
| E2E churn | Prep commit keeps test ids. Change selectors only. Keep `messages[locale]` keys or rename them in the same commit as the tests. |
| Schema drift from `db/schema.sql` | Treat it as concept input only (§2.5). Every new table follows the audit, tenancy and version pattern. |
| Data leaving the system (Ask taff) | Off by default, env-gated, per-workspace opt-in, with an ADR; production ships with it unset (D6). |
| Fake agent output from the prototype | Never port: suggestions are proposals a person applies, and the review policy still holds. |
