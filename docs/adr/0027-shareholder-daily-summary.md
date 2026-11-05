# 0027 — Shareholder daily summary: audience tags, watermarked progress reports

Date: 2026-11-05. Status: proposed (owner review asynchronous). Follows
ADR 0015 (planning and CRM model), ADR 0016 (rules-first brief), ADR 0021
(stage, lead, shared finance), ADR 0025 (confirmed project operations) and
the ADR 0026 migration constraints.

## Context

Taff has a per-member daily digest (M7) and a per-reader rules-based brief
(M17). Neither can tell a shareholder of a given organization what happened
on "their" projects today, and neither produces an artifact that can be
handed outside the workspace. The owner asks for:

1. a **tag** composed of an audience kind and an organization
   (`shareholder + org`), applied to projects;
2. a **daily summary** per tagged audience that lists day-to-day task and
   project progress for the projects carrying that tag;
3. a **watermark** on every rendered summary so a leaked copy names its
   recipient;
4. a review of the open work and a staged upgrade plan.

Constraints that apply: core-only data access, one Zod definition per shape,
`can()` for every rule with table-driven tests, every mutation audited and
notified in one transaction, three locales per commit, Today's 200 KiB
budget, no agent code path a person lacks, the access-change test rule in
AGENTS.md, and ADR 0026 (new backend logic stays in `packages/core`
TypeScript until a module is cut over, and should be written as pure
functions with golden fixtures so Rust can port it with a parity test).

## Decision

### Audience tag = (kind, organization)

- `audience_tags` is workspace-scoped: `{id, workspaceId, kind, org, label,
  archived, version}`; `kind` is `shareholder` in v1 (a CHECK, extended by
  migration when a second kind is decided); `org` is the shareholder's own
  organization, 1–100 characters; unique on `(workspaceId, kind, org)`.
  Displayed as `股東 · {org}` / `Shareholder · {org}` through i18next.
- `project_audience_tags` links a project to a tag inside one workspace
  (composite foreign keys like `project_contacts`). A project may carry many
  tags; a tag may cover many projects. Tasks are not tagged directly: a task
  belongs to the summary through its project. Task labels stay free text.
