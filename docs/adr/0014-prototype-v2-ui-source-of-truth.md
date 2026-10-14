# ADR 0014: prototype v2 is the UI source of truth

Status: accepted, 2026-10-14. Supersedes the v1 prototype as the visual
reference named in `docs/agent-goal.md` and `docs/ui/README.md`.

## Context

The approved prototype v2 (`docs/ui/prototype-v2/`) replaces the v1 prototype
that milestone 10 ported. It changes navigation, adds a signed-out landing,
and adds four product areas with no backend today: CRM, planning (timeline),
relations and mind map, and an AI brief. The plan
(`docs/frontend-v2-plan.md`) reviewed it line by line and found defects that
must not be ported (§2.4). The user delegated every open decision on
2026-10-14 (plan §5): the agent builds the defaults and records them here.

## Decision

1. **Visual source of truth.** Prototype v2 wins for visuals: layout,
   hierarchy, spacing, copy and component choice. It does not win for
   behaviour: `docs/ui/README.md`, `docs/agent-goal.md` and the plan win for
   data, permissions, accessibility and i18n. The TABLE AI design system is
   byte-identical to v1 apart from `fonts.css`, so
   `apps/web/src/styles/tokens.css` stays the only token source and the
   palette does not change.
2. **Navigation.** The phone tab bar has four tabs: 今天 · 日曆 · 項目 · 我的
   (Today · Calendar · Projects · Me). The inbox leaves the tab bar: on phone
   it is a pushed screen reached from 我的, Today › 查看全部 or a toast; on
   desktop it is the Me › 收件箱 tab. Its badge moves to 我的. The desktop
   sidebar is 今天 · 日曆 · 項目 › 公司 · 聯繫人 with an organization switcher,
   a ⌘K field, a fold-to-rail control and a user footer; agents move to
   Me › 智能體. `/inbox` stays a direct route.
3. **Home (D3).** The prototype's home overlay is the **signed-out** landing
   and absorbs the sign-in screen (email, username and SMS flows keep their
   `auth-*` test ids). Signed-in people land on Today, and `#task=ID` and
   `/tasks/:id` always open their target. 跳過首頁 (skip home) is not ported.
4. **Vocabulary (D5).** Task status and the agent's request use 待確認 /
   "To confirm" and 請求確認 / "requests confirmation" (zh-CN 待确认 /
   请求确认). Nouns of the review workspace stay 審核 / "Review" (zh-CN 审核).
   zh-HK is the source Chinese; zh-CN is derived and reviewed.
5. **Delete means archive (D4).** The UI's 刪除 action on contacts and
   companies archives them, with undo. Nothing is hard-deleted.
6. **Finance (D7).** Contract amounts and collected payments are visible to
   workspace admins only (`finance:read`); members see delivery percentage.
7. **Mind map and value chain (D8, D9).** The mind map is per workspace and
   ships last (M18). The value-chain layer is deferred. The relations graph
   shows people, dependencies, organization and CRM layers; its company node
   is the project's CRM client company, with the workspace as the root.
8. **Timeline moves (D10).** Moving a parent bar moves its whole subtree in
   one transaction with one undo.
9. **v1 history (D11).** `docs/ui/prototype/`, `docs/ui/reference/` and the
   v1 captures stay as history. Visual baselines are replaced screen by
   screen as each v2 screen lands; only v1 CSS and components are deleted.
10. **Branches (D1, D2).** One branch and pull request per milestone, merged
    to `main` when CI is green. The four-tab shell switch lands in one pull
    request so `main` never shows mixed navigation. `v0.1.0` is tagged only if
    `main` is green before v2 starts; otherwise v2 releases as `v0.2.0`.
11. **AI path (D6).** Brief and Ask taff ship rules-based and deterministic.
    A model path may be built as a generic OpenAI-compatible adapter, but it
    is env-gated and per-workspace opt-in, off by default, and gets its own
    ADR. No workspace data leaves the system until the user configures it.

### Do-not-port list (plan §2.4)

Every port fixes these instead of copying them:

- **Counts.** Today's 待你處理, the 我的 badge and the inbox count use one
  number: unresolved reviews plus blockers. Mentions stay in Inbox › 全部.
- **Home blocking deep links** (item 3 above).
- **Desktop toast.** The toast and its 撤銷 (undo) render on both layouts.
- **⌘K on desktop** opens results inside the active layout.
- **Desktop review and token actions.** 要求修改 opens the comment input;
  grants keep 始終允許; regenerating a token keeps its confirm step.
- **Undo** calls the inverse API operation with `version` (the existing
  optimistic-rollback pattern); it never restores a snapshot.
- **CRM.** Every CRM mutation, including plain role edits, shows a toast with
  撤銷. Contacts get email and phone on both layouts; contacts and companies
  are editable; archiving a contact asks for confirmation; search covers CRM.
- **Calendar** moves keep the rule in `docs/calendar.md`; only the timeline
  edits plan dates.
- **Many projects per organization**; the client company is per project.
- **No hard-coded clock, user or currency.** Use the member's time zone, the
  signed-in member, and `Intl.NumberFormat` with the project currency.
- **No fake intelligence.** No invented subtasks attributed to agents, no
  one-tap approve or grant from the brief, no static "AI insight", no
  simulated progress. Agent output waits in `needs_review`; suggestions are
  proposals a person applies.
- **Strings.** Every string goes through i18next in en, zh-CN and zh-HK; the
  Traditional table's simplified and variant characters are fixed (搜尋, 資訊,
  註冊, 複製, 合併, 內, 準備, 標準, 重複, 帳戶, 標籤, 週); 開始 / "Start agent"
  and 關係 / "Graph" become consistent pairs.
- **Accessibility floor.** 44 px targets, 12 px minimum text, visible focus,
  names on icon-only buttons, no clickable `<div>`s, labelled inputs, focus
  trapped and restored by dialogs, and a keyboard alternative to every drag
  (timeline, board, dependency link).
- Where the designer's `DEPLOY.md` and the prototype markup disagree (我 vs
  我的, 簡報 vs AI 簡報, 關係/心智 vs 關係圖/心智圖, settings order), the
  markup wins.

## Consequences

- `docs/ui/README.md` is rewritten for v2 and maps every v2 screen to a route
  and its data; the v1 mapping moves to history.
- `db/schema.sql` and `taff-store.js` are concept input only. New tables
  follow the repository pattern (uuid and `workspace_id`, composite foreign
  keys, `version`, the `_audit` trigger) through Drizzle migrations.
- Behavioural e2e changes selectors, never behaviour, as screens move.
- The Today bundle must not grow: CRM, timeline, relations, brief and mind
  map load as lazy route chunks.
