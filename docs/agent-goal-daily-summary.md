# Agent goal: shareholder daily summary — audience tags, watermarked progress reports, share links

> Status 2026-11-05: written after the review in
> `docs/reviews/2026-11-05-pr-and-plan-review.md`. The design is
> [ADR 0027](adr/0027-shareholder-daily-summary.md). No code exists yet.
> The owner reviews asynchronously; the seven open decisions in the ADR have
> proposed defaults, so build on those unless redirected.
>
> **2026-11-05: S1 done** (`docs/milestones/86-daily-summary-core.md`);
> migration 0038 is taken. Read the ADR's "Implementation notes" before S2:
> there is no Inbox row in v1.
>
> **2026-11-05: S2 done** (`docs/milestones/87-daily-summary-delivery.md`).
> The public read is `POST /api/shared-summary` (ADR notes, S2).
>
> **2026-11-05: S3 done** (`docs/milestones/88-daily-summary-web.md`) except
> visual baselines and the public page's 50 KiB target (ADR notes, S3).
> Start at S4.

Paste everything below this line as the goal.

---

Work in `ksamint/taff01` on a branch from `main`. Read first: `AGENTS.md`,
`instruction_v0.md`, `docs/adr/0027-shareholder-daily-summary.md`,
`docs/notifications.md` (the digest contract you mirror),
`docs/milestones/17-ai-brief.md` and `packages/core/src/brief.ts` (the pure
builder pattern), `packages/core/src/notifications.ts` and
`apps/worker/src/digests.ts` (the scheduling pattern), `docs/adr/0021-*.md`
(finance visibility), `docs/release-closeout.md`. Follow the commit
`2b8f6ff` pattern: one shared Zod schema, core-only data access, `can()` for
every rule, three locales, tests with the code.

Standing rules: `packages/core` is the only database code; REST and MCP are
thin adapters; every mutation is one transaction with an `activity` row and
`NOTIFY taff_changes`; dates are formatted in the browser in the reader's
locale and zone; no new client dependency over 20 KB gzipped without an ADR;
Today stays ≤ 200 KiB; conventional commits; licence of any new dependency
in the commit message; never commit secrets.

Validation before every push: `pnpm lint && pnpm typecheck &&
pnpm licence:check && pnpm test && pnpm build && pnpm build:server &&
pnpm perf:budget && pnpm e2e && pnpm mcp:smoke`.

## Migration number

`main` is at 0037. PRs #81 (0038) and #82 (0039) are open. Take the next
free number at the time you branch and say which in the milestone. Keep the
migration additive; no backfill is needed.

## S1 — Schema, shared schemas, core, permissions

1. **Tables** (Drizzle in `packages/db/src/schema.ts`, one SQL migration):
   - `audience_tags`: `id, workspace_id, kind CHECK ('shareholder'), org
     (1–100 trimmed), label (0–100), archived, version > 0, created_at,
     updated_at`; unique `(workspace_id, kind, org)`; unique
     `(workspace_id, id)` for composite references.
   - `project_audience_tags`: `id, workspace_id, project_id, tag_id,
     created_by (member), created_at`; composite FKs to
     `projects(workspace_id, id)` and `audience_tags(workspace_id, id)`
     with cascade; unique `(workspace_id, project_id, tag_id)`.
   - `audience_recipients`: `id, workspace_id, tag_id, name (1–100),
     contact_id?, user_id?, locale, time_zone, deliver_at CHECK 'HH:mm',
     include_finance false, show_people true, enabled true, next_due_at,
     version`; composite FK to the tag and, when set, to
     `contacts(workspace_id, id)`; `user_id` references `user.id`; partial
     unique `(tag_id, user_id) WHERE user_id IS NOT NULL`; index
     `(enabled, next_due_at)`.
   - `daily_summaries`: `id, workspace_id, tag_id, recipient_id,
     local_date, time_zone, locale, snapshot jsonb, watermark jsonb,
     content_hash CHECK '^[a-f0-9]{64}$', created_at`; unique
     `(recipient_id, local_date)`; index `(workspace_id, tag_id,
     local_date)`. No `updated_at`; add a trigger that rejects UPDATE.
   - `summary_shares`: `id, workspace_id, summary_id, token_hash unique,
     created_by (member), expires_at, revoked_at, revoked_by, view_count,
     last_viewed_at, created_at`; index `(summary_id)`.
   - `inbox_items.kind` CHECK gains `'summary'`; `inbox_items.summary_id`
     nullable like `digest_id`.