- `audience_recipients` are the people who receive a tag's summary: `{id,
  workspaceId, tagId, name, contactId?, userId?, locale, timeZone, deliverAt
  'HH:mm', includeFinance=false, showPeople=true, enabled, nextDueAt,
  version}`. `contactId` links an existing CRM contact; `userId` links a Taff
  account for in-app reading. Both optional; a recipient with neither reads
  through a share link only.

### Daily summary = immutable, pure, same numbers as the timeline

- `buildDailySummary(source): DailySummarySnapshot` is a pure deterministic
  function in `packages/core`, modelled on `buildBrief`. Per project it
  reports stage, lead, deadline, delivery %, `buildPlanModel(plan).risk`
  (so the shareholder sees the same risk the team sees), counts (open, done,
  due today, overdue, blocked, in review), and the day's movement from
  `activity` rows on the recipient's local day: completed, started, newly
  blocked, milestones reached or slipped, agent runs completed or waiting for
  review. Lists cap at 20 items with true counts and a `truncated` flag,
  like the digest. Finance appears only when the recipient has
  `includeFinance`; people's names only with `showPeople`. The snapshot never
  contains comments, run outputs, e-mail addresses, tokens or other
  workspaces. Numbers are integers or decimal strings, never floats, so a
  Rust port's canonical JSON cannot drift (PR #84 review item 3).
- `daily_summaries` holds one immutable row per `(recipientId, localDate)`:
  `{id, workspaceId, tagId, recipientId, localDate, timeZone, locale,
  snapshot, watermark, contentHash, createdAt}`. `contentHash` is
  `sha256(canonicalJson(snapshot))`. No update route exists.
- Generation reuses the digest scheduling pattern: a minute `summary-scan`
  job pages `listDueSummaryJobs(now)` and enqueues one `daily-summary` job
  per due recipient with a stable job id; `generateDailySummary(recipientId,
  scheduledAt, version)` locks the recipient row, rechecks the tag, the
  recipient's enabled flag and the project set, builds the snapshot, inserts
  the row, the Inbox item (`kind: 'summary'`) for a linked user, the audit row
  and the NOTIFY in one transaction, then advances `nextDueAt` with the
  digest's fold and gap rules. Missed days produce only the current local
  day. Admins can `previewDailySummary` for any recipient and day without
  persisting.

### Watermark = part of the row, rendered by CSS, printed with the hash

- The `watermark` column stores `{text, recipientName, org, localDate,
  summaryId, contentHash}` at generation; `text` is
  `"{recipientName} · {org} · {localDate} · {summaryId first 8}"`. The same
  row always renders the same watermark.
- The web renders a repeated diagonal text layer over the page (CSS only,
  `print-color-adjust: exact`, `user-select: none`, `aria-hidden`) plus a
  footer with the recipient, the generation instant in the recipient's zone
  and the content hash. Print-to-PDF keeps both. No new client dependency.
- A server-rendered PDF (worker, `pdf-lib`, MIT, text watermark, hash in
  metadata) is phase 2 and needs no client budget; it is not in v1.

### Delivery = in-app for linked users, signed link for everyone else

- A linked user sees `/summaries` and `/summaries/:id` and an Inbox row.
- An admin creates a share for a summary: `summary_shares` stores
  `tokenHash = sha256(token + TOKEN_PEPPER)`, the raw token is shown once,
  `expiresAt` defaults to 7 days and is capped at 90, `revokedAt` ends it
  immediately, `viewCount` and `lastViewedAt` record use. The public page
  `/s/:token` renders exactly one summary with its watermark, without the
  app shell, with `Cache-Control: private, no-store` and `X-Robots-Tag:
  noindex`; unknown, expired and revoked tokens all answer 404. The API
  route is rate-limited in Valkey per client address before any database
  read. There is no "extend" and no "undo revoke": a new share is created
  instead, so the access inventory stays small.
- E-mail delivery (Nodemailer exists for invitations, ADR 0013) is phase 2
  and off by default.

### Permissions

New `can()` actions, each with table-driven tests (admin, member, guest,
linked recipient, agent, other workspace, after role loss):

| Action | Who |
| --- | --- |
| `audience:manage` | workspace admin person |
| `audience:read` | non-guest person |
| `summary:read` | admin; the recipient whose `userId` is the actor; never an agent in v1 |
| `summary:share`, `summary:revoke`, `summary:preview` | admin |

Per AGENTS.md, every operation that issues, re-enables or lists access is
enumerated and tested with the lowest role that can reach it and again after
that role is lost: share create, share list, share revoke, public read by
token, recipient link and unlink, tag archive. A generated summary stays
readable to its recipient after the project is untagged or the tag archived;
no further summaries are generated for it. Revoking a share or disabling a
recipient takes effect at once.

## Consequences

- Five additive tables and one Inbox kind; migration number chosen after
  PRs #81 and #82 merge (0038 on today's `main`, 0040 after them).
- Backend logic lands in `packages/core` TypeScript, with
  `buildDailySummary` carrying a Node-generated golden fixture so it joins
  `pnpm rust:fixtures` when the Rust port reaches this module.
- Today's bundle is untouched: all new routes are lazy, the public page has
  no app shell.
- Shareholders without accounts receive data through tokens that expire,
  are revoked instantly and are attributable through the watermark and hash.
- Agents get no write path and, in v1, no read path; adding `summaries.list`
  and `summaries.get` as read-only MCP tools is an open decision.

## Open decisions for the owner

1. Default audience for a tagged project: linked-account shareholders,
   link-only shareholders, or both (plan supports both).
2. Finance in summaries: default off per recipient, admin switch (proposed).
3. People's names in summaries: default on per recipient (proposed).
4. Agents reading summaries via MCP: denied in v1 (proposed).
5. Delivery beyond in-app and link: e-mail in phase 2, nothing else.
6. Server-side PDF: phase 2 with `pdf-lib` (MIT) in the worker, or stay on
   print-to-PDF.
7. Retention: keep every summary row; archive by archiving the tag.
