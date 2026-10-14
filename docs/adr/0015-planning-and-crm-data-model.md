# ADR 0015: planning and CRM data model

Status: accepted, 2026-10-14 (milestone M12).

## Context

Prototype v2 adds a timeline (durations, dependencies, milestones, finance)
and a CRM (companies, contacts, and contacts linked to companies, projects and
tasks with roles). Its `db/schema.sql` and `taff-store.js` are concept input
only (plan §2.5): slug ids, untenanted polymorphic links, free-text
exceptions and no versions. The repository's rules are uuid ids with
`workspace_id`, composite foreign keys, `version` on editable rows, the
`_audit` trigger on every table, and archive instead of delete.

## Decision

Migration `0023_m12_planning_crm` is additive. It adds ten tables, three
nullable columns on `projects` and one unique constraint on `tasks`. It never
drops or rewrites anything, constraints included, so the production deploy
rules (`docs/agent-goal-deploy-frontend-v2.md`, step 2) accept it.

**Planning**

- `task_plans(id = task id, start_date, duration_days, version)` stores a
  task's timeline plan. Core keeps `tasks.due_at` on the plan's last day, at
  the task's previous local due time (or 23:59) in the editor's time zone.
  Start-only edits do not touch `tasks`.
- `milestones(project_id, name, date, archived_at, version)`.
- `task_dependencies` has typed nullable predecessor and successor columns
  (task or milestone) with `num_nonnulls` checks, cascading composite foreign
  keys and a `NULLS NOT DISTINCT` pair key. Core rejects cycles with a
  recursive query under the workspace lock and answers 409.
- `projects` gains `contract_amount numeric(14,2)`, `currency` (ISO 4217,
  required with an amount) and `client_company_id`; `project_payments`
  records collected amounts. Finance is read and managed by admins only (D7);
  everyone else gets `null` finance fields.
- The timeline read model (`plan-model.ts`) is a pure function: default
  durations (3 days for priority 1, otherwise 2), parent spans,
  duration-weighted progress (done 100, waiting for confirmation 90, in
  progress 50, to do 0; no simulated agent steps), days behind, forecast end,
  dependency conflicts, the critical path, and the project risk as a level
  plus reason codes the web localizes.

**CRM**

- `companies` and `contacts` (archived, never deleted: D4). A contact's
  employer is a composite foreign key with `ON DELETE SET NULL (company_id)`.
