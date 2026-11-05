# Agent goal: access fix (backend and frontend), access matrix, organization-wide Twin access, summary text and image renders

> Status 2026-11-05: detailed development plan for the sequence in
> `agent-goal-access-and-completion.md` §2, with the renders added to
> v0.2.19. Designs: [ADR 0028](adr/0028-organization-wide-agent-grants.md),
> [ADR 0029](adr/0029-summary-text-and-image-renders.md). Nothing below is
> implemented. The owner reviews asynchronously; open decisions carry
> proposed defaults, build on them unless redirected.

Paste everything below this line as the goal.

---

Work in `ksamint/taff01` on a branch from `main` per release. Read first:
`AGENTS.md`, `instruction_v0.md`, `docs/spec/daily-summary.md`, ADR 0022,
0023, 0027, 0028, 0029, PR #81's branch, `docs/release-closeout.md`,
`.claude/skills/module-spec/SKILL.md`. Standing rules as in
`agent-goal-access-and-completion.md`. Every task card below names its
files, the test that proves it, and its commit subject. One card, one
commit, unless the card says otherwise. Milestone file ≤ 40 lines per
release, push, continue.

## Release 1 — v0.2.18: access fix, PR #81, ADR 0028, MCP workspace selection

Branch `feat/v0.2.18-organization-access`. Migrations: 0039 (PR #81,
renumbered), 0040 (ADR 0028).

### A1 Land PR #81 (3 commits)

- `git fetch origin pull/81/head` and rebase onto `main`. Conflicts expected
  in `packages/schemas/src/index.ts` (summary schemas), `apps/api/src/mcp.ts`
  (tool registration order), `packages/db/migrations/meta/_journal.json`.
- Rename `0038_agent_token_workspaces.sql` → `0039_…`; journal idx 39; add
  the lineage row in `packages/db/src/migration-lineage.test.ts`.
- Remove `TAFF_FULL_CI_ENABLED` wording from its milestone and rename it to
  the next free number.
