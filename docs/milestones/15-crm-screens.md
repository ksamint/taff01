# M15 — CRM screens

Branch `m15-crm` from `phaseb-base` (2026-10-14). Plan §2.4 items 7, 8 and
10, §4.2, M15 and §7 routes; ADR 0014 (D4) and 0015 (CRM implementation
notes).

## What works

- **Companies** — `/companies`: search by name or industry, 顯示已封存 for
  admins (`includeArchived`), 新增公司. `/companies/[id]` is a pushed page on
  phone and the right pane of a split list + detail on desktop (≥ 1024 px):
  客戶項目 chips (to the project's 相關方), employees with company roles in
  `ContactRoleRow`s, 新增聯繫人 at this company, edit, and 刪除 (archive)
  behind a confirm with 撤銷 (`PATCH {archived:false, version}`); archived
  companies offer 還原.
- **Contacts** — `/contacts`: search by name, title, company, phone or email;
  create with name, title, company, phone and email, validated in the form
  (`validateContactFields`, same limits as `contactInputSchema`).
  `/contacts/[id]`: company select (company change toasts the dropped roles;
  undo moves the contact back with `previousCompanyId` and re-PUTs the
  dropped company-role link), phone (`tel:`) and email (`mailto:`), every
  company/project/task link grouped by scope with role editing and removal,
  edit, and archive with confirm + undo.
- **相關方** — `/projects/[id]?view=stakeholders` (lazy `StakeholdersView`) on
  phone and desktop: client-company select (`PATCH /api/projects/:id
  {clientCompanyId}`, admins/finance:manage; read-only name otherwise) and
  the project's contacts with roles, add and remove. Removing a stakeholder
  toasts the cascaded task-link count; undo re-adds the stakeholder and each
  task link with its roles (read from the contact detail first).
- **One `ContactRoleRow`** (`src/components/crm/contact-role-row.tsx`) for
  company, project, task and contact-page rows; chips come from
  `rolesForScope(scope)`. The task-detail contacts section uses it through
  `ContactLinks` and keeps its M14 test ids. Exclusive roles name the
  replaced holder in the toast; undo gives the role back.
- **Navigation** — 項目 · 公司 · 聯繫人 switch on Projects (phone) and 公司 ·
  聯繫人 indented under 項目 in the desktop sidebar, both only with
  `canReadCrm`. The Projects tab stays current on `/companies` and
  `/contacts`.

## Test ids

`companies-view`, `company-new`, `company-search`, `company-archived-toggle`,
`company-row`, `company-detail`, `company-heading`, `company-edit`,
`company-archive`, `company-restore`, `company-client-project`,
`company-new-contact`, `company-contact*`; `contacts-view`, `contact-new`,
`contact-search`, `contact-row`, `contact-detail`, `contact-heading`,
`contact-company-select`, `contact-company`, `contact-phone`, `contact-email`,
`contact-edit`, `contact-archive`, `contact-restore`, `contact-link*`;
`stakeholders-view`, `stakeholders-count`, `stakeholders-pick-project`,
`client-company-select`, `client-company`, `stakeholder*`; forms
`company-form*`, `contact-form*`; `crm-confirm-body|ok|cancel`, `crm-back`,
`crm-no-access`, `crm-section-projects|companies|contacts`,
`sidebar-companies`, `sidebar-contacts`. `*` rows use the `testIdPrefix`
convention (`-roles`, `-edit`, `-role-<role>`, `-remove`, `-add`, `-search`,
`-option`, `-new-role-<role>`, `-confirm`).

## Validation

- `pnpm lint`, `pnpm typecheck`, vitest `apps/web scripts` (24 files, 127
  tests), `pnpm build`.
- `pnpm perf:budget`: Today initial JS 193,453 B gzipped (budget 204,800).
- Private stack (`taff_crm_dev`, api 3801, web dev 3800):
  `e2e/crm.spec.ts` 15/15 (5 scenarios × en, zh-CN, zh-HK), each ending
  with `GET /api/workspaces/:id/crm/audit` → `[]`; `task-contacts.spec.ts`
  6/6; `accessibility`, `i18n`, `planning` and `today` suites green.

## Missing / deferred

- Contact page 加入項目相關方 (add the contact to a project from its page);
  links are added from the project or task.
- CRM screens have no visual baselines yet (generate on CI Chromium).
- Contact list rows show title and company, not role summaries (the list
  API has no roles).

## Open decisions

- The client-company select uses `canReadFinance && canManageProjects` as
  its gate: `finance:manage` is admin-only, the same rule as
  `finance:read`, and the access endpoint has no separate flag.
- Undo of a new company or contact (archive) is offered only to admins,
  since archive needs `crm:archive`.
