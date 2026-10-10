# Agent goal: bring the UI to the approved prototype

Paste everything below this line as the goal. Do this before the remaining
M9 items in `docs/agent-goal.md`.

---

Work in `ksamint/taff01` on a branch from `main`. The product on `main` has
every feature of the plan but does not look or feel like the approved
prototype. Read `docs/ui/review-2026-10-10/README.md` and look at every image
in that folder before touching code: it names the gap on each screen. Then
make the app match the prototype screen by screen. Behaviour, data and tests
stay; the layout, hierarchy, density and components change to the
prototype's.

Read first: `AGENTS.md`, `instruction_v0.md`, `docs/ui/README.md` (route and
screen table; where it and the prototype disagree, the prototype wins for
visuals), `docs/ui/prototype/audit-and-upgrade-plan.md`, the standing rules
in `docs/agent-goal.md`.

Step 0, before any UI work: make the prototype viewable offline. It loads
React 18.3.1 UMD from unpkg; vendor `react.production.min.js` and
`react-dom.production.min.js` (MIT) into `docs/ui/prototype/vendor/` and
point `support.js` at them. Add `pnpm ui:prototype-shots` (from
`scripts/ui/prototype-shots.mjs`, serving the folder statically) and
`pnpm ui:app-shots` (from `scripts/ui/app-shots.mjs`) as scripts. Capture the
prototype's five tabs plus task detail, review, agent profile, MCP, search,
organisation sheet and the desktop board in zh and en at 390×844 and
1280×800, commit them under `docs/ui/reference/`, and walk the prototype
yourself through the served page in both languages.

Then, in this order, each screen done means the app capture sits beside the
reference capture in `docs/milestones/10-ui-parity.md` and a reader cannot
tell which product is which apart from data:

1. Shell. Remove the product top bar and the eyebrow / 48 px title /
   subtitle / rule block from every route. Each screen gets the prototype's
   own compact header. Phone: bottom tabs as now (今天 日曆 項目 收件箱 我的,
   badge on 收件箱), a dark square `+` FAB bottom right that opens quick add,
   a bottom toast bar for agent events with a 查看 action. Language and sign
   out move into Me. Desktop (≥1024 px): sidebar with organisation switcher,
   search field with ⌘K hint, 項目 and 收件箱 with counts, 智能體 list with
   status dots; content area per screen; right detail panel where the
   prototype has one.
2. Today. Date line and 今天 title with search icon and avatar (opens Me).
   日程 timeline for the day: time labels, blocks with title and
   time · attendees, dashed block for agent work with the sparkles icon and
   status, the gold now-line. Then 今天到期 rows: status glyph, title, ID ·
   status, worker chip. Agents-at-work content folds into the timeline and
   the toast. The create form leaves Today; quick add is the FAB.
3. Projects. Org · team breadcrumb line, project title, 看板 / 列表 segmented
   and search icon in the header. Status tabs with counts. Cards as in the
   prototype: ID top left, due top right, title, ↳ parent link, avatar and
   agent chips with status text; horizontally scrolled columns on phone,
   four columns on desktop with the filter chips and the 新建任務 button.
   Filters, sort and labels move behind the 列表 view and a filter sheet.
   Selecting a card on desktop opens the right panel.
4. Task detail. Phone: sheet from the bottom over the previous screen, with
   field rows (負責人, 執行者 with agent status dot, 截止, 時間, 優先級, 項目,
   標籤) as tappable rows that open pickers, subtasks, comments, and the
   審核交付物 block (findings, sources, checklist, 要求修改 / 批准) when a run
   awaits review. Desktop: the same content in the right panel. Native
   date/time inputs and the UTC hint go.
5. Inbox. Title with 全部已讀 and search; tabs with counts; rows exactly as
   the prototype: unread dot, agent icon, "<agent> 請求審核 · 09:12", ID +
   title, two-line excerpt, inline actions [批准] [查看] [延後到明天], status
   chip right. Grouped by task. Desktop inbox in the content area with the
   detail panel on the right.
6. Calendar. Prototype header (month, arrows, 日/週/月 segmented), the hint
   line, week strip with dots, unscheduled chips, hour rows, blocks with 2 px
   borders and the dashed agent block, resize handles, FAB. Remove the extra
   buttons from the header; 安排任務 lives on the unscheduled chips and task
   detail.
7. Me. Avatar, name, role · org · team; rows 組織 (value + chevron), 團隊
   (5 人 · 3 個智能體), 設定 › MCP (status); 偏好設定: 語言 segmented
   (繁體中文 / 简体 / English), 外觀 segmented (淺色 / 深色), 通知 row with
   summary; sign out at the bottom.
8. Type and density. Apply the prototype's scale: screen title 28 px, section
   labels 12–13 px, card title 15 px, meta 12 px, row heights 44–56 px,
   card padding 12–14 px, 8 px gaps. Dark theme from the prototype's
   `theme=dark`.

Rules that still hold: tokens only from `apps/web/src/styles/tokens.css`,
Lucide icons, gold ≤ 8 % of a view, 44 px targets, 12 px minimum text,
visible focus, keyboard alternative to every drag, every string in all three
locales in the same commit, no new client dependency over 20 KB gzipped
without an ADR, `pnpm perf:budget` and `pnpm perf:lcp` still pass.

Acceptance per screen, enforced in CI: a Playwright visual test captures the
screen in zh-HK and en at phone and desktop sizes with the seeded prototype
data (`pnpm db:seed` must produce the prototype's Northwind data first; do
that as part of step 2 if M9 item 5 has not landed) and compares it with a
committed baseline under `e2e/__screenshots__/`; the baseline is approved by
placing it next to the reference capture in the milestone report. Existing
Playwright flows keep passing; update selectors, not behaviour.

Validation before every push: `pnpm lint && pnpm typecheck && pnpm
licence:check && pnpm test && pnpm build && pnpm perf:budget && pnpm e2e`.
Push after every screen, update `docs/milestones/10-ui-parity.md` with the
side-by-side captures, and continue to the next screen without waiting.
Stop and ask only for licence, data deletion, publication or stack changes.
