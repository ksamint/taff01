# Agent goal: organization-wide Twin access, access matrix, completion of open work, Rust phase 0

> Status 2026-11-05: written from the review in
> `docs/milestones/93-access-and-completion-plan.md`. Design for the access
> change: [ADR 0028](adr/0028-organization-wide-agent-grants.md) (proposed
> defaults; build on them unless redirected). Nothing below is implemented.
> This goal sequences the next three releases and moves the JavaScript-to-
> TypeScript goal (`agent-goal-js-to-ts.md`) to v0.2.20. The task-level plan
> for v0.2.18 and v0.2.19 is `agent-goal-access-matrix-and-renders.md`.

Paste everything below this line as the goal.

---

Work in `ksamint/taff01` on branches from `main`. Read first: `AGENTS.md`,
`instruction_v0.md`, `docs/spec/daily-summary.md` (the spec format every
module gets), ADR 0022, 0023, 0027, 0028, PR #81's branch (its milestone
`docs/milestones/82-mcp-multi-workspace.md`), PR #84's branch (ADR 0026,
`docs/rust-migration-guide.md`, the 2026-11-01 review), `docs/release-closeout.md`.

Standing rules: `packages/core` is the only database code; one Zod shape per
body; `can()` for every rule with table-driven rows; one transaction, one
`activity` row and `NOTIFY` per mutation; three locales per commit; Today
≤ 200 KiB; no CI, no runners (local gate before every push); conventional
commits; licence per new dependency; never commit secrets; the AGENTS.md
access-change rule for every grant operation; a module spec in `docs/spec/`
changes in the same commit as the behaviour.

## 1. Review: Rust and TypeScript, where we are and how to proceed

What exists on `main` (ed84cab): all TypeScript. The Rust decision (ADR 0026)
and the executable guide (`docs/rust-migration-guide.md`) exist only on PR
#84, open since 2026-11-01 (37 files, +8,872). Its review approved the
direction and asked for five fixes; the head addresses two (recurrence golden
shape, tool schemas derived from `MCP_TOOL_ARGS`). Still unconfirmed: the
`normalize_rrule` divergences, `canonical_json` number formatting (feeds
receipt HMACs), the contradicting plan documents and the duplicated line in
`instruction_v0.md`, plus twelve follow-ups (licence allow-list, permissions
parity breadth, crate split, toolchain pin). PR #84 also edits
`.github/workflows/ci.yml`, which `main` deleted, and its permissions golden
predates the six summary actions of ADR 0027.

The target architecture is already decided and sound: Zod stays the single
wire contract and emits JSON Schema; the web client stays TypeScript; domain
logic, adapters and the worker move to Rust module by module behind the
same PostgreSQL schema, each with a Node-generated golden and a parity test;
`packages/core` stays the authority until a module's cutover. The only
decision this goal adds: **the Rust gate is local**, as every gate is now.
`docs/release-closeout.md` check 1 already names `cargo fmt --check`,
`cargo clippy --all-targets -- -D warnings` and `cargo test --locked` once
`backend/` exists; add `cargo deny check licenses` and the fixture
regeneration diff to that line when PR #84 lands.

How to proceed, in order, without blocking the feature work below:

