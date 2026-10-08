# Milestone 03 — Agent runs and review

## Working behavior

- Real, versioned agent runs with start, pause, resume, cancellation and measured
  events: steps, tool calls with capability, sources, tests, duration and USD cost.
  Agents submit text artifacts and optional diffs through REST or MCP.
- Agent profiles expose Allow / Ask / Deny permissions, person supervisors,
  duration/cost limits, default always-review policy, and admin-managed ask-only
  policy. Grants have task/run/workspace scope, human decisions, expiration,
  revocation and localized history. Deny and token scopes remain binding.
- Review workspace safely displays artifact content, diffs, sources and test
  results. Human approval requires all three checklist items and an explicit
  decision for every artifact. Comments, changes requested and resubmission are
  preserved; a new review cycle resets the checklist. Stale versions conflict.
- Inbox has All / Reviews / Blockers, task grouping, unread state, snooze with
  undo, and navigation badges. Reviews and grants resolve recipients' items.
  Today shows active agent work and links to task/run details.
- All interface strings ship in en, zh-CN and zh-HK. Mobile and desktop review
  and profile layouts use the approved TABLE AI tokens and primitives.
- MCP exposes twelve validated tools, including `files.attach`, run controls and
  permission requests. Existing review requests now submit real artifacts;
  direct task status edits cannot bypass agent review.
- Every new mutation is audited and emits transactional `taff_changes`.
  Permissions, approval races, grant isolation/expiry, cancellation and limits
  are tested against PostgreSQL 18. Artifact count is capped at 100 so every
  submitted run remains reviewable.

The PostgreSQL upgrade preserves the old volume and restores its data into a
separate PostgreSQL 18 volume. The upgrade procedure no longer deletes volumes.
No new runtime dependency was added. The existing MCP client 2.3.1 is also
declared as a root test dependency (Apache-2.0).

## Validation

All required commands pass against the integrated implementation:

| Command | Evidence |
| --- | --- |
| `pnpm lint` | 90 files, no changes required |
| `pnpm typecheck` | All six packages pass TypeScript 7 |
| `pnpm test` | 151 tests across eight files pass; dedicated PostgreSQL 18 database |
| `pnpm build` | Production Next.js build succeeds with task, review and agent routes |
| `pnpm e2e` | 18 tests pass across en, zh-CN and zh-HK |
| `pnpm mcp:smoke` | All twelve tools, real events/artifacts, expiring grants, changes requested, human approval, rate limit and revocation pass |
| `pnpm perf:budget` | Today: 195,740 bytes gzip, 191.2 KiB, below 200 KiB |

Browser flows verify assignment, run controls, actual MCP evidence, escaped HTML
preview, diffs, sources/tests, item comments, snooze/undo, checklist enforcement,
changes requested/resubmission, approval from Inbox, grant expiration/revocation
and keyboard cancellation. Existing signup, language persistence, token issuance
and optimistic rollback tests also pass. Bilingual prototype walk evidence is
recorded in `docs/ui/prototype-walkthrough.md`; rendered review/profile captures
for each app locale and mobile/desktop viewport checks were inspected locally.

A focused independent core review found three issues with scoped grants,
capability-specific grant requests and artifact bounds. All were repaired and
covered by regressions; the second review found no remaining consequential
permission or run-state blocker.

## Missing work and decisions

M4 adds WebSocket invalidation and optimistic behavior to the remaining
mutations. M5–M9 still cover the full task/project/organization model, calendar,
PWA/cache/notifications, production/CI, accessibility, final locale QA and
prototype seed data. The existing performance check measures JavaScript bytes;
LCP and Lighthouse measurement belong to M7.

Assigning a task does not launch an LLM. External agents perform the work and
submit events/artifacts. Limits pause core submissions based on reported metrics;
external runtimes must enforce their process limits. Text artifact previews are
inert; binary storage/viewers are outside this milestone's contract.

No open licence, deletion, publication or stack decision. Continue to M4.
