# Milestone 05 — Task model and views

## Working behavior

- Tasks have descriptions, human owners, deadlines in the user's time zone,
  priorities, projects, labels, real subtasks and comments. Every mutation
  increments its version. Editors retain their original version while a draft
  is open, reject stale saves, preserve failed drafts and send only changed
  fields; unchanged deadlines retain their exact instant, including DST folds.
- Project boards support native pointer dragging, horizontal edge scrolling on
  phones and a keyboard/status-select alternative. List and board share project,
  owner/agent and label filters and sorting. Human admins create, rename and
  archive projects; archiving preserves existing tasks.
- Search opens from the header or Command/Ctrl-K, searches authorized tasks,
  descriptions and comments, and merges localized settings results. Workspace
  scope, all authorized organizations, type filters, quick filters, recent
  searches and keyboard result navigation are available.
- Quick Add parses English and Chinese dates/times, members, projects, labels and
  priorities in core. Parsing creates nothing; all detected fields remain
  editable before creation. Ambiguous or unknown matches produce localized
  warnings rather than invented assignments.
- People create and switch organizations, optionally copying selected agents
  with fresh identities and default policy. Admins issue, revoke and replace
  invitations and manage admin/member/guest roles. Guests are read-only; a
  transaction lock preserves the last human admin even under concurrent changes.
- Invitations use peppered token hashes, expire after seven days and require the
  signed-in invitee's matching email. Links put the show-once token in a URL
  fragment, removed before authentication; acceptance sends it in a POST body.
  Tokens are never listed or cached as mutation results. Copying a link does not
  send an email.
- Subtasks inherit omitted deadlines, priorities and projects. A parent cannot
  complete with unfinished children; a completed parent's child cannot reopen
  until its parent reopens. Active agent runs protect their task context and
  retain the existing human review requirement.
- REST and eighteen MCP tools use shared schemas and core permissions. New
  tables participate in transactional audit and notifications. Membership
  changes reach the affected user's socket even while another organization is
  selected, without broadcasting to unrelated users. New views use the existing
  optimistic snapshots, rollback and account-scope guards.
- All interface strings cover en, zh-CN and zh-HK. English fallback is bundled;
  Chinese resources are cached same-origin JSON. A request generation prevents
  delayed resource loading from overriding a newer language choice.

Migrations 0009–0011 add planning data and invariants without deleting existing
application data. No dependency was added. The detailed behavior and adapter
contract are in [planning.md](../planning.md).

## Validation

| Command | Evidence |
| --- | --- |
| `pnpm lint` | 121 files pass Biome |
| `pnpm typecheck` | All six packages pass TypeScript 7 |
| `pnpm test` | 274 tests across eighteen files pass, including PostgreSQL 18 |
| `pnpm build` | Production Next.js build succeeds, including static locale JSON routes |
| `pnpm e2e` | All 45 browser cases pass across en, zh-CN and zh-HK (2.6 minutes) |
| `pnpm mcp:smoke` | All eighteen tools, evidence, grants, human review, rate limit and revocation pass |
| `pnpm perf:budget` | Today: 202,370 bytes gzip, 197.6 KiB, below 200 KiB |

PostgreSQL regressions cover stale edits, active-run context protection, guest
permissions, project/workspace boundaries, subtask completion/reopen races,
invitation hashing/expiry/email/revocation/single-use races, last-admin races,
transactional notification delivery and rollback silence. Time-zone coverage
includes a skipped local midnight and fixed-offset Today search boundaries.
Parser/schema tests validate ambiguous matches, DST gaps and input limits.
Actual API and WebSocket tests cover rich fields, malformed filters, valid
20,000-character CJK/escaped descriptions, full escaped comments and targeted
membership routing.

Independent core and UI review findings were repaired and accepted by source and
regression inspection. All twelve focused M5 browser cases pass across the three
locales. Thirty-six desktop/393-pixel phone captures cover boards, lists, task
editing, organizations, search and parsed Quick Add. No browser runtime error or
page overflow remains. Phone board containment, offscreen edge dragging and
multiline search-result layout were repaired from actual visual/gesture evidence.
An additional production browser check loads the same eight JavaScript files
(202,370 bytes gzip) in all three locales; Chinese resources return JSON rather
than adding initial JavaScript chunks. The browser save test explicitly waits
for the server response before asserting persisted fields, and pending task
cards cannot navigate temporary identifiers.

## Missing work and decisions

M6–M9 remain: the complete calendar and recurrence, IndexedDB/PWA/notifications,
production/CI, release accessibility and locale QA, and prototype seed data.
Invitations provide copyable links; email delivery is not configured. Agent runs
still require external runtimes to supply real events and enforce process limits.
No offline write queue is implemented.

No open licence, deletion, publication or stack decision. Continue to M6.
