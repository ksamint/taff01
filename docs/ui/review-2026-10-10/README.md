# UI review against the approved prototype (2026-10-10)

Captured from `main` at 55b315b with `scripts/ui/app-shots.mjs` (the app,
signed in as the demo user, zh-HK, 393×850 phone and 1440×900 desktop) and
`scripts/ui/prototype-shots.mjs` (the prototype canvas in
`docs/ui/prototype/team-tasks.dc.html`). The live site could not be reached
from the review sandbox; the deployed commit is the one reviewed.

## Verdict

The app has the TABLE AI tokens (colours, hairlines, square corners, Manrope,
Lucide, sparkles) and every feature of the plan, but it is not the product in
the prototype. The prototype is a dense, app-like screen set; the app is a
set of web pages with the same big page heading, forms and generic cards on
every route. On a phone the heading block (top bar, eyebrow, 48 px title,
subtitle, rule) uses the first third of the screen before any content.

## Screen by screen (phone, zh-HK)

| Screen | Prototype | App on main | Gap |
| --- | --- | --- | --- |
| Shell | No top bar. Each screen has its own compact header (date + title + search + avatar). Dark square `+` FAB bottom right. Toast bar for agent events. | Product top bar (logo, search, +, language select, sign out) on every screen, then eyebrow "TAFF DEMO", 48 px title, subtitle, hairline. No FAB, no toast. | Structural |
| Today | Schedule timeline for the day (times, now-line, agent block dashed), then "今天到期" list; avatar opens Me. | Greeting, task count, an "agents at work" card listing raw run rows, a create-task form, then 20 task cards each with a status chip, owner line and a worker `<select>`. No timeline. | Structural |
| Calendar | Month label + arrows, 日/週/月 segmented, hint line, week strip, unscheduled chips, hour grid with blocks, FAB. | Closest screen. Extra heading block, four-way segmented plus a large 安排任務 button, 30-minute rows, no hint line, blocks styled as generic boxes. | Moderate |
| Projects | Project title with 看板/列表 toggle and search, status tabs with counts, horizontally scrolled compact cards: ID, due, title, parent link, avatar and agent chips. | Heading block, project select, 建立項目 button, filter and sort selects, label textbox, helper text, then columns of tall cards with a drag handle, a status `<select>` and a priority glyph. No task IDs, no avatars, no parent link. | Structural |
| Inbox | Title + 全部已讀 + search; tabs with counts; compact rows: agent icon, "調研智能體 請求審核 · 09:12", ID + title, excerpt, [批准] [查看] [延後到明天], status chip, unread dot. | Heading block, tabs with counts, one tall card per item with two or three large buttons (審核交付物, 開啟任務, 授予存取權限), no agent name, no excerpt, no unread dot, timestamp top right. | Structural |
| Me | Avatar, name, role · org · team; rows 組織 / 團隊 / 設定 › MCP with values and chevrons; 偏好設定 with segmented 語言 and 外觀, 通知 row. | Heading block, 帳戶 form (name, email), workspace select, a 組織 button, an agents list, appearance further down. No role/team line, no row pattern. | Structural |
| Task detail | Sheet with field rows (負責人, 執行者 with agent status, 截止, 時間, 優先級 as dropdown rows) and the review deliverable below. | Full-page form: title input, description textarea, owner select, native date and time inputs with a UTC hint. | Structural |
| Agent profile | Tools, supervisor, limits, history; Allow / Ask / Deny. | Matches in content and controls. | Minor |

## Desktop

The prototype has a real desktop layout: sidebar with organisation switcher,
⌘K search, 項目 and 收件箱 entries with counts and the agent list with status
dots; a board with breadcrumb, 看板/列表 tabs, filter chips (全部 / 智能體執行 /
我負責的), a dark 新建任務 button and compact four-column cards; and a right
panel with the selected task's fields and the review deliverable (findings,
sources, checklist, 要求修改 / 批准). The app shows the phone pages stretched
to the content column beside a five-item sidebar. No detail panel, no
breadcrumb, no agent list, no inline review.

## Why it happened

1. **M1 restyled instead of reproducing.** The shell and views were built on
   the tokens with a page-heading pattern that is not in the prototype, and
   milestone 01 recorded "phone screenshots captured and inspected" without
   a comparison against the prototype. Its acceptance ("Today matches the
   prototype on phone and desktop") was never checked by anyone.
2. **Later milestones added features as forms.** M3–M7 each shipped behaviour
   with Playwright coverage and no visual acceptance, so every new screen took
   the generic page/form/card shape of M1.
3. **The prototype does not render in an agent sandbox.** It loads React from
   unpkg; with CDN access blocked the page is blank, so an agent that followed
   "walk every screen before writing UI code" saw nothing and moved on.
4. **No screenshots were ever committed.** Validation tables counted tests;
   the asynchronous review had nothing visual to look at until now.
5. **Test data on the demo workspace** (over a hundred "Rollback zh-HK …"
   tasks from e2e runs) hides the layout further; the prototype seed data
   (M9 item 5) is not done.

## What to do

`docs/agent-goal-ui-parity.md` is the goal command for a UI parity milestone
that comes before the rest of M9. It is screen-by-screen, with committed
prototype captures as the acceptance reference and a visual regression check
in CI.
