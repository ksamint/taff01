# v0.2.24–v0.2.25 — view exports, audit, agent images and GUI gaps

Status: E1 and Phase 1 (A1/A3/A2/E2/A4/E3) are deployed in v0.2.24
`ff411c6` ([milestone 124](milestones/124-v0.2.24.md)). Phase 2 remains open.
Owner-approved 2026-11-13 ("yes for all"; ADR 0031 amendment 1).
The current goal is the user's latest command; owner checks run after unlock.

## How to work this plan

- One task = one branch from the latest `main`, one PR, in the order below.
  Smallest first; do not batch tasks. Each PR carries its tests, its spec
  change (same commit as the behaviour, `module-spec` skill) and, for a
  decision not already in an ADR, an ADR. Merge yourself once the local gate
  passes on the PR head (AGENTS.md, ADR-0000); no CI, no runners.
- Local gate: [release closeout check 1](release-closeout.md). Bind the PR
  body's commands and counts to `git rev-parse HEAD^{tree}`.
- Milestone (≤ 40 lines) in `docs/milestones/` after each phase, or after a
  task that changes access. Push, then continue with the next task.
- Rust/TS targets are named per task. New source is TypeScript or Rust only.

### Known traps (each cost a gate run in milestone 117)

- `pnpm db:seed` after a fresh database, before `pnpm e2e`; ~140 specs sign in
  as the demo account and fail on the signed-out landing page otherwise.
- A new REST route needs a row in `packages/core/src/authorization.integration.test.ts`
  (the matrix test lists every route); use `allowedStatus` when an allowed
  caller cannot reach 200 without a service.
- A new permission action needs the Rust twin in
  `backend/crates/taff-domain/src/permissions.rs`, then `pnpm rust:fixtures`,
  `node node_modules/tsx/dist/cli.mjs scripts/permissions-matrix.mts`.
- e2e specs must read messages as `messages[locale].ns.key`; an alias such as
  `const m = messages[locale].ns` breaks the test-id contract scanner. Rerun
  `scripts/test-id-contract.mts` after adding test ids.
- `pnpm release:checklist` needs `RELEASE_MAIL_LOG=<stack>/.taff-mail/messages.jsonl`
  to run the role and owner change steps.
- New CJK UI strings must use glyphs already in the web font subsets
  (`scripts/ui/fonts.test.ts`); images are drawn with the server fonts.

## Phase 1 — v0.2.24 (GUI gaps, audit, agents, archive)

### A1 Desktop link to `/summaries` (DS-5.2)
- TS: `apps/web/src/components/me-desktop.tsx` Settings tab gets the same
  "Shareholder summaries" row as phone Me (`me-view.tsx:543`); add it to the
  ⌘K settings shortcuts (`search-dialog.tsx`). No new strings.
- Test: `e2e/summaries.spec.ts` adds a desktop-viewport case where a linked
  recipient reaches `/summaries` from Me and from ⌘K, three locales.

### A3 Task title in pending requests (AM-1.7)
- TS: `access-matrix.tsx` `PendingGrants` shows `taskReference(key, number)`
  and the title with a link to the task, as `agent-profile-view.tsx:178`
  does; a task the viewer cannot read keeps the raw reference with a new
  localized fallback label in three locales.
- Test: extend `e2e/access.spec.ts` pending-request case; spec AM-1.7 wording.