1. **Rebase PR #84 onto `main`** (milestone E below): drop the workflow
   file, keep the `instruction_v0.md` stack change without the duplicated
   sentence, regenerate the permissions golden (ADR 0027's six actions and
   ADR 0028's three), add `pnpm rust:gate` to `package.json` running fmt,
   clippy, test, deny and `pnpm rust:fixtures && git diff --exit-code`.
   Fix review items 2, 3 and 5. Merge. No runtime change; no release.
2. **Phase 1 of the guide** (crate split, `rust-toolchain.toml`,
   `deny.toml`, Postgres read models) as its own milestone, still no
   runtime change.
3. **New backend logic keeps landing in TypeScript as pure functions with
   goldens** (ADR 0026 constraint 3; `buildDailySummary` already has one).
   ADR 0028's enrollment and the access matrix read (milestones A and B)
   follow the same rule, so they port later without redesign.
4. Phases 2 to 5 of the guide follow after v0.2.20, one module per
   milestone, cutover only when the shadow run reports zero mismatches.

## 2. Release sequence

| Release | Content | Milestones |
| --- | --- | --- |
| v0.2.17 | shareholder summaries, merged, awaiting the operator's deploy and closeout | 85–89 (done) |
| v0.2.18 | PR #81 landed; ADR 0028 organization-wide grants; MCP API update; Twin enrolled in every organization; `Cache-Control: private` fix | A |
| v0.2.19 | access matrix in the admin area (workspace admins and system administrators); summary text and image renders with a Rust render service and agent read tools (ADR 0029); CHANGELOG backfill | B, task cards in `agent-goal-access-matrix-and-renders.md` |
| v0.2.20 | JavaScript-to-TypeScript (T0–T3 of `agent-goal-js-to-ts.md`); small open items C1–C6 | C |
| no release | PR #82 hardening rebased and merged on its own evidence; Rust phase 0 and 1 | D, E |

Every release follows `docs/release-closeout.md`: candidate checkpoint in
`docs/deploy.md`, full local gate with counts, milestone ≤ 40 lines, tag,
closeout by the operator.

## A — v0.2.18: organization-wide grants for Twin (fenshen01)

Twin today: one `tool_servers` row holding one Taff personal token for
`https://taff.apuch.cn/mcp`, a tool whitelist, and a `mcp_source` profile
check that reads `context.get`. On `main` that token reaches one workspace
(侍天TIANSIGHT). PR #81 gives tokens explicit per-organization grants and a
`workspaceId` on every tool; ADR 0028 makes "every organization, including
future ones" a system-administrator policy on the token.

1. **Land PR #81.** Rebase on `main`; renumber its migration 0038 → 0039
   (0038 is the summaries); regenerate `meta/_journal.json`; drop the
   `TAFF_FULL_CI_ENABLED` wording from its milestone and the resync notes;
   run `pnpm test` (expect its 1,844 plus the summary tests), the
   authorization matrix, `pnpm mcp:smoke` (34 tools) and the three-locale
   grant-form browser check it lists as pending. Merge with its milestone
   renumbered to the next free number. Do not land PR #82 in this step.
2. **ADR 0028 schema** (migration 0040, additive): `agent_tokens
   .organization_policy` and `agent_token_workspaces.origin`
   (`'manual' | 'policy'`), both with CHECKs and defaults; audit trigger
   already covers the table.
3. **Core.** `setTokenOrganizationPolicy(principal, tokenId, policy)`
   (system administrator; enroll or revoke-policy-grants in one transaction
   with one activity row per affected workspace), `enrollPolicyTokens(tx,
   workspaceId)` called from `createWorkspace` for organizations beside the
   default agent (milestone 37), `restoreTokenWorkspaceGrant`, and
   `listTokenWorkspaces` extended with `origin`. Pure helper
   `planPolicyEnrollment(token, workspaces, existingGrants)` returning the
   rows to insert and revoke, with a golden file for the Rust port.
4. **Permissions.** `token:policy`, `token:grant`, `token:grant_revoke`
   rows for admin, member, guest, system administrator, agent, outsider, and
   after demotion; AGENTS.md access-change list: set policy, enroll on
   create, list, revoke one, restore one, revert policy, archive and
   unarchive; each tested with the lowest reaching role and after it loses
   authority (`authorization.integration.test.ts`).
5. **MCP API update.** With PR #81: `workspaceId` on every tool,
   `workspaces.list` returning `{workspaceId, name, kind, scopes, origin}`,
   `context.get(workspaceId)`; add `kind` and `organizationPolicy` to the
   token DTO; the MCP round-trip fixture gains `projects.create`/`edit`
   (closes the pre-existing unit failure, R4) and `workspaces.list`. Tool
   count 34; `pnpm mcp:smoke` green. Rate limit stays per token.
6. **REST.** `PUT /api/agent-tokens/:id/organization-policy` (system
   administrator), `POST /api/agent-token-workspaces/:id/restore`, and
   `GET /api/admin/agent-tokens?policy=all_organizations`. All through the
   shared schemas; route tests mirror `summaries.test.ts`.
7. **Web.** On `/me/mcp` (admin token card): the grant list shows origin;
   system administrators see the policy switch with a confirm step that
   names the organizations it will enroll. Three locales.
8. **`Cache-Control: private`** on authenticated SSR HTML (R12), its own
   commit, `ssr-session.spec.ts` green in three locales.
9. **Spec** `docs/spec/agent-access.md` (tokens, grants, policy, OAuth
   roles) written with the module-spec skill in the same commits.
10. **Production enrollment** is the operator's step after closeout: set
    the policy on Twin's existing token with the management API (no token
    rotation), then on the Twin side add `workspaces.list` to the connection
    whitelist and confirm `mcp_source` reads `context.get` per workspace.
    Twin's own change belongs to fenshen01's plan; record it there.

## B — v0.2.19: access management matrix in the admin area

There is no admin dashboard today: `apps/web/app` has `orgs/` and
`orgs/summaries/` only, and milestone 36 recorded "no frontend permission
center". The data exists: members and roles, agent capabilities and review
policies, token grants, OAuth grants, `explainIntegrationPermission`, and the
`can()` table.

