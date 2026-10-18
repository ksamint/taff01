# Agent goal: project pipeline — person in charge moves the stage, Brief shows stage and filters by it

> Status 2026-10-18: written after review of `2b8f6ff` (project stage, person
> in charge, finance for every person; ADR 0021, milestone 28) on branch
> `claude/fervent-archimedes-7n3rb0`. The owner decided the two open questions
> of ADR 0021: the person in charge may change the stage, and the Brief shows
> stage and person in charge with a stage filter.

Paste everything below this line as the goal.

---

Work in `ksamint/taff01` on a branch from `claude/fervent-archimedes-7n3rb0`
(or from `main` once that branch is merged). Read first: `AGENTS.md`,
`instruction_v0.md`, `docs/adr/0021-project-stage-lead-and-shared-finance.md`,
`docs/milestones/28-project-stage-lead.md`, and the commit `2b8f6ff`, which
is the pattern to follow: one shared Zod schema, core-only data access,
`can()` for every rule, three locales, tests with the code.

## What exists

- `projects.stage` (`project_stage` enum: `lead`, `proposal_sent`,
  `contract_signed`, `in_service`, `closed`; nullable) and `projects.lead_id`
  (a person member of the workspace; core `requireLead` in
  `packages/core/src/planning.ts` plus trigger `projects_lead_person` from
  migration 0031).
- `PATCH /api/projects/:id` with the project version sets both; today it
  requires `project:manage` (admins). The project dialog in
  `apps/web/src/components/projects-scene.tsx` edits them, and the header
  shows them (`project-meta`, `project-stage`, `project-lead`).
- `finance:read` covers every non-guest person; agents never read finance.
- MCP `projects.list` returns `stage` and `leadId`.

## Build

1. **The person in charge moves the stage.**
   - Add `"project:stage"` to `Action` in `packages/core/src/permissions.ts`:
     a non-guest person who is an admin, or whose member id equals
     `resource.leadId`. Agents: never (stage changes stay a human act, as
     with all project administration). Put `leadId?: string | null` on
     `Resource`. Add table-driven rows to `permissions.test.ts`: admin yes,
     person in charge yes, other member no, guest in charge no, agent no,
     other workspace no.
   - In `updateProject`, a body that changes only `stage` (plus `version`)
     requires `project:stage` with the row's `leadId`; any other field still
     requires `project:manage`. The person in charge cannot reassign the
     person in charge, rename, archive or touch finance.
   - The person in charge must be a non-guest person: extend `requireLead`
     to reject `role = 'guest'` (`invalid_input`). Keep the trigger as is
     (role can change later; a demoted person in charge simply loses the
     right to move the stage).
   - Web: the person in charge (not admin) sees the header stage as a
     control. Show it when `canManageProjects` or
     (`selected.leadId === workspace.memberId` and
     `workspaceAccess.data?.canEditPlan`). Use a native `<select>` styled as
     the existing `.projects-stage` chip (test id `project-stage-control`),
     optimistic through `useManageProject` with rollback and a toast with
     Undo like the board status move. Admins keep the dialog too. The
     person-in-charge picker in the dialog lists admins and members only,
     not guests.
   - Activity is written by the existing audit trigger; check one row per
     change in the integration test.

2. **Brief shows stage and person in charge, and filters by stage.**
   - `briefProjectSchema` in `packages/schemas/src/assistant.ts` gains
     `stage` (nullable `projectStageSchema`) and `leadId` (nullable id).
     Fill them where the brief source loads projects
     (`packages/core/src/assistant.ts`, the `projects` select) and in
     `buildBrief` (`packages/core/src/brief.ts`). Brief and timeline risk
     must stay equal by construction; do not change the sort.
   - `RiskRow` in `apps/web/src/components/brief-view.tsx`: show the stage
     chip and "In charge: name" (reuse `projects.stages.*` and
     `projects.leadIs`; resolve the name through `labels.member`, add
     persons to the brief labels if they are missing). Render nothing extra
     when both are null, so seeded screens without stages do not change.
   - Above the list, a stage filter: chips `All` plus each stage that at
     least one listed project has, with counts (`role="group"`,
     `aria-pressed`, ≥44 px targets, test ids `brief-stage-all` and
     `brief-stage-<stage>`). Hide the filter when no project has a stage.
     The portfolio totals (`portfolioTotals` in `apps/web/src/lib/brief-model.ts`)
     follow the filter; add a unit test for that in `brief-model.test.ts`.
   - Project switcher sheet in `projects-scene.tsx`: group the options with
     `<optgroup>` by stage in pipeline order, then "No stage".
   - MCP `brief.get` now carries `stage` and `leadId`; extend the
     `brief.get` check in `apps/api/scripts/mcp-round-trip.ts` and keep
     finance null for agents. Update the `projects.list` / `brief.get`
     tool descriptions in `apps/api/src/mcp.ts` if they name fields.

3. **Close the review gaps from `2b8f6ff`.**
   - CI never ran on that branch: `.github/workflows/ci.yml` runs on push
     only for listed branches and otherwise on `pull_request`. Open a PR
     (template if present) so the checks, browser and visual jobs run, and
     drive it to green.
   - Visual baselines were only compared on a mismatched local Chromium
     (text anti-aliasing diffs, no layout change). Confirm on CI. If this
     goal changes any captured screen (for example by seeding stages),
     re-capture with the `visual-baselines.yml` workflow on the reviewed
     commit and commit the PNGs; never hand-edit them.
   - Drizzle snapshots stop at 0029 (0030 and 0031 are hand-written). Do
     not run `pnpm db:generate`; if a migration is needed, hand-write
     `0032_*.sql` and its `_journal.json` entry the same way.

## Rules

- Strings in `apps/web/locales/{en,zh-CN,zh-HK}/common.json` in the same
  commit. `scripts/ui/fonts.test.ts` fails on CJK glyphs outside the bundled
  subset (it rejected 指 and 簽 last time); pick covered characters rather
  than adding font ranges.
- After adding test ids, run
  `node node_modules/tsx/dist/cli.mjs scripts/test-id-contract.mts` and commit
  `e2e/support/test-id-contract.md`.
- Browser test in all three locales (extend `e2e/project-profile.spec.ts`):
  an admin makes a member the person in charge; the member, signed in in a
  second context, moves the stage from the header and sees it persist; a
  second member gets no control and a 403 from the API; the Brief shows the
  stage and person in charge, and the stage filter narrows the rows and the
  totals.
- Amend ADR 0021 (decision and consequences, "open" items resolved) rather
  than writing a new ADR, unless the design departs from it.
- Conventional commits, one logical change each, no model names in commits.
  No new dependencies.

## Validation (paste the numbers into the milestone report)

```sh
pnpm lint && pnpm typecheck && pnpm licence:check
pnpm db:migrate && pnpm db:seed && pnpm test
pnpm build && pnpm build:server && pnpm perf:budget   # Today ≤ 200 KiB
pnpm mcp:smoke                                          # against the running API
pnpm e2e e2e/project-profile.spec.ts e2e/finance-visibility.spec.ts e2e/brief.spec.ts e2e/planning.spec.ts
```

In a sandbox whose preinstalled Chromium does not match Playwright 1.64
(build 1248), run Playwright through a temporary config that spreads
`playwright.config.ts` and sets
`use.launchOptions.executablePath` to the local Chromium; never download
browsers there and never commit that config. Pixel comparisons are only
valid on CI.

Finish with `docs/milestones/29-project-pipeline.md` (≤ 40 lines: working,
missing, open decisions, validation numbers), a CHANGELOG entry under
Unreleased, the PR link, and a green CI run on the PR head.
