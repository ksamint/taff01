# Spec: client navigation and optimistic state

Living specification for the remaining client completion work. Change this
file in the same commit as the behavior it describes.

Status: existing navigation and optimistic behavior shipped; run-detail continuity
is implemented for v0.2.26, not yet deployed.

## Users and roles

| Role | Can |
| --- | --- |
| Signed-in person | Navigate their permitted app panels and edit permitted data |

## Requirements

### Loading feedback (CN-1)

- CN-1.1 While desktop Me or a lazy Me panel loads, the browser shall show
  the existing localized loading text with status semantics in en, zh-CN and zh-HK.
- CN-1.2 Loading feedback shall retain the existing route, permission and
  design token behavior.

### Concurrent optimistic edits (CN-2)

- CN-2.1 When an optimistic mutation fails, rollback shall invert only its
  own changed fields and rows while retaining later pending edits.
- CN-2.2 Two overlapping failures in either order shall restore the baseline
  without resurrecting a failed layer, including shared calendar rows and
  newly created caches. Baselines shall be captured after query cancellation.
- CN-2.3 When starting a run returns its authoritative ID, the browser shall
  retain its running status while the corresponding detail read is pending.
  Provisional detail shall grant neither control nor submission authority,
  preserve existing authoritative detail and ignore acknowledgements from a
  previous session identity.

### Project management after phone filters (CN-3)

- CN-3.1 When an administrator opens the phone project filters and changes a
  task filter, the project creation control shall remain available and open
  the existing project form in en, zh-CN and zh-HK.
- CN-3.2 Project management controls shall continue to use the current
  canManageProjects read; this regression does not grant new authority.
- CN-3.3 The phone project header shall show one view selector. On a project
  page the organization link shall share the title row, and the title menu
  shall link to Companies and Contacts for people with CRM read access.
  The Projects index shall keep its section links directly visible.
- CN-3.4 When a phone project board has a task in its first column, the first
  card shall start above 240 CSS px on the 412 × 915 phone profile.

- CN-3.5 The Projects selector shall offer one Graph entry. The Graph view
  shall allow readers to switch between Relations and Mind map, and links
  with `?view=relations` and `?view=mind` shall retain their destinations.
  Editing and export shall retain each mode's existing authority.

- CN-3.6 When a reader with CRM read access opens a project's title menu,
  the menu shall link to Stakeholders. The view selector shall omit that link,
  and `?view=stakeholders` shall retain its existing access checks.

### Board task access (CN-4)

- CN-4.1 When a board card loads, the browser shall defer its task-access
  request until the card menu opens or a pointer drag starts.
- CN-4.2 When a person chooses or drops a new status, the browser shall
  send the change only after the task-access response permits that status.
  A denied or cancelled drag shall leave the task in its current column.

### Organization agent rows (CN-7)

- CN-7.1 When Organizations opens, the agent row shall show the name, profile
  link, and latest run status when available. Opening Details shall load that
  agent's supervisor and capabilities through the existing profile read.
- CN-7.2 The Details row shall use the same workspace read authority as the
  existing agent profile.

### Tasks on Today (CN-4)

- CN-4.1 Today shall list unfinished tasks whose due date falls on the
  viewer's current calendar day under Due today.
- CN-4.2 When unfinished tasks without a due date are present, Today shall
  show them in a separate disclosure with their count, closed by default.
  Undated tasks marked `meeting` remain excluded.

### Phone task details (CN-4)

- CN-4.1 When a person opens task detail on a phone, the sheet shall place
  the description immediately below the title and above status, owner,
  worker and due date, in that order. For a one-line title, the start of
  the description shall be visible on a 412 × 915 viewport before scrolling.
- CN-4.2 The sheet shall collapse schedule, priority, project and labels
  beneath a More disclosure and show their set values in its closed
  summary. The existing permissions apply to all task editors.

### Settings back navigation (CN-5)

- CN-5.1 When a person opens Notifications, MCP, Organizations, Access,
  Audit, summary administration, summary history, digest history, or an
  agent profile, the standalone page shall show one bordered back header
  with its existing destination and localized label. Organizations shall
  retain its validated return to OAuth consent when present.
- CN-5.2 On phones, those routes shall inset their body content and shall
  fit the viewport without page-level horizontal scrolling.
- CN-5.3 Notifications and agent profiles embedded in desktop Me shall
  omit the standalone back header.

## Non-functional

- No new client dependency. Today's initial JavaScript remains within its budget.

## Out of scope

- Public-share layout and approved visual references.

### Cold route reads (CN-8)

- CN-8.1 A cold Today, project board or Organizations load shall fetch each
  workspace data URL at most once while no realtime changes arrive. Today
  shall issue at most six data GETs in addition to session confirmation and
  the role check at the first realtime connection.

### Me settings navigation (CN-6)

- CN-6.1 On phones, Me shall show Inbox, AI Brief and agents before one
  Settings group, followed by Preferences.
- CN-6.2 Me shall provide direct settings links for Organizations, MCP,
  notifications, digest history and shareholder summaries. Workspace admins
  shall also have direct links to access, audit and summary administration.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| CN-3.1–3.2 | `e2e/project-filter-completion.spec.ts` |
| CN-3.3–3.4 | `e2e/project-header.spec.ts` in three locales |
| CN-4 | `e2e/board-access.spec.ts` in en, zh-CN and zh-HK, and the existing board drag and menu cases in `e2e/planning.spec.ts` |
| CN-8 | `e2e/cold-reads.spec.ts`, cold route reads in three locales |
| CN-7 | `e2e/agent-creation.spec.ts`, guest disclosure and profile request counts in en, zh-CN, and zh-HK |
| CN-4 | `e2e/today.spec.ts` in en, zh-CN, and zh-HK, and `apps/web/src/lib/today.test.ts` |
| CN-4 | e2e/task-detail.spec.ts, e2e/task-contacts.spec.ts and e2e/calendar.spec.ts in all three locales |
| CN-5 | `e2e/settings-header.spec.ts` in en, zh-CN, and zh-HK; `e2e/mcp-oauth.spec.ts` |
| CN-6 | `e2e/me.spec.ts`, settings links and workspace roles |
| CN-3.6 | `e2e/project-graph-view.spec.ts` in three locales, guest denied and member allowed on phone and desktop |
| CN-3.5 | `e2e/project-graph-view.spec.ts` and `e2e/view-export.spec.ts` in three locales |
| CN-2 | optimistic-m3.test.ts (13 tests); inherited fixes a30b779, bf7e0b5, deaf815 and 7ff9762 |
| CN-2.3 | mutations/start-run.test.ts; e2e/accessibility.spec.ts deferred real-detail read and keyboard/MCP approval flow |
| CN-1 | e2e/completion.spec.ts delayed chunk test (browser pending); i18n.test.ts |

## Open decisions

- None.

## Sources

- [Completion task cards](../agent-goal-access-and-completion.md)
- [Agent access](agent-access.md)
