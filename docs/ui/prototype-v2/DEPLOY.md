# taff · Team Tasks — deployment notes

## Entry point
`Team Tasks.dc.html` is the only app entry. It renders the H5 (390 × 844) and web (1280 × 800) layouts side by side for review; production serves one or the other by viewport.

| File | Role |
|---|---|
| `Team Tasks.dc.html` | App shell: 今天 / 日曆 / 項目 (公司 · 聯繫人) / 我 |
| `Team Tasks Module Plan.dc.html` | Embedded module only: timeline (`start-page="gantt"`), mindscape (`mind`), AI brief (`brief`) |
| `Team Tasks Module Relations.dc.html` | Embedded module: relations graph (項目 › 更多 › 關係) |
| `taff-store.js` | Shared data layer (prototype adapter for `db/schema.sql`) |
| `db/schema.sql` | PostgreSQL 15+ schema, constraints, triggers, role reference data |
| `support.js`, `_ds/…` | Runtime + Table AI design system (tokens, fonts, components) — ship as static assets |
| `archive/` | Superseded versions and screenshots — do not deploy |

## H5 ↔ web parity
| Area | H5 | Web |
|---|---|---|
| Navigation | Tab bar: 今天 · 日曆 · 項目 · 我 | Sidebar (foldable): 今天 · 日曆 · 項目 › 公司 · 聯繫人 · 我 |
| 今天 | Agents at work · 待你處理 (3) · 今天到期 | Same |
| 日曆 | 日 / 週 / 月, drag to reschedule | Same, plus click-to-create |
| 項目 | 看板 · 列表 · 時間線 · 更多 (相關方 · 關係 · 心智) | Same |
| 公司 / 聯繫人 | 項目 tab switch → list → detail page | Sidebar → list + detail split |
| Task contacts | Task page › 聯繫人 | Task panel › 聯繫人 |
| 我 | 收件箱 · AI 簡報 · 智能體 · 設定 | Tabs: 收件箱 · 簡報 · 智能體 · 設定 |
| 設定 | 組織 · 團隊 · MCP · 偏好 · 通知 · 重置 | 組織 · 成員 · 通知 · MCP · 已連接客戶端 · 偏好 · 重置 |

## Data integrity
CRM rules are enforced twice — in `taff-store.js` (prototype) and in `db/schema.sql` (production):
1. One contact record per person; companies, projects and tasks hold links (`contact_links`) with roles (`contact_link_roles`).
2. Roles come from `contact_roles` and are limited by scope (董事長 company only; 項目中間人 project only).
3. Exclusive roles (董事長 per company, 驗收人 per project/task) — partial unique index `contact_role_exclusive`.
4. Task contact ⇒ project stakeholder (`ensure_project_link`); removing a stakeholder removes their task links (`cascade_project_unlink`).
5. Changing a contact's company drops company roles at the old one (`drop_old_company_links`); company must be in the contact's organisation (`check_contact_company`).
6. Links must point at an existing entity in the same organisation (`check_link_entity`); deleting a task/project/company cleans up its links.
7. On load the store runs `crmRepair` (dedupe, drop orphans and out-of-scope roles, restore missing stakeholders) and logs what it fixed. `TaffStore.crmAudit(db)` returns the same list without changing data.

## Going live
1. `psql -f db/schema.sql` on an empty database (creates tables, triggers and the `contact_roles` reference rows).
2. Replace the localStorage body of `taff-store.js` (`get` / `save` / `update` / `subscribe`) with API calls; keep the function names — every screen calls only these.
3. Wire `subscribe` to the `taff_changes` LISTEN/NOTIFY feed (websocket).
4. Ask taff: `Team Tasks Module Plan` calls `window.claude.complete` and falls back to canned answers — point it at your model endpoint.
5. Remove demo-only pieces: `?reset` handling, 重置演示數據, seed data (`CORE`, `CRM_SEED`, `PLAN`, `SUGG`), and the side-by-side device preview.
6. Static hosting: serve the project root; no build step. Fonts load from `_ds/…/assets/fonts`.

## Release checklist
- [ ] No console errors on 今天, 日曆 (日/週/月), 項目 (all views), 公司, 聯繫人, 我 (all tabs) — H5 and web
- [ ] Role edits, exclusive-role moves, stakeholder cascade and company change each show a toast with 撤銷
- [ ] `TaffStore.crmAudit(TaffStore.get())` returns `[]`
- [ ] Language toggle (中 / EN) and dark theme render every screen
- [ ] Hash links `Team Tasks.dc.html#task=NW-141` open the task on both layouts
