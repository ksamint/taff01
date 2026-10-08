# Team Tasks: audit and upgrade plan
Prototype: `Team Tasks.dc.html` · Reviewed 8 Oct 2026

> **Status, later on 8 Oct.** The prototype now covers everything in P0–P3 below, plus subtasks. Real push delivery is the one exception, because a prototype can't send device notifications.
> - **P0:** editable fields; pause, resume and cancel; confirm and undo; saved state with reset (`?reset` or `#reset` in the URL also clears it); working desktop navigation; labels.
> - **P1:** review screen with a checklist; agent profiles with Allow/Ask/Deny permissions; review policy; scoped grants with history.
> - **P2:** tap an empty slot to create; drag the bottom edge to change length; unscheduled tray; agent background lane; inbox unread and snooze; desktop inbox; phone list view.
> - **P3:** create an organization; invites; MCP client scopes; MCP call log; editable quick-add fields; notification preferences.
>
> **MCP page now matches the 2026-07-28 spec.**
> - **Endpoint:** a single Streamable HTTP path, `/mcp`. The old `/v1/sse` URL used the deprecated HTTP+SSE transport.
> - **Authorization:** OAuth 2.1, showing the authorization server, protected resource metadata, and client registration by Client ID Metadata Documents.
> - **Dynamic client registration:** off by default, because the spec deprecates it.
> - **Token:** relabelled as a personal access token, a fallback for clients without OAuth.
> - **Config:** a copyable client config.
> - **Call log:** each row shows the method and tool name.
>
> No server runs behind the page. Its URLs and token are sample data.
>
> **Decisions (8 Oct):** Traditional Chinese (Hong Kong usage) is now the default, the agent icon is `sparkles`, and not every agent output needs approval. Every agent has a review policy that defaults to "Always review" and can be changed per agent later.
>
> **Still open:**
> - The 32px small buttons inside rows. WCAG 2.2 AA requires 24px; 44px is Apple's guideline.
> - A real push service, OAuth flow and MCP server.

## 1. What was tested
Every page and journey was run end to end, with no console errors:

- **Today.** Agents-at-work card, schedule items, due-today list, avatar opens Me.
- **Calendar.**
  - Day, Week and Month views; day strip; week arrows.
  - Tapping a day in Week or a cell in Month opens that day.
  - Tapping a task block opens the task.
  - Dragging in all three views, with Undo.
- **Projects.** Column tabs and counts, opening cards.
- **Task detail.**
  - Assigning an agent: Working, then Needs review.
  - Approve; Request changes with a comment.
  - Status picker; Start agent; comments; cancelling a sheet or tapping outside it.
- **Inbox.** All / Reviews / Blockers tabs; Approve; Grant access; opening a mention; tab badge count; empty state.
- **Me.** Organization, Team, MCP, language, appearance, notifications.
- **MCP.**
  - Copy URL; show, copy and regenerate the token.
  - Revoke a client; toggle tools; connect an integration.
- **Search.**
  - Idle state, recent searches, quick filters, type chips.
  - This org vs all orgs; matches inside comments; settings results; no-results state.
- **Organizations.**
  - Switching from the sheet and from the desktop menu.
  - Team, MCP and Inbox data change per organization.
  - Opening a result from another organization switches to it.
- **Desktop.**
  - Filters, selecting a card, assign, approve, request changes, dragging cards between columns.
  - ⌘K with arrow keys, Enter, Tab and Esc; New task dialog; organization menu.
- **Language and theme.** English has no untranslated strings on any screen; toasts switch language too. Dark mode works.

## 2. Fixed in this pass
1. Seeded "Working" tasks (NW-138, QS-23, ME-8) never moved. They now continue when the page loads and when you switch into their organization.
2. In Chinese, a search match inside a comment or description showed the English text. Search now checks the current language first.
3. Toasts kept the old language after a language switch. They now re-translate.
4. The agent state label on narrow desktop cards spilled below the card border. It now stays on one line and truncates.
5. From the previous pass:
   - duplicate agent runs, and double-tap guards
   - the Idle dead end (Start agent)
   - MCP settings per organization
   - quick add with people or agents from another organization
   - Esc closes everything
   - board scroll reset on organization switch
   - empty "Due today" header

## 3. Critical audit

