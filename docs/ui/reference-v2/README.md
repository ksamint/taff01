# Prototype v2 reference captures

Reference PNGs of [`../prototype-v2/Team Tasks.dc.html`](../prototype-v2/),
the approved v2 UI source of truth (plan: `docs/frontend-v2-plan.md` §2.1 and
M11 item 3). They cover every phone and desktop screen in §2.1, each in zh
(zh-Hant-HK) and en, light and dark.

## Regenerate

```sh
pnpm ui:prototype-shots --v2                          # all 188 captures here
pnpm ui:prototype-shots --v2 --only=phone-mcp         # files whose name contains the text
pnpm ui:prototype-shots --v2 /tmp/shots               # another output directory
```

The script (`scripts/ui/prototype-shots.mjs`, which hands `--v2` to
`scripts/ui/prototype-shots-v2.mjs`) works like this:

- It serves `docs/ui` on an ephemeral loopback port, because the prototype
  loads fonts from `../prototype/vendor/`. It opens
  `/prototype-v2/Team%20Tasks.dc.html`.
- It blocks every request outside that origin. Any external request or page
  error fails the run.
- It freezes timers of 1 s or longer (the agent simulation and toast timers).
  Every capture therefore shows the seeded state from the 2026-10-08 11:20
  demo.
- **Language and theme are set through the UI.** For each combination it
  loads `?reset` and dismisses the home overlays. It then opens 我的 and
  clicks English and/or 深色 in 偏好設定. The prototype keeps these settings
  in its saved state (`localStorage`, keys `lang` and `theme`). The script
  checks that state and takes a snapshot of `localStorage` with
  `signedIn: false`.
- **Every capture starts from that snapshot** and reloads without `?reset`.
  Each home overlay shows the signed-out landing page. Unless the screen is
  the home screen, the script clicks 開始 / Start on the phone and
  開始 or 進入工作區 / Open workspace on the desktop.
- It drives each screen by accessible role or visible text, because the
  prototype has no test hooks. It waits for fonts, for every `dc-import`
  placeholder to resolve, and for an expected string. Embedded modules
  (timeline, relations, mind map, brief) get an extra 1.5 s to lay out.
- Each image is an element screenshot at device scale 1. Phone files show the
  390 × 844 screen without the bezel. Desktop files show the 1280 × 800
  window. The design canvas, captions and "clickable flows" notes are left
  out.

A full run takes about 12 minutes and writes about 15 MB.

## Files

Names follow `<layout>-<screen>-<lang>-<theme>.png`. Each screen below has
four files: `zh-light`, `zh-dark`, `en-light` and `en-dark`.

### Phone (27 screens, 108 files)

| Screen | File stem | How it is reached |
| --- | --- | --- |
| Home overlay | `phone-home` | Initial load (signed out) |
| Today | `phone-today` | 開始 |
| Calendar, day | `phone-calendar-day` | Tab 日曆 |
| Calendar, week | `phone-calendar-week` | 日曆 › 周 |
| Calendar, month | `phone-calendar-month` | 日曆 › 月 |
| Projects board | `phone-projects-board` | Tab 項目 |
| Projects list | `phone-projects-list` | 項目 › 列表 |
| Stakeholders | `phone-stakeholders` | 項目 › 更多 › 相關方 |
| Timeline (embedded Module Plan) | `phone-timeline` | 項目 › 時間線 |
| Relations (embedded Module Relations) | `phone-relations` | 項目 › 更多 › 關係圖 |
| Mind map (embedded Module Plan) | `phone-mind` | 項目 › 更多 › 心智圖 |
| Companies | `phone-companies` | 項目 › 公司 |
| Contacts | `phone-contacts` | 項目 › 聯繫人 |
| Company page | `phone-company-page` | 公司 › 北風零售集團 |
| Contact page | `phone-contact-page` | 聯繫人 › 黃志明 |
| New company sheet | `phone-new-company-sheet` | 公司 › 新增公司 |
| New contact sheet | `phone-new-contact-sheet` | 聯繫人 › 新增聯繫人 |
| Inbox | `phone-inbox` | 我的 › 收件箱 |
| Me | `phone-me` | Tab 我的 |
| Task detail (NW-140) | `phone-task-detail` | 項目 › 結賬改版 v2.4 發佈 |
| Search | `phone-search` | Today › 搜寻 |
| Notifications | `phone-notifications` | 我的 › 通知 |
| Agent profile (Research Agent) | `phone-agent-profile` | 我的 › 調研智能體 |
| Team | `phone-team` | 我的 › 團隊 |
| MCP | `phone-mcp` | 我的 › 設定 › MCP |
| AI brief overlay (embedded Module Plan) | `phone-ai-brief` | 我的 › AI 簡報 |
| Quick-add sheet | `phone-quick-add` | FAB 快速添加 |

### Desktop (20 screens, 80 files)

| Screen | File stem | How it is reached |
| --- | --- | --- |
| Home overlay | `desktop-home` | Initial load (signed out) |
| Today | `desktop-today` | 開始 (default view) |
| Calendar (week) | `desktop-calendar` | Sidebar 日曆 |
| Board | `desktop-board` | Sidebar 項目 |
| List | `desktop-list` | 項目 › 列表 |
| Stakeholders | `desktop-stakeholders` | 項目 › 更多 › 相關方 |
| Companies (list + detail) | `desktop-companies` | Sidebar 公司 |
| Contacts (list + detail) | `desktop-contacts` | Sidebar 聯繫人 |
| Timeline (embedded) | `desktop-timeline` | 項目 › 時間線 |
| Relations (embedded) | `desktop-relations` | 項目 › 更多 › 關係圖 |
| Mind map (embedded) | `desktop-mind` | 項目 › 更多 › 心智圖 |
| AI brief (embedded) | `desktop-ai-brief` | 林曉 (sidebar) › AI 簡報 tab |
| Me › Inbox | `desktop-me-inbox` | 林曉 (sidebar) |
| Me › Agents | `desktop-me-agents` | 林曉 › 智能體 tab |
| Me › Settings | `desktop-me-settings` | 林曉 › 設定 tab |
| Right detail panel (NW-140) | `desktop-detail-panel` | 項目 › 結賬改版 v2.4 發佈 |
| ⌘K palette | `desktop-palette` | Ctrl+K |
| Quick-add modal | `desktop-quick-add` | 項目 › 新建任務 |
| Org popover | `desktop-org-popover` | Sidebar 北風科技 |
| Folded sidebar rail | `desktop-sidebar-folded` | 收起側欄 (on Today) |

The right detail panel shows NW-141 by default (`deskSel`) on the project
views. It therefore appears in many desktop captures.

## Skipped and caveats

No screen in §2.1 was skipped. These notes describe the source, not the
captures:

- **Desktop AI brief.** The header 簡報 button is disabled in the source
  (`showBriefBtn: false`), so the brief is captured from Me › AI 簡報. That
  renders the same `deskView`/`meTab` brief.
- **Phone mind map.** The embedded mind module lays out badly at 390 px: the
  header and legend overlap the "AI insight" text, and the graph SVG
  collapses. This is how the prototype renders, so do not port it.
- **Phone relations graph.** The graph keeps its desktop-scale layout and is
  not fitted to the phone width. This is also how the prototype renders.
- **Toasts, the changes sheet and the confirm dialogs** are transient or
  depend on an action, so they are not captured. §2.1 lists them only as
  blocks inside other screens.
- **en captures** keep some seeded zh data that the prototype does not
  translate. One example is the 回滾 recent-search chip.