2. **Schemas** (`packages/schemas/src/summaries.ts`, exported from the
   index): `audienceTagSchema`, `audienceTagInputSchema {org, label?}`,
   `audienceTagUpdateSchema {version, label?, archived?}`,
   `audienceRecipientSchema`, `audienceRecipientInputSchema {name,
   contactId?, userId?, locale, timeZone, deliverAt, includeFinance,
   showPeople}`, `audienceRecipientUpdateSchema {version, …partial, enabled?}`,
   `projectAudienceTagsInputSchema {version, tagIds}`,
   `dailySummarySnapshotSchema` (see ADR 0027: `version: 1`, `localDate`,
   `timeZone`, `tag {kind, org}`, `recipient {name}`, `workspace {name}`,
   `projects[]` with `projectId, number?, name, stage, leadName|null,
   dueDate|null, deliveryProgress, risk {level, reasons[]}, finance?
   {currency, contractAmount, receivedAmount, collectedPercent}, counts,
   today {completed[], started[], blocked[], dueToday[], overdue[],
   milestones[], agentRuns {completed, pendingReview}}, truncated`, and
   `totals`), `dailySummarySchema` (row with `watermark` and
   `contentHash`), `dailySummaryListSchema {items, truncated}`,
   `summaryShareSchema`, `issuedSummaryShareSchema` (adds `token` once),
   `summaryShareInputSchema {expiresInDays 1..90, default 7}`,
   `summaryJobSchema {recipientId, scheduledAt, version}`,
   `summaryPreviewInputSchema {recipientId, localDate?}`. Item lists cap at
   20 entries; money is a decimal string; nothing is a float.
