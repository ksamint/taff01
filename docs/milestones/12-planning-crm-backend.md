# M12 — Planning and CRM backend

Goal: `docs/agent-goal-frontend-v2.md`; plan: `docs/frontend-v2-plan.md`
§4.1, §4.2 and §6.1 M12. Decisions: ADR 0015 (with its implementation
notes). Branch `m12-backend`; the UI is unchanged.

## What works

**Data model.** Migration `0023_m12_planning_crm` is additive. It creates no
`DROP`, `DELETE` or rename, and no rewrite. It adds ten tables, each with the
`_audit` trigger:

- `task_plans`, `milestones`, `task_dependencies` and `project_payments`;
- `companies` and `contacts`;
- `company_contacts`, `project_contacts`, `task_contacts` and `contact_roles`.

It also adds `projects.contract_amount`, `currency` and `client_company_id`,
and a unique `(workspace_id, id, project_id)` on `tasks`. Composite foreign
keys make two CRM rules declarative:

- a task contact is always a stakeholder of the task's project;
- only a contact's employer can hold its company link.

A CHECK generated from `CONTACT_ROLE_RULES` limits roles to their scopes, and
partial unique indexes make `chair` and `signoff` exclusive.

**Planning core** (`plan-model.ts`, `timeline.ts`). The pure read model
covers default durations, parent spans, duration-weighted progress (no
simulated agent steps), days behind, forecast end, dependency conflicts, the
critical path, and the project risk as a level plus reason codes. Delivery
and collected percentages are included; finance only for admins.

- **Plans**: set with version checks. `due_at` follows the plan end in the
  editor's zone. Whole-subtree moves happen in one transaction (D10).
- **Milestones**: create, edit and archive.
- **Dependencies**: add and remove. Duplicates, cycles and self-links answer
  409.
- **Payments**, and the project finance fields on `PATCH /api/projects/:id`.

**CRM core** (`crm.ts`).

- Companies and contacts: list, detail, create, edit, and archive or restore
  (D4). Archive needs `crm:archive`.
- Employer change returns `{dropped, previousCompanyId}`.
- `setContactRoles` returns `{replaced, addedProjectStakeholder,
  previousRoles}`; `unlinkContact` returns `{cascadedTaskLinks}`.
- A task that changes project takes its contacts with it.
- `auditCrm()` returns `[]` after every scenario.
- `searchCrm` backs ⌘K.
- Agents read CRM with `tasks:read` plus the `crm.read` capability (default
  `ask`). Without `crm.contact_details` they see no phone or email, and
  search cannot probe them.

**REST**

- Timeline: `GET /api/projects/:id/timeline` and `PATCH /api/tasks/:id/plan`.
- Milestones and payments: `GET|POST /api/projects/:id/milestones`,
  `PATCH|DELETE /api/milestones/:id`, `GET|POST /api/projects/:id/payments`.
- Dependencies: `POST /api/dependencies` and `DELETE /api/dependencies/:id`.
- CRM: full company and contact routes, `PATCH /api/contacts/:id/company`,
  `GET|PUT|DELETE /api/{companies|projects|tasks}/:id/contacts[/:contactId]`,
  and the workspace CRM audit and search routes.

**MCP** — seven tools, each added to `pnpm mcp:smoke`:

| Tool | Gate |
| --- | --- |
| `timeline.get` | `tasks:read` |
| `tasks.plan` | `calendar:write`, own tasks |
| `dependencies.add`, `dependencies.remove` | worker of the successor |
| `companies.list`, `contacts.list`, `contacts.get` | read-only |

**Permissions.** `dependency:edit`, `finance:read`, `finance:manage`,
`contact:read`, `contact:details`, `contact:manage`, `crm:archive` and
`crm:audit`, each with table tests. `WorkspaceAccess` gains `canEditPlan`,
`canReadFinance`, `canReadCrm`, `canManageCrm` and `canArchiveCrm`.

**Realtime.** The ten tables are on the change whitelist, the API routing
(payments go to admins only; CRM events skip guests) and the web
invalidation families.

**Seed.** Northwind and Qingshi get the prototype's plans, milestones,
dependencies, contract amounts with a collected payment, companies,
contacts, links and roles; the personal space gets its plans. Each block
seeds once per workspace, so re-seeding never restores something a person
changed.

## Fixed along the way

- **Today bundle.** The new schemas made Today grow by 2 KB. The schemas
  package is now `sideEffects: false`; Today is 196,845 B (+638 B against
  `main`).
- **Production rule.** Migrations may not drop anything, so the proposed
  `crm:read` token scope was replaced by `tasks:read` plus a capability
  (ADR 0015).

## Missing

- CRM, timeline, relations, brief and mind-map screens (M14–M18).
- `relations.get` and `brief.get` MCP tools (M16, M17).

## Validation