### A2 Project due date and delivery progress
- TS: the project dialog (`projects-scene.tsx`) edits `dueAt` (date in the
  viewer's zone) and `deliveryProgress` (0–100 integer) through the existing
  versioned `PATCH /api/projects/:id`; the project meta line shows both.
  Lowest role: admin (`project:manage`); a project lead without admin sees,
  cannot edit. Optimistic with rollback, like stage.
- Spec: new `docs/spec/projects.md` (PR-1 profile fields, PR-2 roles).
- Tests: e2e three locales (set, see it in the export image text via
  `X-Taff-Content-Hash` change, reload persists); stale version → conflict
  toast; member cannot see the editor.

### E2 Export audit rows (ADR 0031 amendment 1.1)
- TS core: `exportViewImageInput` inserts one `activity` row
  `view.export` (`resourceId` = project or workspace id; details allowlist:
  `scope`, `locale`, `contentHash`, `projectCount`, `finance`, `channel`) in
  its own transaction with `taff.actor_id`; no `pg_notify`. Refusals write
  nothing.
- TS web: `/orgs/audit` labels the action in three locales.
- Spec: VE-1.8 and an AU line that exports appear; tests: core integration
  (row per export, none on refusal, details allowlist, audit search returns
  it), `e2e/audit.spec.ts` sees the row after an export.

### A4 Workspace archive and restore (ADR 0031 amendment 1.4)
- TS core: `restoreWorkspace(p, id)` in `workspace-lifecycle.ts`, same
  `workspace:archive` rule and advisory lock as archive; does not restore
  anyone's default workspace. List my archived workspaces for their admins.
- TS API: `POST /api/workspaces/:id/restore`; matrix rows for both routes.
- TS web: Organizations → admin-only "Archive organization" with a dialog that
  requires typing the organization name and lists what members lose;
  "Archived organizations" section with Restore for their admins; system
  admins restore from `/admin`. Personal workspaces show no archive control.
- Access-change rule (AGENTS.md): test archive, restore, list with the lowest
  role (workspace admin), with member, guest, agent and outsider refused, and
  again after the admin is demoted; system admin can do both; archive clears
  defaults; restore re-enables reads for existing members only.
- Spec: new `docs/spec/workspaces.md`; e2e three locales.

### E3 Agent `views.image` MCP tool (ADR 0031 amendment 1.2)
- TS core: `view:export` allows an agent when its effective workspace grant
  carries `tasks:read` and `summaries:read`; Rust twin updated. The
  watermark, audit row (`channel: "mcp"`) and file name use the agent's name.
- TS API: tool `views.image` `{workspaceId?, projectId?, locale?}` (locale
  defaults to the token issuer's) in `mcp-summaries.ts` or a new
  `mcp-views.ts`; read-only annotation; shares one `renderViewImage` helper
  with the REST route (10 s timeout, 10 per member per minute); 503/502 map
  to MCP tool errors. Tool count 38: update `mcp-tools.json` fixture,
  `implicitWorkspaceTools`, `mcp:smoke`, the MCP page list and README counts.
- Access-change tests, lowest role first: token with both scopes allowed;
  missing either scope refused; after the grant is revoked, after token
  revoke, after OAuth refresh with narrowed scopes, and in another workspace,
  refused. Finance only with the agent `finance:read` rule.
- Spec: VE-2.3 and DS-9 note; `e2e/mcp.spec.ts` and `mcp:smoke` cover it.

### Release v0.2.24
Per [release closeout](release-closeout.md). Deployment delta: API gets
`SUMMARY_RENDER_URL=http://render:3002`; one additive restore route; MCP 38
tools; additive nullable OAuth refresh-scope migration 0043 (44 journal entries). Rollback: v0.2.23 `4a751a9`. Owner checks
([owner checks](owner-checks.md)) 1–3 run after unlock; add 4: Twin posts one
`views.image` to a test chat.

## Phase 2 — v0.2.25 (screen exports drawn on the server)

Shared shape for S1–S3: a pure TS builder in `packages/schemas` (display-ready
strings, positions in layout units) emitted as JSON Schema by
`pnpm schema:gen`; a Rust module in `backend/crates/taff-render/src/`
(`timeline.rs`, `calendar.rs`, `graph.rs`) behind `POST /render/<kind>`;
golden PNGs per locale compared by perceptual hash in `tests/render.rs`;
renderer versions `timeline-1`, `calendar-1`, `graph-1`. The REST query gains
`view=overview|project|timeline|calendar|mind|relations` (default keeps E1);
`ViewExportButton` takes a `view` prop and appears in that view's header.
Width 1600 px landscape for timeline and calendar, 1080 px for graphs; height
cap 4,000 px; ≤ 400 KB palette PNG; watermark, hash and E2 audit as E1.

- **S1 Timeline chart** from `getTimeline` (bars, milestones, dependencies,
  today line, slip). Cap 60 rows with "+N more".
- **S2 Calendar** week and month for the viewer from `listCalendar`, in their
  zone; all-day row; cap 8 items per day cell with "+N more".
- **S3 Mind and relations** from `getMindMap` and the relations graph; move
  the pure layout in `apps/web/src/lib/graph-layout.ts` to `packages/schemas`
  so web and image place nodes identically. Cap 150 nodes.

Each S task: spec additions to `view-export.md` (VE-4..6), e2e three locales,
API matrix rows, `pnpm rust:gate` goldens. Release v0.2.25 per closeout;
deploy all four application images: TypeScript contracts, core, API and web
change alongside the Rust renderer.

## Done when

Every task above is merged with its gate evidence, v0.2.24 and v0.2.25 are
deployed and closed out, and `docs/spec/view-export.md`, `projects.md` and
`workspaces.md` list no planned item as current.