### A. Core value: human review of agent work (weakest area)
- **Approval is blind.** The deliverable is only a filename. There is no preview, diff, test result or source list, so a reviewer approves work they cannot see. This is the most important gap in the product.
- **No permission model.** "Grant access" is one tap with no scope, no expiry and no record of who allowed what. Agents have no limits on what they may do without review.
- **Agent progress is simulated.** It is a fixed 4-step bar. There is no run log, time or cost, and no Pause or Cancel; the only way to stop an agent is changing the status.
- **Request changes is one free-text box.** There are no comments on specific parts of the output and no checklist.

### B. Navigation and dead ends
- **Dead desktop controls.** In the sidebar, Today, Calendar, Inbox, Team and Settings do nothing. The List and Timeline tabs do nothing.
- **Task fields can't be edited.** Title, owner, due date, priority and project are read-only. The only way to change a task's date is dragging it on the calendar, and tasks without a time never appear there.
- **No change log.** Revoking a client or regenerating a token has no confirmation or undo. Neither is written to any log.

### C. Calendar
- **Missing basics.** You can't create an event by tapping an empty slot, change an event's length, or see a list of tasks with no time.
- **Agent tasks are drawn as if they take calendar time.** They show as dashed blocks the same way human work does. It isn't clear whether an agent task "occupies" time.
- **Week and Month text is 10px.** That is below a readable size for Chinese.

### D. Inbox
- **No inbox management.** There's no read/unread state, no snooze and no grouping by task. A mention is cleared only by opening it.
- **No Inbox on desktop**, even though reviewing work is most comfortable on a large screen.

### E. Design system adherence
- **Chinese variant.** Table AI specifies Traditional Chinese (zh-Hant-HK). The brief asked for Simplified, so the brief wins, but the brand team needs to sign off on this.
- **Dark theme.** It is not defined in the design system; I derived it from the deep-blue range. It needs brand review.
- **Touch targets.** Several are below 44px: 28px segmented controls, 32px icon buttons, 24px chips.
- **Type size.** Several labels are 10–11px. For Chinese text, 12px should be the minimum.
- **Agent icon.** The design system's agent icon is `sparkles`; the prototype uses `bot`, as the brief asked. This should be decided once and applied everywhere.

### F. Accessibility
- Icon-only buttons have no labels for screen readers.
- Bottom sheets don't trap or return keyboard focus.
- Calendar drag has no keyboard alternative, and task fields can't be edited, so there is no other way to reschedule.

### G. Prototype engineering
- **Size.** Everything lives in one 1,600-line file with all state in one place. That's fine for exploring, but it needs splitting before handoff.
- **No saving.** Reloading the page resets all data.
- **Simulated agents slow down in background tabs**, because they run on browser timers.
- **The clock is fixed** at 8 Oct, 11:20.

## 4. Upgrade plan

### P0: Close the dead ends (next iteration)
1. Wire up or remove the dead desktop sidebar items and the List/Timeline tabs.
2. Make task fields editable: due date and time, priority, owner, project. This also gives the calendar a keyboard alternative.
3. Add Pause and Cancel for agents.
4. Add confirmation and undo for Revoke and Regenerate token.
5. Raise touch targets to 44px and type to at least 12px; add screen-reader labels; manage focus in sheets.
6. Save data in the browser so a reload doesn't reset the demo.

### P1: Make review trustworthy (core differentiator)
1. **Review workspace.** Show the deliverable with a preview, diff, sources and test results. Allow comments on specific parts, a checklist, and Approve or Request changes for each item.
2. **Agent run log.** A timeline of steps, tool calls, files touched, duration and cost.
3. **Permissions and policies.** Each agent gets a set of allowed actions with expiry. Policies set what needs review (for example, "deploys always need Su Qing"). Grant access becomes scoped and time-limited, and every grant is logged.
4. **Agent profile page.** Which tools it can use, its supervisor, its limits and its history.

### P2: Planning depth
1. **Calendar.** Tap an empty slot to create; drag the edge to change length; a tray of tasks with no time; agent tasks shown as background work rather than time blocks.
2. **Inbox.** Read/unread, snooze, grouping by task; an Inbox and Calendar on desktop.
3. **Phone board.** A list view, filters and sorting.

### P3: Platform
1. **Organization management.** Create an organization, invite people, roles.
2. **MCP.** Scopes per client, a searchable log of every MCP call, and webhooks.
3. **Better quick add.** Replace the pattern matching with model-based parsing, and let users edit each detected field before creating.
4. **Notifications.** Push notifications and daily digests.

## 5. Open decisions for the team
- **Chinese variant.** Simplified (brief) or Traditional (brand).
- **Agent icon.** `bot` (brief) or `sparkles` (design system).
- **Approval for routine work.** Should anything an agent produces be allowed through without human approval, or does every output need sign-off?
