# Spec: shareholder daily summary

Living product specification for the module shipped in v0.2.17 (ADR 0027, milestones 85–89). This file
states the current contract; the ADR holds the decisions and their reasons. Change this file in the same
commit as the behaviour it describes.

Status: v0.2.19 candidate; release and deployment acceptance pending.

## Users and roles

| Role | Can |
| --- | --- |
| Workspace admin (person) | manage audience tags, recipients and project tags; read, preview and share every summary; revoke shares |
| Member (non-guest person) | see a project's audience chips; nothing else |
| Guest | nothing |
| Linked recipient (person whose account is the recipient's `userId`) | read their own summaries in the app |
| Link-only recipient (no account) | read one summary through a share link until it expires or is revoked |
| Agent (MCP token) | read authorized workspace summaries and files with summaries:read; no audience, preview or share management |

## Requirements

Each statement is testable. "Shall" is a hard requirement.

### Audience tags (DS-1)

- DS-1.1 An audience tag shall be the pair `(kind, organization)`; `kind` is `shareholder` in v1 and
  `organization` is 1–100 trimmed characters, with an optional label of up to 100 characters.
- DS-1.2 The pair shall be unique inside a workspace. Archiving a tag shall stop future summaries and
  share reads for its recipients, and keep existing summary rows readable to their recipients.
- DS-1.3 The tag shall display as `Shareholder · {organization}` in English, `股东 · {organization}` in
  zh-CN and `股東 · {organization}` in zh-HK.
- DS-1.4 A project may carry many tags and a tag many projects. Setting a project's tags replaces the
  whole set; the UI's Undo sends the previous set. Tasks are never tagged directly.

### Recipients (DS-2)

- DS-2.1 A recipient shall have a name, a language (en, zh-CN, zh-HK), a time zone, a delivery time
  `HH:mm`, the switches `includeFinance` (default off) and `showPeople` (default on), and an enabled
  flag.
- DS-2.2 A recipient may link an existing CRM contact and may link one Taff account; a tag shall hold at
  most one recipient per account.
- DS-2.3 Only admins shall list recipients, because recipients name people outside the workspace.

### Generation (DS-3)

- DS-3.1 When a recipient's delivery time passes in the recipient's zone, the worker shall write exactly
  one summary for that recipient and local date, within one scan interval (one minute) of the due time.
- DS-3.2 A summary row shall be immutable: the database rejects UPDATE; no route edits it. Missed days
  shall produce only the current local day.
- DS-3.3 Generation shall be skipped, and only the due marker advanced, when the recipient is disabled,
  the tag is archived, or the linked account is no longer a workspace member. Duplicate or stale jobs
  shall be harmless.
- DS-3.4 Each generation shall write the summary, an audit row with empty details and the change
  notification in one transaction. Realtime events for this module reach admin sockets only.
- DS-3.5 An admin shall be able to preview any recipient's summary for any day without persisting
  anything.

### Content (DS-4)

- DS-4.1 Per tagged project the summary shall report stage, lead, deadline, delivery progress, the
  timeline's own risk level and reasons, and the counts open, done, due today, overdue, blocked and in
  review.
- DS-4.2 For the recipient's local day it shall list work completed, work moved, newly blocked work, work
  due today, overdue work, and agent runs completed or waiting for review.
- DS-4.3 Every list shall cap at 20 items with the true count and a `truncated` flag; projects shall be
  ordered by name and capped at 100.
- DS-4.4 Finance (currency, agreed amount, received amount, collected percent) shall appear only when
  `includeFinance` is on; people's names only when `showPeople` is on.
- DS-4.5 The snapshot shall never contain comments, run outputs, e-mail addresses, tokens or data from
  another workspace. Money is a decimal string; no value is a float.
- DS-4.6 The snapshot shall carry `version: 1`, and the row a content hash
  `sha256(canonicalJson(snapshot))` and a watermark `{text, recipientName, org, localDate, summaryId,
  contentHash}` where `text` is `{recipientName} · {org} · {localDate} · {first 8 of summaryId}`. The
  same row always renders the same watermark.

### Reading in the app (DS-5)

- DS-5.1 Admins and the linked recipient shall read a summary; nobody else. A recipient keeps reading
  existing summaries after the project is untagged or the tag archived.
- DS-5.2 `/summaries` shall list the newest 31 summaries with a `truncated` flag; `/summaries/[id]` shall
  render the document with the watermark on screen and in print, the hash in the footer, and a print
  action. Me links to it; admins manage audiences at `/orgs/summaries`.
- DS-5.3 Dates and times shall be formatted in the reader's locale and zone; all strings exist in en,
  zh-CN and zh-HK.

### Share links (DS-6)

- DS-6.1 Only an admin shall create a share link for a summary. The raw token shall be shown once and
  stored only as `sha256(token + TOKEN_PEPPER)`.
- DS-6.2 A link shall expire after 1–90 days, default 7. Revocation shall take effect at once. There is
  no extend and no undo: a new link replaces it.
- DS-6.3 A link shall stop working while its recipient is disabled, its tag archived or the workspace
  archived, and resume when re-enabled unless it has expired or been revoked. Each read shall increment
  the view count.
- DS-6.4 The public page `/s/[token]` shall render on the server in the recipient's language, outside the
  app shell, with the watermark on screen and in print, `noindex` and `no-referrer`. Unknown, expired and
  revoked links shall all show the same unavailable page with status 404 and `no-store`.
- DS-6.5 The API read shall be `POST /api/shared-summary` with the token in the body only: no session,
  the same 404 for every miss, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex`, origin check
  kept, and the token never written to any log line or URL.
- DS-6.6 The public read shall be rate-limited in Valkey before any database read: 30 per minute per
  client address and 30 per minute per token hash; a failed count denies.

### Permissions (DS-7)

| Action | Allowed to |
| --- | --- |
| `audience:manage`, `summary:preview`, `summary:share`, `summary:revoke` | workspace admin person |
| `audience:read` | non-guest person |
| `summary:read` | admin, linked recipient person, or scoped agent under DS-9 |
| agent audience/preview/share operations | always denied |

Access operations that must be tested with the lowest role that can reach them, and again after that role
is lost: share create, list and revoke; public read by token; recipient link, unlink, enable and disable;
tag archive.

### Stored renders (DS-8)

- DS-8.1 Every generated summary shall enqueue text and PNG renders. Without SUMMARY_RENDER_URL only PNG
  generation shall be disabled; text remains on.
- DS-8.2 Text shall use recipient-localized labels and zone, wrap at 72 Latin or 36 full-width columns,
  remain at most 4,000 characters and mark capped lists with …(+N). Watermark and content hash shall
  remain last.
- DS-8.3 PNG shall be 1080 pixels wide, at most 400KB, with project cards, progress bars, a repeated 12%
  watermark, recipient and hash footer.
- DS-8.4 A render shall be immutable and unique per summary and format. Its source hash shall be copied
  from the stored summary; no live project data shall be consulted to render an existing summary.
- DS-8.5 Failed renders shall receive three queue attempts and a sanitized audit entry. Scans shall retry
  missing renders from the last seven days, at most once per day after failure, with format filtering
  before the batch cap.
- DS-8.6 Authenticated and public delivery shall preserve access checks and private, no-store caching
  across JSON, text and PNG. Public tokens shall travel only in the request body; unavailable formats
  retain 404 parity.

### Agent reads (DS-9)

- DS-9.1 An agent shall read summaries only through its currently resolved workspace grant carrying
  summaries:read, including after revocation or scope loss.
- DS-9.2 summaries.list shall list authorized summaries; summaries.get shall return JSON or text;
  summaries.image shall return native MCP PNG image content.
- DS-9.3 Agents shall remain denied audience reads/management, preview, share and share revocation.
  Members shall not approve summaries:read in OAuth.
- DS-9.4 Policy grants shall track home-token scope changes while retaining administrator revocations and
  manual grants.

## Non-functional

- Today's initial JavaScript stays within 200 KiB (192.5 KiB at v0.2.17).
- The public page's JavaScript target is 50 KiB; it is 187.5 KiB at v0.2.17 because it shares the root
  layout (open decision 1).
- Migrations 0038–0041 are additive. SUMMARY_RENDER_URL enables internal PNG rendering; client
  dependencies are unchanged.

## Out of scope in v1

Inbox row for a new summary; e-mail delivery; server-rendered PDF; weekly roll-up; milestones reached or
slipped as a list; a second audience kind.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| DS-4.1–4.6 | `packages/core/src/summary-model.test.ts` (10 cases, golden file `__fixtures__/summary-golden.json`) |
| DS-1, DS-2, DS-3, DS-5.1, DS-6.1–6.3, DS-7 | `packages/core/src/summaries.integration.test.ts` (5 cases) and the summary rows of `permissions.test.ts` |
| DS-7 access operations | `packages/core/src/authorization.integration.test.ts` |
| DS-3.1, DS-3.3 | `apps/worker/src/summaries.test.ts` |
| DS-6.5, DS-6.6 | `apps/api/src/summaries.test.ts` (7 cases) |
| DS-1.3, DS-1.4, DS-5.2, DS-5.3, DS-6.4 | `e2e/summaries.spec.ts` in en, zh-CN and zh-HK |
| DS-3.1 end to end | live run recorded in `docs/milestones/87-daily-summary-delivery.md` |
| DS-8.1, DS-8.5 | apps/worker/src/summaries.test.ts; summaries.integration.test.ts |
| DS-8.2 | summary-text.test.ts; three locale text goldens |
| DS-8.3 | backend/crates/taff-render/tests/render.rs; three PNG goldens |
| DS-8.4 | summaries.integration.test.ts; migration 0041 immutability trigger |
| DS-8.6 | apps/api/src/summaries.test.ts; e2e/summaries.spec.ts |
| DS-9 | permissions.test.ts; mcp-summaries.test.ts; authorization.integration.test.ts |
| DS-9.4 | token-policy.integration.test.ts |

## Open decisions

1. A second root layout for public pages, to reach the 50 KiB target (owner, milestone 89).
2. An Inbox row needs the `inbox_items.kind` CHECK rewritten, which the additive-only deploy rule forbids
without owner approval.
3. Behind Caddy the per-address limit is a global 30 per minute until the API trusts a forwarded header.

## Sources

[ADR 0029](../adr/0029-summary-text-and-image-renders.md) ·

[ADR 0027](../adr/0027-shareholder-daily-summary.md) · [agent goal](../agent-goal-daily-summary.md) ·
milestones [85](../milestones/85-daily-summary-plan.md), [86](../milestones/86-daily-summary-core.md),
[87](../milestones/87-daily-summary-delivery.md), [88](../milestones/88-daily-summary-web.md),
[89](../milestones/89-v0.2.17-candidate.md) · [CHANGELOG](../../CHANGELOG.md)