3. **Core** (`packages/core/src/summaries.ts`, wired into `createCore`):
   - Pure: `buildDailySummary(source: SummarySource): DailySummarySnapshot`
     and `summaryWatermark(row): Watermark`. Deterministic ordering (project
     number then name; items by time then id). Unit tests with a fixture
     built from `plan-model.fixture.ts` on a fixed day, asserting that each
     project's `risk` equals `buildPlanModel(plan).risk`, that caps and
     counts hold, that finance and names disappear with their switches, and
     that the snapshot contains no key named `comment`, `output`, `email`
     or `token`. Commit the fixture's expected JSON as a golden file and add
     a script `scripts/rust-summary-golden.mts` so `pnpm rust:fixtures`
     (PR #84) can pick it up later.
   - Data: `createSummarySource(tx, recipient, day)` loads tagged projects
     with their plan inputs (the same loader the brief uses), `activity`
     rows on the recipient's local day via the digest's `localSql`
     (`tasks.update` status transitions, milestone changes, run
     completions), and current task counts. Finance is read only when
     `includeFinance`.
   - Operations on `Principal`: `listAudienceTags`, `createAudienceTag`,
     `updateAudienceTag`, `listAudienceRecipients`,
     `createAudienceRecipient`, `updateAudienceRecipient`,
     `setProjectAudienceTags` (versioned on the project, returns the project
     and the tag list), `listProjectAudienceTags`, `listDailySummaries
     (workspaceId, {tagId?, recipientId?})` newest 31 with `truncated`,
     `getDailySummary`, `previewDailySummary`, `createSummaryShare`,
     `listSummaryShares`, `revokeSummaryShare`, and the public
     `readSharedSummary(token)` which hashes with `TOKEN_PEPPER`, checks
     expiry and revocation in one query, increments `view_count`, and
     returns the row or `not_found`.
   - Jobs: `listDueSummaryJobs(now, limit=100, cursor)` keyset-paged like
     `listDueDigestJobs`; `generateDailySummary(recipientId, scheduledAt,
     version)` returns `{status: 'generated'|'skipped', summaryId}`;
     locks the recipient row, rechecks enabled, tag not archived, linked
     user still a member when `userId` is set, inserts the summary, the
     Inbox item for a linked user, the audit row (empty details) and the
     NOTIFY in one transaction, then advances `next_due_at` with the digest's
     fold and gap rules. Duplicate or stale jobs are harmless.
4. **Permissions**: add `audience:manage`, `audience:read`, `summary:read`,
   `summary:preview`, `summary:share`, `summary:revoke` to `Action`; put
   `recipientUserId?: string | null` on `Resource`. Table-driven rows in
   `permissions.test.ts` per ADR 0027. Agents: every new action false.
5. **Realtime and audit**: extend the ChangeEvent action whitelist with the
   five tables; summary and share events carry `recipientOnly: true` with
   the linked `userId` when one exists, plus `workspaceId` for admins
   (the hub already routes to workspace OR user sockets, deduplicated).
   Activity `details` stay empty for summaries and shares.
6. **Access matrix test** (`summaries.authorization.integration.test.ts`),
   required by AGENTS.md: for share create, list, revoke, public read by
   token, recipient link/unlink, recipient enable/disable and tag archive,
   run admin, member, guest, linked recipient, agent token and an outsider;
   then demote the admin and re-run create/revoke; unlink the recipient and
   re-run `summary:read`; revoke a share and re-read by token; let a share
   expire (inject the clock) and re-read.

Milestone `docs/milestones/NN-daily-summary-core.md` (≤ 40 lines), push,
continue.

## S2 — Worker, REST, MCP smoke

1. Worker: add `summary-scan` (`every: 60_000`) and `daily-summary` to the
   existing processor (`apps/worker/src/digests.ts` pattern, stable job id
   from `recipientId\0scheduledAt\0version`, `attempts: 3`, exponential
   backoff, `removeOnFail: true`). Unit test the processor with a fake
   queue.
2. REST (`apps/api/src/routes/summaries.ts`), every body through the shared
   schemas, every call through core:
   - `GET|POST /api/workspaces/:id/audience-tags`,
     `PATCH /api/audience-tags/:id`
   - `GET|POST /api/audience-tags/:id/recipients`,
     `PATCH /api/audience-recipients/:id`
   - `GET|PUT /api/projects/:id/audience-tags`
   - `GET /api/summaries?workspaceId=…&tagId=…&recipientId=…`,
     `GET /api/summaries/:id`, `POST /api/summaries/preview`
   - `GET|POST /api/summaries/:id/shares`, `DELETE /api/summary-shares/:id`
   - public `GET /api/share/:token`: rate-limited in Valkey per client
     address and token hash before the database (reuse `rateLimiter`), 404
     for unknown, expired and revoked, `Cache-Control: private, no-store`,
     `X-Robots-Tag: noindex`, no CORS relaxation.
   Route tests mirror `crm.test.ts`: status codes, schema rejection, and
   that the token is never logged (pino redaction test).
3. MCP: no new tools in v1 (ADR 0027 decision 4). Keep `pnpm mcp:smoke`
   green; the tool count stays 33 on `main` (34 after PR #81).
4. `.env.example` and `.env.production.example`: no new variable;
   `TOKEN_PEPPER` is reused. Say so in the milestone.

Milestone `NN-daily-summary-delivery.md`, push, continue.

## S3 — Web: tags on projects, admin page, recipient pages, watermark

1. **Project**: the project dialog (`projects-scene.tsx`) gains an audience
   tag picker (admin only, `project-audience-tags`); the header shows chips
   `股東 · {org}` (`project-audience-tag`). Optimistic through a
   `useProjectAudienceTags` mutation with rollback and a toast with Undo
   (the inverse is the previous tag list with the returned version).
2. **Admin page** `/orgs?tab=summaries` (desktop) and the Organizations
   screen row on phone (`summaries-admin`): tags (create, label, archive),
   recipients per tag (name, contact or user link, locale, zone, time,
   finance and names switches, enabled), covered projects, `Preview today`
   (`summary-preview`, renders the same view as a real summary with a
   PREVIEW watermark), summaries list per recipient, shares per summary
   (create with expiry, copy link once, list, revoke with confirm). Lazy
   route; Today budget unchanged.
3. **Recipient pages** `/summaries` and `/summaries/[id]` (lazy, restyled
   from `digest-view.tsx`), Inbox row `kind: 'summary'` linking to the row.
4. **Public page** `/s/[token]`: server-rendered, no app shell, no
   TanStack persist, no service-worker caching (extend the SW deny list),
   `noindex`. Renders workspace name, tag, local date, the project cards,
   the watermark layer and the footer (recipient, generated at, content
   hash). A print button calls `window.print()`; the print stylesheet
   keeps the watermark (`print-color-adjust: exact`). Measure this route's
   JS and record it (target ≤ 50 KiB gzipped).
5. **Watermark component** (`summary-watermark.tsx`): a `position: fixed`
   layer of rotated repeated text from `watermark.text`, `aria-hidden`,
   `pointer-events: none`, `user-select: none`, token colours only, light
   and dark. Used by the recipient, admin preview and public pages.
6. **i18n**: `audience.*`, `summary.*`, `share.*` in en, zh-CN, zh-HK in
   the same commit; key parity test green. Dates and money through `Intl`
   in the reader's locale and zone; on the public page, the recipient's
   stored locale and zone.
7. **Test ids**: `project-audience-tags`, `project-audience-tag`,
   `summaries-admin`, `audience-tag-new`, `audience-tag-row`,
   `audience-recipient-new`, `audience-recipient-row`, `summary-preview`,
   `summary-list`, `summary-row`, `summary-view`, `summary-project`,
   `summary-watermark`, `summary-hash`, `summary-share-new`,
   `summary-share-link`, `summary-share-revoke`, `share-page`,
   `share-print`. Regenerate `e2e/support/test-id-contract.md`.
8. **Playwright** (all three locales, phone and desktop): admin creates a
   tag and recipient, tags a project, previews, generates (test hook or
   direct core call), opens the summary, creates a share, opens the link in
   a fresh browser context, asserts the watermark text and hash are
   visible, revokes, reloads the link and sees 404. Visual baselines for the
   public page in both themes.

Milestone `NN-daily-summary-web.md`, push, continue.

## S4 — Release candidate

1. Changelog entry under the next version (`v0.2.17` unless the owner
   bumps the minor), README feature line, `docs/notifications.md` gains a
   "Shareholder summaries" section, `docs/ui/README.md` routes table gains
   the four routes, `docs/upgrade-plan.md` row moves to "applied".
2. Candidate checkpoint in `docs/deploy.md` and the closeout per
   `docs/release-closeout.md`. Migration count and `summary-scan` readiness
   are recorded from the worker log. No production recipient or share is
   created by the deployer; the owner creates the first tag.

## S5 — Phase 2 (each needs the owner's yes)

- `pdf-lib` (MIT) in the worker: render the summary to PDF with the text
  watermark and the hash in document metadata; store beside the row; serve
  through the share link with `Content-Disposition: attachment`.
- E-mail delivery through the existing Nodemailer transport, opt-in per
  recipient, containing the link only (never the summary body).
- Read-only MCP tools `summaries.list` and `summaries.get` with
  `tasks:read`, annotated read-only, denied for shares.
- Weekly roll-up (`kind: 'weekly'` on the same tables).