- Tests: `pnpm test` (expect PR #81's 1,844 + the summary suites),
  `authorization.integration.test.ts`, `pnpm mcp:smoke` (34 tools), the
  three-locale grant-form browser case it lists as pending
  (`e2e/mcp-oauth.spec.ts` or new `e2e/token-grants.spec.ts`).
- Commits: `feat(core): authorize personal MCP tokens across explicit
  workspace grants (#81 rebased)`, `chore(db): renumber grant migration to
  0039`, `docs: milestone NN grant acceptance`.

### A2 Schema for ADR 0028

- `packages/db/migrations/0040_token_organization_policy.sql`:
  `ALTER TABLE agent_tokens ADD COLUMN organization_policy text NOT NULL
  DEFAULT 'explicit' CHECK (organization_policy IN ('explicit',
  'all_organizations'))`; `ALTER TABLE agent_token_workspaces ADD COLUMN
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual',
  'policy'))`, `ADD COLUMN revoked_by uuid`. Drizzle columns in
  `packages/db/src/schema.ts`; journal; lineage test row.
- Shared schemas (`packages/schemas/src/index.ts`): `tokenOrganizationPolicySchema`
  (`'explicit' | 'all_organizations'`), `agentTokenSchema` gains
  `organizationPolicy`, `agentTokenWorkspaceSchema` gains `origin`,
  `revokedBy`; `tokenOrganizationPolicyInputSchema {version, policy}`.
- Test: `packages/schemas/src/summaries.test.ts` pattern → `tokens.test.ts`
  rejects unknown policy and origin.
- Commit: `feat(db): token organization policy and grant origin (ADR 0028)`.

### A3 Core: policy, enrollment, restore

- `packages/core/src/token-policy.ts` (new, wired into `createCore`):
  - pure `planPolicyEnrollment({token, workspaces, grants, members})` →
    `{insertGrants[], createMembers[], revokeGrantIds[]}`; deterministic
    order; golden `packages/core/src/__fixtures__/token-policy-golden.json`
    and `scripts/rust-token-policy-golden.mts` registered in
    `pnpm rust:fixtures`.
  - `setTokenOrganizationPolicy(p, tokenId, {version, policy})`: requires
    `can(actor, "token:policy")` (system administrator); loads active
    organization workspaces (`kind = 'organization'`, not archived); for
    `all_organizations` inserts policy grants and missing agent members (the
    default-agent factory from milestone 37, reused, not copied); for
    `explicit` revokes active `origin = 'policy'` grants; one transaction;
    one `activity` row per touched workspace with the actor; `NOTIFY`;
    version check on the token.
  - `enrollPolicyTokens(tx, workspaceId)`: called inside `createWorkspace`
    for organizations after the default agent; idempotent.
  - `restoreTokenWorkspaceGrant(p, grantId)`: target workspace admin or
    system administrator; clears `revokedAt`/`revokedBy`; refuses when the
    token is revoked or the workspace archived.
  - `listTokenWorkspaces` returns `origin`, `revokedBy`.
  - Sticky revocation: a grant revoked by a workspace admin is skipped by
    `planPolicyEnrollment` (it is in `grants` with `revokedAt`), never
    re-inserted.
- Tests: `token-policy.test.ts` (pure, 8 cases incl. sticky revocation and
  archived workspaces); `token-policy.integration.test.ts` (PostgreSQL):
  set policy enrolls N organizations and 0 personal; new organization
  enrolls; revert policy revokes policy grants only; restore; archived
  workspace excluded; `resolveAgentWorkspace` honours each state.
- Commit: `feat(core): organization-wide token policy with materialized
  grants (ADR 0028)`.

### A4 Permissions and the access-change matrix

- `packages/core/src/permissions.ts`: actions `token:policy` (person with
  `systemAdmin`), `token:grant` and `token:grant_revoke` (admin of
  `resource.workspaceId`, or system administrator); agents false.
- `permissions.test.ts`: table rows for admin, member, guest, system
  administrator, agent, outsider.
- `authorization.integration.test.ts`: per AGENTS.md, the operations set
  policy, enroll on create, list grants, revoke one, restore one, revert
  policy, archive, unarchive; each with the lowest reaching role, then
  demote that role and repeat; agent token on every management route → 401
  or 403.
- Commit: `test(core): access-change matrix for token policy and grants`.

### A5 MCP API update

- `apps/api/src/mcp.ts` (on PR #81's base): `workspaces.list` returns
  `{workspaceId, name, kind, scopes, origin}`; tool descriptions say that
  omitting `workspaceId` uses the token's home workspace; `context.get`
  returns `authorizedWorkspaces: [{workspaceId, name}]` so one call tells
  Twin where it may act.
- `apps/api/scripts/mcp-round-trip.ts`: add `projects.create`,
  `projects.edit` (fixes the pre-existing unit failure) and
  `workspaces.list`; `MCP_TOOL_ARGS` is the only tool registry (PR #84's
  rule) so the count derives from it (34).
- Tests: `mcp-workspaces.test.ts` (PR #81) extended with origin and a
  policy-enrolled workspace; `pnpm mcp:smoke` green.
- Commit: `feat(mcp): workspace selection with grant origin; round-trip
  covers projects and workspaces`.

### A6 REST

- `apps/api/src/app.ts`: `PUT /api/agent-tokens/:id/organization-policy`
  (body `tokenOrganizationPolicyInputSchema`), `POST
  /api/agent-token-workspaces/:id/restore`, `GET
  /api/admin/agent-tokens?policy=all_organizations` (system administrator;
  tokens with their grant counts). All through `can()` in core.
- Tests in `apps/api/src/app.test.ts` (status codes, schema rejection, agent
  bearer refused) and the actor matrix.
- Commit: `feat(api): token organization policy and grant restore routes`.

### A7 Web (admin token card on `/me/mcp`)

- `apps/web/src/components/mcp-view.tsx`: grant rows show origin
  (`Manual` / `Policy`), revoked-by, Restore (confirm step); for system
  administrators a policy switch with a confirm dialog listing the
  organizations to enroll (count and names from `GET /api/admin/workspaces`).
  Strings in en, zh-CN, zh-HK (`mcp.policy.*`).
- Test: `e2e/token-grants.spec.ts` three locales: admin sees origin,
  system administrator sets policy and sees N enrolled, revoke one, restore.
- Commit: `feat(web): organization policy and grant origin on the MCP page`.

### A8 `Cache-Control: private` on authenticated SSR HTML

- `apps/web/next.config.ts` headers for the app routes (not `/s/*`, not
  static): `private, no-store`. Test: `e2e/ssr-session.spec.ts` asserts the
  header in three locales.
- Commit: `fix(web): mark authenticated SSR HTML private`.

### A9 Spec and docs

- `docs/spec/agent-access.md` with the module-spec skill: roles, AA-1
  tokens, AA-2 grants, AA-3 policy, AA-4 OAuth roles (from milestone 33),
  AA-5 permissions, acceptance table. `docs/notifications.md` unchanged.
- Commit: `docs(spec): agent access`.

### A10 Release

- Versions 0.2.18; CHANGELOG; `docs/deploy.md` "Release candidate v0.2.18"
  (migrations 0039–0040, no env var, no proxy change, live acceptance:
  `workspaces.list` from the operator's test token answers the enrolled
  organizations; no production policy set by the deployer).
- Operator's step after closeout: set `all_organizations` on Twin's existing
  token through `PUT /api/agent-tokens/:id/organization-policy`; no rotation.
- Milestone ≤ 40 lines.

## Release 2 — v0.2.19: access matrix, summary text and image renders, agent summary reads

Branch `feat/v0.2.19-access-matrix-and-renders`. Migrations: 0041
(`summary_renders`), scope enum change.

### B1 Core access matrix read

- `packages/core/src/access-matrix.ts`: `getAccessMatrix(p, workspaceId)`
  (`workspace:manage`): `people[]`, `agents[]` (capabilities from
  `agentPermissions`, review policy, supervisor), `tokens[]` with grants
  and origin, `oauthGrants[]`, `pendingGrants[]`, `actions[]` = the `can()`
  rows for admin, member, guest and agent on this workspace produced by
  `exportPermissionRows()` (a new export in `permissions.ts` that the
  permission test also consumes, so the matrix and the tests cannot drift).
  `getSystemAccessMatrix(p)` (system administrator): organizations × tokens
  with policy and grant state.
- Schema `accessMatrixSchema`, `systemAccessMatrixSchema`.
- Tests: fixture workspace with every role, one token with manual and one
  with policy grants; snapshot of `actions[]` equals the permission table.
- Commit: `feat(core): access matrix read models`.

### B2 REST

- `GET /api/workspaces/:id/access-matrix`, `GET /api/admin/access-matrix`.
  Actor matrix rows. Commit: `feat(api): access matrix routes`.

### B3 Web `/orgs/access`

- Route `apps/web/app/orgs/access/page.tsx` (lazy, admins; link from
  Organizations beside Summaries). Component
  `apps/web/src/components/access-matrix.tsx`: tabs People (role select via
  existing member role API, confirm on demotion of self), Agents
  (capability allow/ask/deny and review policy via existing agent
  endpoints), Tokens (grants with origin, revoke with confirm, restore,
  Explain drawer calling `/api/admin/integrations/permissions`), Apps
  (OAuth grants, revoke). Phone: one matrix per screen, horizontal scroll
  inside the card, sticky first column. Undo toast where an inverse exists
  (role change, capability change). Strings in three locales.
- Test: `e2e/access.spec.ts` three locales: admin opens and changes a
  capability and sees it in the agent profile; member gets the 403 page;
  phone layout snapshot. Today budget unchanged (`pnpm perf:budget`).
- Commit: `feat(web): access matrix for workspace admins`.

### B4 Web `/admin/access`

- Route for system administrators (`users.system_admin`; others 404):
  organizations × tokens, policy switch (same dialog as A7), enroll state
  per cell (active, revoked by admin, archived). Commit:
  `feat(web): system access matrix`.

### B5 Generated permissions matrix document

- `scripts/permissions-matrix.mts` writes `docs/spec/permissions-matrix.md`
  from `exportPermissionRows()`; `pnpm lint` fails if the file is stale
  (`scripts/permissions-matrix.test.ts` regenerates and diffs). Commit:
  `docs(spec): generated permissions matrix`.

### B6 Text render (ADR 0029 decision 1)

- `packages/core/src/summary-text.ts`: `renderSummaryText(...)`, pure;
  wraps at 36 CJK or 72 Latin columns; sections in a fixed order; watermark
  and hash lines last; ≤ 4,000 characters with a `…(+N)` marker per capped
  list. Goldens `__fixtures__/summary-text-{en,zh-CN,zh-HK}.txt` from the
  summary golden snapshot; generator `scripts/rust-summary-text-golden.mts`
  in `pnpm rust:fixtures`.
- Tests: three goldens, no `comment`/`email`/`token` substring, length cap.
- Commit: `feat(core): plain-text summary render with goldens`.

### B7 Rust render service (ADR 0029 decision 2)

- `backend/crates/taff-render/` (after PR #84 lands; if it has not, create
  the `backend/` workspace with the same `Cargo.toml` shape and
  `rust-toolchain.toml` 1.97 so PR #84 rebases onto it): `axum`, `tokio`,
  `serde`, `resvg`, `usvg`, `tiny-skia`, `fontdb`, `image` (png encode);
  all MIT/Apache-2.0, named in the commit. `POST /render/summary` validates
  the body against `packages/schemas/generated/daily-summary.json` (emit it
  with the `schema:gen` step from the migration guide §3; if that step is
  not yet there, add it for this one schema). Layout: 1080 px, 48 px
  margins, title, org, date, per-project card (stage, lead, due, progress
  bar, risk badge, counts row, up to 20 items per list), totals, watermark
  layer (repeated diagonal text, 12% opacity), footer with recipient,
  generation time in the recipient's zone (formatted by the caller and
  passed in, Rust never formats dates), hash.
- Fonts: `scripts/ui/subset-fonts.py` gains a `--ttf` output for
  `backend/fonts/` (Noto Sans SC, TC, Manrope; glyph set = the web subsets'
  union); licence files beside them.
- Tests: `cargo test` renders the three locale goldens and compares a
  perceptual hash (`image_hasher`, MIT) within a tolerance; a size test
  (< 400 KB); schema rejection test. `pnpm rust:gate` runs them.
- `deploy/Dockerfile.render` (two-stage, distroless or alpine, non-root,
  port 3002), Compose service `render` in `compose.yaml`, `compose.prod.yaml`
  and `compose.apuch.yaml`, `SUMMARY_RENDER_URL=http://render:3002` in
  `.env.example` and `.env.production.example`; no Caddy route.
- Commit: `feat(render): Rust summary image service (ADR 0029)`.

### B8 Renders stored and generated

- Migration `0041_summary_renders.sql` per ADR 0029 decision 3; Drizzle;
  schemas `summaryRenderSchema`.
- `packages/core/src/summaries.ts`: `storeSummaryRender`, `getSummaryRender`
  (`summary:read`), idempotent on `(summaryId, format)`.
- `apps/worker/src/summaries.ts`: after `daily-summary` succeeds enqueue
  `summary-render` (stable id `summaryId\0txt` and `\0png`); txt renders in
  process; png posts to `SUMMARY_RENDER_URL` with a 10 s timeout; failure →
  activity `summary.render_failed` and the daily `summary-scan` re-enqueues
  missing renders for the last 7 days.
- Tests: worker processor with a fake queue and a fake render server;
  integration: both renders exist after generation; immutable.
- Commit: `feat(worker): text and image renders for every summary`.

### B9 Delivery: REST, public page, web

- `GET /api/summaries/:id/render?format=txt|png` (`summary:read`,
  `Content-Disposition: attachment`); `POST /api/shared-summary` body gains
  `format?: 'json'|'txt'|'png'` with the same 404 and rate limits; `/s/[token]`
  and `/summaries/[id]` gain "Copy text" and "Save image". Strings in three
  locales.
- Tests: `summaries.test.ts` (formats, 404 parity, token never logged),
  `e2e/summaries.spec.ts` extended (copy text, save image downloads a PNG).
- Commit: `feat(api,web): summary text and image delivery`.

### B10 Agent summary reads over MCP (ADR 0029 decisions 4 and 5)

- Scope `summaries:read` in `packages/schemas/src/primitives.ts`; token
  issue and grant forms offer it (admin only); migration CHECK if any.
- `permissions.ts`: `summary:read` for an agent actor when
  `actor.scopes` includes `summaries:read` and the resource workspace is the
  resolved one; share, preview, audience stay denied.
- MCP tools in `apps/api/src/mcp-summaries.ts`: `summaries.list
  {workspaceId?, tagId?, recipientId?}`, `summaries.get {summaryId, format:
  'json'|'txt'}`, `summaries.image {summaryId}` → image content block
  (`type: image, mimeType: image/png, data: base64`). Registered in
  `MCP_TOOL_ARGS`; count 37; `pnpm mcp:smoke` and the round-trip fixture
  updated.
- Tests: permission rows (agent with and without the scope, after grant
  revoke), MCP unit tests, matrix.
- Commit: `feat(mcp): read-only summary tools for agents with summaries:read`.

### B11 Spec, CHANGELOG backfill, release

- `docs/spec/daily-summary.md`: DS-8 renders (8.1 both formats per summary,
  8.2 watermark and hash in both, 8.3 size caps, 8.4 immutability, 8.5
  retry), DS-9 agent reads (scope, denied operations); roles table gains
  the agent row for reads; acceptance rows. `docs/spec/access-matrix.md`.
- CHANGELOG entries for v0.2.15 and v0.2.16 from milestones 37 and 82.
- Versions 0.2.19; `docs/deploy.md` candidate (migration 0041, new image
  `taff-render`, new env var `SUMMARY_RENDER_URL`, closeout image list grows
  to four); live acceptance without writes; milestone ≤ 40 lines.

## Twin side (fenshen01), for that repository's plan

Not executed from taff01. Recorded so the owner can paste it into
fenshen01's upgrade plan; file names verified at `0327f47`.

- T1 Connection whitelist for `https://taff.apuch.cn/mcp` gains
  `workspaces.list`, `summaries.list`, `summaries.get`, `summaries.image`
  (super administrator, `tool_servers.allowed_tools`).
- T2 `src/twin/notifications/sources.py`: `source_kind` gains
  `taff_summaries`; `profiles.py` a `taff_summary_profile(connection_id,
  workspace_id, timezone)`; `mcp_source.py`: for that kind call
  `context.get {workspaceId}` and check the recipient's zone, then
  `summaries.list {workspaceId}` and `summaries.get {format: 'txt'}` plus
  `summaries.image`; return items with `text` and `image_png` fields.
- T3 Delivery: the notifications process sends the text bubble then the
  image bubble through the existing outbox and `media.py` (image stored and
  served from `/media/out/{name}`); one delivery per summary id (unique key
  on the delivery row); the summary's watermark names the recipient, so the
  destination must be that recipient's own chat or an authorized group.
- T4 The model path: `remote.py` passes `workspaceId` from the Twin
  organization ↔ Taff workspace mapping (a new column on `orgs` or a
  mapping table), defaulting to the token's home workspace.

## Validation before every push

`pnpm lint && pnpm typecheck && pnpm licence:check && pnpm test && pnpm build && pnpm build:server && pnpm perf:budget && pnpm e2e && pnpm mcp:smoke`;
once `backend/` exists `pnpm rust:gate`; for a release
`release:stack --migrate --seed --worker` then `release:checklist`, and the
image builds including `deploy/Dockerfile.render`.
