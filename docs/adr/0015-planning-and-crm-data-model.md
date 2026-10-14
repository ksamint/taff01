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