1. **Core read** `getAccessMatrix(principal, workspaceId)` (admin) returning
   one DTO: `people[] {memberId, name, role}`, `agents[] {memberId, name,
   reviewPolicy, supervisor, capabilities[] {capability, decision}}`,
   `tokens[] {tokenId, name, agent, scopes, grants[] {workspaceId, name,
   scopes, origin, revokedAt}}`, `oauthGrants[]`, `pendingGrants[]`, and
   `actions[]`: the `can()` matrix for admin, member, guest and agent on this
   workspace generated from the same table the tests use (export the rows,
   do not hand-write them). System administrators get
   `getSystemAccessMatrix()`: every organization × tokens with policy and
   grant state. Both read-only; mutations reuse existing operations.
2. **REST** `GET /api/workspaces/:id/access-matrix`,
   `GET /api/admin/access-matrix`. Thin.
3. **Web** `/orgs/access` (link from Organizations beside "Summaries"), lazy
   route, outside Today's budget: four tabs People, Agents, Tokens, Apps,
   each a matrix with the row's existing controls (role select, capability
   allow/ask/deny, review policy, grant revoke/restore, OAuth revoke), a
   confirm step on every revoke, an Undo toast where the inverse exists, and
   an "Explain" drawer per token showing `explainIntegrationPermission`.
   `/admin/access` for system administrators: organizations × tokens, policy
   switch, enroll state, archived organizations greyed. Phone layout: one
   matrix per screen with horizontal scroll inside the card.
4. **Tests.** Core read with fixtures (every role present), REST matrix in
   the authorization test, `e2e/access.spec.ts` in three locales (admin sees
   and changes; member sees 403 page; agent token sees 401), visual
   baselines captured locally per `docs/ui/README.md`.
5. **Docs.** Generate `docs/spec/permissions-matrix.md` from the exported
   `can()` rows (the readable matrix recommended in milestone 92) and link
   it from the access page's help text; spec `docs/spec/access-matrix.md`.
6. **CHANGELOG backfill** for v0.2.15 and v0.2.16 from milestones 37 and 82
   (R3), in this release's docs commit.

## C — v0.2.20: TypeScript-only sources and small open items

T0–T3 of `agent-goal-js-to-ts.md` unchanged, plus, each its own commit:

- C1 Phone zh-HK Projects `new-project` absent after a filter click
  (`projects-scene.tsx:677`, R22).
- C2 Overlapping optimistic rollback erases a pending edit
  (`optimistic-m3.ts:38`, R23).
- C3 OAuth consent "no agent" guidance links to organization management,
  preserving the OAuth request (R43); desktop Me lazy panels show progress
  (R44).
- C4 Brief `load` intent (R32), rules-based like the others.
- C5 Second root layout for public pages so `/s/[token]` meets 50 KiB (R6),
  only if the owner confirms the `(app)` route-group move; otherwise record
  the decision and keep the number.
- C6 Visual baselines for the summary and access screens (R5), local Linux
  capture.

## D — PR #82 hardening (no release of its own)

Rebase on `main` after A (migration 0041), re-run its 1,872 tests, the MCP
refresh-family smoke and the three-locale browser checks it lists as pending;
merge when its own evidence is complete. Its Valkey `noeviction` and bounded
shutdown ship with the next release's images.

## E — Rust phase 0 and 1 (no runtime change)

As in section 1: rebase PR #84, fix review items 2, 3 and 5, local
`pnpm rust:gate`, regenerate goldens including `buildDailySummary`,
`planPolicyEnrollment` and the permissions rows; then the crate split and
Postgres read models. Milestone per step; closeout line in
`release-closeout.md` check 1 updated when `backend/` lands.

## Not planned here (owner decisions, waiting on upstream, or other repos)

AI provider and consent (R27); CRM hard delete (R28); value chain and Neo4j
(R29); badge colours (R30); SMS OTP live exercise (R31); summary phase 2
(PDF, e-mail, MCP read tools, weekly roll-up; R7); Inbox row CHECK change
(R8); PostgreSQL 19, TypeScript 7.1, Drizzle 1.0, ioredis 6 (R34, R35);
Claude.ai connector live check (R20); Master voice acceptance (R19); Twin
receipt tests needing a live executor (R18); backup retention drills (R26);
CIMD (R41); Twin's own daily summary design (fenshen01 PR #12) stays a chat
summary and is not merged with ADR 0027.

## Validation before every push

`pnpm lint && pnpm typecheck && pnpm licence:check && pnpm test && pnpm build && pnpm build:server && pnpm perf:budget && pnpm e2e && pnpm mcp:smoke`,
and for a release `release:stack --migrate --seed --worker` then
`release:checklist`; once `backend/` exists, `pnpm rust:gate`.
