# Spec: Operation view templates

Living product specification for view templates (owner requests 2026-11-13
and 2026-11-14, [milestone 127](../milestones/127-operation-templates.md)).
This file states the current contract; no ADR was needed because the module is
a client view over existing tasks, labels and projects. Change this file in the
same commit as the behaviour it describes.

Status: implemented on branch `claude/epic-thompson-iwoxr3`; not yet released.

## Users and roles

| Role | Can |
| --- | --- |
| Admin, member, guest (including system admins' protected admin memberships) | Open the 營運視圖 / Sectors view and see the tasks they can already read |
| Anyone who can edit a task's labels | Place it in a sector by tagging it with the sector label |
| Agent | Unchanged: tags tasks through existing authorized task tools |

The view grants no access: it regroups the tasks the existing task list returns.

## Template: 通用營運模板 / generic operation

| 板塊 Sector (task label) | 領先指標 Leading indicator | 結果指標 Result indicator |
| --- | --- | --- |
| 財務與現金 Finance & Cash | 逾期應收 Overdue receivables | 收入與毛利對預算 Revenue and margin vs budget |
| 客戶與市場 Customers & Market | 新增合格商機 New qualified pipeline | 留存或複購率 Retention or repeat rate |
| 營運與交付 Operations & Delivery | 工作量對產能 Workload vs capacity | 準時交付與品質投訴 On-time delivery and complaints |
| 人才與組織 People & Organization | 關鍵職缺空缺天數 Days critical roles open | 關鍵人才流失 Key people lost |
| 風險與安全 Risk & Security | 逾期整改事項 Overdue remediation items | 事件數 Incidents |
| 未來 Future (strategy, product, succession) | 戰略里程碑 Strategic milestones | 新業務收入占比 Revenue share from new lines |

The data lives in `packages/schemas/src/operation-templates.ts`.

## Requirements

### Regrouping (OT-1)

- OT-1.1 The template shall define the six sectors in the table's order; each sector label shall be a valid task label.
- OT-1.2 When the Sectors view opens, it shall show every sector, in order, with its name, English name, leading and result indicators and a task count, including sectors with no tasks.
- OT-1.3 A task whose labels include a sector label exactly shall appear under that sector, under a heading of its project (or "No project"); a task with several sector labels shall appear under each of them.
- OT-1.4 A task with no sector label shall not appear in the view.
- OT-1.5 The view shall cover every project in the workspace regardless of the selected project; the header shall read All projects without a single project's stage or progress, and image export shall not be offered there. The existing filter (all, mine, agents, agent), label search and sort shall apply.
- OT-1.6 Opening the view shall create, change or delete no projects or tasks.

### Phone and tagging (OT-2)

- OT-2.1 The view shall be reachable from Projects → More → Sectors on phone (H5) and desktop, and by `?view=sectors`.
- OT-2.2 When a person adds a task with a sector tag (Quick Add `+財務與現金`, or the task editor's labels), it shall appear under that sector; opening a row shall open the task.
- OT-2.3 Every CJK character in the view's UI labels shall be in the bundled font subset; sector and indicator text is template data shown with the system font fallback.

## Non-functional

- Client only: no route, migration, dependency, permission action or MCP tool.
  Grouping is the pure `groupBySector` in `packages/schemas`.
- English, Simplified Chinese and Traditional Chinese (Hong Kong) labels ship
  together; template content is bilingual Traditional Chinese and English.

## Out of scope in v1

- Tagging a project itself (projects carry no labels; a project appears under
  a sector through its tagged tasks).
- Indicator values, targets or charts per sector; other or user-edited templates.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| OT-1.1–1.4 | `packages/schemas/src/operation-templates.test.ts` |
| OT-1.2–1.5, OT-2.1–2.2 | `e2e/operation-templates.spec.ts`, Pixel 7 profile, en, zh-CN, zh-HK |
| OT-1.6 | no test; the view issues only the existing task and project reads |
| OT-2.3 | `scripts/ui/fonts.test.ts` |

## Open decisions

- Project-level sector tags would need a migration and an ADR; not requested.

## Sources

- [Milestone 127](../milestones/127-operation-templates.md)
- [Projects](projects.md)
- [Changelog](../../CHANGELOG.md)