- Typed link tables instead of one polymorphic table:
  - `company_contacts` references `contacts(workspace_id, id, company_id)`,
    so only the employer can be linked;
  - `project_contacts`;
  - `task_contacts(task_id, project_id, contact_id)` references
    `project_contacts` with `ON DELETE CASCADE` (a task contact is always a
    stakeholder; removing the stakeholder removes the task links) and
    `tasks(workspace_id, id, project_id)` with `ON UPDATE CASCADE` (the link
    follows the task's project; core adds the new stakeholder first).
- `contact_roles` holds one row per link and role, scoped to exactly one of
  company, project or task. A CHECK lists the allowed (scope, role) pairs,
  generated from `CONTACT_ROLE_RULES` in `packages/schemas/src/crm.ts`; a test
  keeps the SQL and the table equal. Partial unique indexes make `chair`
  exclusive per company and `signoff` per project and per task.
- Core returns what changed so the UI can toast and undo:
  `setContactRoles` → `{replaced, addedProjectStakeholder, previousRoles}`,
  `unlinkContact` → `{cascadedTaskLinks}`, `setContactCompany` →
  `{dropped, previousCompanyId}`. The prototype's repair-on-load is not
  ported; a read-only admin `auditCrm()` reports violations and returns `[]`
  when the constraints hold.

**Removal.** Entities (companies, contacts, milestones) are archived with
undo. Link rows (dependencies, contact links, roles) are removed like the
existing calendar unschedule: the delete is audited by the `_audit` trigger
(an `activity` row and `NOTIFY`), and undo re-creates the link through the
same API. No production entity is ever hard-deleted.

**Permissions and agents.** Plans reuse `task:schedule`; milestones reuse
`project:manage`; `dependency:edit` is the successor's owner or an admin, or
an agent that is its worker with `tasks:write`. CRM reads are for non-guest
people. Agents read CRM with the existing `tasks:read` token scope and the
`crm.read` capability, which defaults to `ask`, so a person must allow or
grant it. Plan §4.2 proposed a new `crm:read` token scope, but accepting it
would mean replacing the `agent_tokens_scopes_known` CHECK, and dropping a
constraint is forbidden in production migrations. Phone and email need the separate
`crm.contact_details` capability (default `deny`). `crm.write` exists
(default `deny`) but no agent write path ships: MCP CRM tools are read-only.
`crm:archive` and `crm:audit` are admin-only.

## Consequences

- Ten new tables are on the realtime whitelist, the API routing and the web
  invalidation families.
- `WorkspaceAccess` gains `canEditPlan`, `canReadFinance`, `canReadCrm`,
  `canManageCrm` and `canArchiveCrm`.
- The prototype's single project per organization is not assumed; the client
  company is per project.

## Implementation notes (M12)

- **Time zone.** A person's timeline uses `users.tz`. An agent uses its
  supervisor's zone (`agent_profiles.supervisor_id`) and UTC without one.
  The same zone sets "today", civil due dates and the due-time rule.
- **Plan writes.** `PATCH /api/tasks/:id/plan` returns `{plans, tasks}`: the
  edited plan first, then each shifted descendant plan, and every task whose
  `due_at` changed (with its new version). A start-only edit returns no
  tasks. `due_at` keeps its previous local time of day, or 23:59 local when
  it had none; a time inside a DST gap falls back to 23:59.
- **Subtree moves (D10).** The shift is measured from the start the timeline
  shows (a parent's children span). Every descendant that moves needs
  `task:schedule` on itself; otherwise the whole move is refused (403).
- **Milestones** count as the end of their day: task → milestone conflicts
  only when the milestone date is before the predecessor's last day, and
  milestone → task conflicts when the task starts on or before it.
  `DELETE /api/milestones/:id` archives; `?version=` makes it conditional.
- **Dependencies.** Duplicates, self-links and cycles answer 409. An end in
  another workspace answers 404 so its existence stays private; an archived
  milestone answers 400. Removal returns the deleted row so undo can re-add
  it.
- **Blocked.** A task is blocked while it has a pending grant; a parent shows
  blocked when a child is, but only a task's own blocker adds the two-day
  minimum to its days behind.
- **CRM errors.** 400 for a role outside its scope, a record from another
  workspace, a company link to a non-employer, a task without a project, or
  a new link to an archived contact, company or project; 403 for an entity
  in a workspace the caller does not belong to; 404 when unlinking a link
  that does not exist. Archive needs `?version=`.
- **Redaction.** Without `contact:details` (agents by default), phone and
  email are null, and CRM search matches only names and titles, so a query
  cannot probe hidden details.
- **Realtime.** `project_payments` events reach admins only (D7); CRM table
  events skip guests.

## Implementation notes (M16 relations graph)

- **Read model.** `relationGraph()` (`packages/core/src/relation-graph.ts`)
  is pure; `GET /api/workspaces/:id/graph?projectId=&layers=` and the MCP
  tool `relations.get` call it through `workspace:read`. The workspace is the
  root node; the other kinds are project, task, person, agent, company and
  contact.
- **Edges and layers (D8).** `contains` (workspace → project → top-level task
  → subtask; a task without a project hangs off the workspace) and
  `client_of` (CRM company → project, D9) are the org layer; `owns`,
  `works_on` and `supervises` the people layer; `depends_on` (successor →
  predecessor, task-to-task only — milestones stay on the timeline) the
  dependencies layer; `stakeholder_of` (contact → project or task) and
  `contact_of` (contact → employer) the CRM layer. There is no value-chain
  layer and no `value_nodes` table.
- **Scope.** Without `projectId` the graph covers active projects and tasks
  without a project; archived projects appear only when asked for by id. A
  dependency into the scope brings its other end along as a neighbour.
  People appear only through an edge.
- **CRM.** Company and contact nodes need `contact:read` (guests and agents
  without `crm.read` get `crmVisible: false` and none). Phone and email are
  never selected, whoever reads. Archived companies and contacts are left
  out.
- **Order.** Nodes sort by kind, then name (tasks by number), then id; edges
  by layer, kind, then keys — the same data always gives the same JSON, so a
  deterministic client layout can seed from it.

## Implementation notes (M18 mind map)

- **Scope (D8).** One map per workspace. Migration `0025_m18_mind_map` is
  additive: `mind_nodes` (layer 0–9, angle `numeric(5,2)` in [0, 360),
  strength 1–5, momentum −2..2, note, nullable `task_id` composite foreign
  key), `mind_edges` (cascading composite foreign keys, one row per pair,
  `relates|supports|contradicts`), `mind_sources` (title, optional http(s)
  URL, note) and `mind_node_sources`. Each has `id uuid`, `workspace_id`,
  `unique(workspace_id, id)` and the `_audit` trigger.
- **Removal.** Nodes and sources are archived (`PATCH {archived}`), never
  deleted; archive and restore need `mind:archive` (admins). Edges and
  node-source links are removed like the other link rows: the delete is
  audited and the API returns the removed row for undo. An edge into an
  archived node is hidden and returns with the node.
- **Permissions.** Read is `workspace:read` (guests included); writes are
  `mind:write`, non-guest people only. Agents get no mind path and there is
  no `mind.get` MCP tool yet.
- **Validation task.** `POST /api/mind/nodes/:id/task {version, dueDate,
  title?, projectId?}` creates a real task through the normal create path,
  owned by the signed-in person, due at 23:59 on `dueDate` in their saved
  zone, with the node's note as description, and links it — one
  transaction; a node links one task (409 after).
- **Notes, not AI.** The prototype's "AI insight" text is seeded as each
  node's `note`, with its research sources, for Northwind only and once
  (`prototype-mind.ts`); nothing is labelled as model output (plan §2.4
  item 12, ADR 0016).
- **Editable edges (M18 screens).** Migration `0026_m18_mind_edge_version`
  adds `mind_edges.version integer NOT NULL DEFAULT 1` with a `> 0` check
  (additive). `PATCH /api/mind/edges/:id {version, kind}` changes a link's
  kind under `mind:write`; a stale version answers 409. Removal stays a
  DELETE that returns the row for undo.
