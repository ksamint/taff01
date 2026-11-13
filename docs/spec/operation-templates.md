# Spec: Operation templates

Living product specification for operation templates (owner request
2026-11-13, [milestone 127](../milestones/127-operation-templates.md)). This
file states the current contract; no ADR was needed because the module reuses
existing projects, tasks, labels and the `project:manage` permission. Change
this file in the same commit as the behaviour it describes.

Status: implemented on branch `claude/epic-thompson-iwoxr3`; not yet released.

## Users and roles

| Role | Can |
| --- | --- |
| Workspace admin (including a system admin's protected admin membership) | Apply a template to the current organization or workspace |
| Member, guest, outsider, demoted admin | Cannot apply; read the created projects and tasks as their role already allows |
| Agent | Cannot apply (403); project creation by agents stays with ADR 0025 |

## Template: 通用營運模板 / generic operation (`generic-operation`)

| 板塊 Sector (project; sector label) | 領先指標 Leading indicator | 結果指標 Result indicator |
| --- | --- | --- |
| 財務與現金 Finance & Cash | 逾期應收 Overdue receivables | 收入與毛利對預算 Revenue and margin vs budget |
| 客戶與市場 Customers & Market | 新增合格商機 New qualified pipeline | 留存或複購率 Retention or repeat rate |
| 營運與交付 Operations & Delivery | 工作量對產能 Workload vs capacity | 準時交付與品質投訴 On-time delivery and complaints |
| 人才與組織 People & Organization | 關鍵職缺空缺天數 Days critical roles open | 關鍵人才流失 Key people lost |
| 風險與安全 Risk & Security | 逾期整改事項 Overdue remediation items | 事件數 Incidents |
| 未來 Future (strategy, product, succession) | 戰略里程碑 Strategic milestones | 新業務收入占比 Revenue share from new lines |

The data lives in `packages/schemas/src/operation-templates.ts`.

## Requirements

### Apply (OT-1)

- OT-1.1 When an admin applies `generic-operation`, the server shall create one project per sector, named `<中文> <English>`, in the table's order.
- OT-1.2 For each sector, the server shall create two `todo` tasks in that project titled `領先指標：<indicator>` and `結果指標：<indicator>`, labelled with the sector label (the Chinese sector name) and the indicator label, owned by the applying admin and unassigned.
- OT-1.3 When a sector project (not archived) or an indicator task (by title, in that project) already exists, the server shall reuse it; a repeat or concurrent apply shall create nothing more and report `createdProjects` and `createdTasks` as zero.
- OT-1.4 When a sector project was archived, the next apply shall create a new project for that sector with its two tasks.
- OT-1.5 Tasks created by the template shall be ordinary tasks: people add further tasks to a sector project, or tag any task with a sector label, through the existing task screens on desktop and phone (H5).

### Authority and input (OT-2)

- OT-2.1 When the caller lacks `project:manage` in the workspace, the server shall refuse with 403, including an admin demoted to member.
- OT-2.2 When the caller is an agent, the server shall refuse with 403.
- OT-2.3 When the workspace id or template key is invalid, the server shall refuse with 400; an archived workspace shall not be changed.

### Screen (OT-3)

- OT-3.1 When an admin views Projects with no project selected, the filter sheet shall offer Add six-sector operation template (zh-CN 添加六大方面营运模板, zh-HK 加入六大方面營運模板); others shall not see it.
- OT-3.2 When the apply succeeds, the screen shall show a toast with the created project and task counts and refresh projects and tasks; on failure it shall show the localized error.
- OT-3.3 Every CJK character in the UI labels shall be in the bundled font subset (`scripts/ui/fonts.test.ts`); the button says 方面 because 块 and 塊 are not bundled (sector names in task data render with the system font fallback).

## Non-functional

- Route: `POST /api/workspaces/:id/operation-templates/:template`, response
  `{ template, createdProjects, createdTasks }` (`operationTemplateResultSchema`).
- One transaction under the workspace row lock; task numbers follow the
  existing dense per-workspace sequence. No migration, dependency or new
  permission action.
- English, Simplified Chinese and Traditional Chinese (Hong Kong) labels ship
  together; template content is bilingual Traditional Chinese and English.

## Out of scope in v1

- Indicator values, targets or charts per sector.
- Templates other than `generic-operation`, and user-edited templates.
- An MCP tool for applying templates.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| OT-1.1–1.4 | `packages/core/src/operation-templates.integration.test.ts` (create, idempotent repeat and concurrent apply, archived sector restore) |
| OT-1.5 | `e2e/operation-templates.spec.ts` opens an indicator task on the Pixel 7 (H5) profile; task create and labels use existing tests |
| OT-2.1–2.3 | `packages/core/src/operation-templates.integration.test.ts` (member, guest, outsider, demoted admin, agent, unknown template) |
| OT-3.1–3.2 | `e2e/operation-templates.spec.ts`, Pixel 7 profile, en, zh-CN, zh-HK (3 cases); route row in `packages/core/src/authorization.integration.test.ts` (member denied) |
| OT-3.3 | `scripts/ui/fonts.test.ts` |

## Open decisions

- Live creation of the XIDING organization with the 侍天TIANSIGHT/APUCH
  system admins as admins waits for the next release (owner, deploy machine).

## Sources

- [Milestone 127](../milestones/127-operation-templates.md)
- [Projects](projects.md)
- [Permissions matrix](permissions-matrix.md)
- [Changelog](../../CHANGELOG.md)
