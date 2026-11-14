# v0.2.26 — XIDING organization, operation template setup, live checks, hygiene

Status: open. Production is v0.2.25 `e5a42c5` ([milestone 128](milestones/128-v0.2.25.md)).
The current goal is the user's latest command. Previous plan, finished:
[v0.2.24–v0.2.25](agent-goal-v0.2.24-view-export-and-alignment.md).

## Owner decisions

- 2026-11-14: "create xiding workspace, and set up using generic operation
  template, check gui and mcp ensure all works". This authorizes X1–X3 below
  as production writes, within the limits stated there.
- 2026-11-13 "yes for all" (ADR 0031 amendment 1) and the Claude.ai check
  "Run that check later without the lock" remain in force.

## How to work this plan

Same rules as the previous plan: one task per branch and PR from the latest
`main`, the local gate of [release closeout check 1](release-closeout.md) on
the PR head, merge on green, milestone ≤ 40 lines, TypeScript or Rust only,
no CI or runners. Known traps: see the previous plan's list (seed before
e2e, matrix rows, Rust permission twin, message-key aliases, mail log).
Print one `STATUS:` line per task and `NEEDS-DECISION:` for owner items.

## Phase X — XIDING in production (no release; operator machine)

### X1 Create organization XIDING
- How: the accepted pattern of the Twin activations in `docs/deploy.md`
  (v0.2.18 and v0.2.19 checkpoints): a private fixed-target helper calls the
  accepted v0.2.25 core `createWorkspace({ name: "XIDING" })` on behalf of the
  exact email-bound existing system administrator who owns 侍天TIANSIGHT and
  APUCH. First rehearse the helper against a fresh isolated local database
  (positive case; a non-system-admin and a demoted admin refused; a second run
  creates nothing). Never direct SQL, promotion, password reset, session mint
  or token issue. Remove the helper afterwards; record its source hash and
  audit row ids in `xiding-activation.json` beside the v0.2.25 receipt.
- Idempotent: if an active organization named XIDING exists, create nothing
  and continue with X2.
- What core does by itself (`planning.ts` `createWorkspace`): the actor
  becomes admin, one default agent is added, and existing all-organization
  policy tokens are enrolled (ADR 0028). Twin therefore gains XIDING with its
  existing scopes; this is the designed access change, recorded, not undone.
- Acceptance: XIDING active beside Table AI, 侍天TIANSIGHT and APUCH; the
  acting system admin is admin; each system admin's protected admin
  membership as the core provides it (record what exists, change nothing);
  one default agent; zero tokens issued; Twin's token version, hash and
  scopes unchanged, its XIDING enrollment listed.

### X2 Set up the generic operation template in XIDING
- The template is a view over tagged tasks (spec OT-1); "set up" means the
  data that makes every sector visible. On behalf of the same admin, through
  the normal core project and task operations in the same helper run:
  1. Project `營運設置 Operation setup` (stage none, no finance).
  2. Six tasks in it, one per sector in template order, owner = that admin,
     no worker, no due date, labels = exactly the sector label, title
     `設定指標目標 · <label>` and description
     `領先指標：<leading>\n結果指標：<result>` from
     `GENERIC_OPERATION_SECTORS`.
- Idempotent by (project name, title); a second run creates nothing.
- Rehearse in the same isolated database first. No other data.
- Acceptance: Sectors view lists six sectors in order, each with one task
  under 營運設置; tasks open from the rows; activity rows name the admin.

### X3 Live GUI and MCP acceptance for XIDING (read-only after X2)
- GUI, with the existing verification account only if the core already gives
  it XIDING membership; never add a membership for this. Pixel 7 and desktop,
  three locales: the organization chooser lists XIDING; Projects → More →
  Sectors shows X2 exactly; opening a row opens the task; the 營運設置
  project image export returns a PNG ≤ 400 KB; Search finds a setup task;
  zero browser exceptions and zero business writes. If the account has no
  membership, record the GUI part as owner check 5 and continue.
- MCP, with Twin's existing credential, read-only: `tools/list` = 38;
  `workspaces.list` includes XIDING; `tasks.list` for XIDING returns the six
  setup tasks with their labels; `views.image` for the setup project returns a
  PNG whose watermark names Twin (this writes one `view.export` audit row,
  which is expected). No write tool, no message sent.
- Re-run the v0.2.25 public checks (health, OAuth discovery, `/mcp` 401
  challenge) to show nothing else moved.
- Record X1–X3 in `docs/deploy.md` (one checkpoint) and milestone 130 through
  one docs PR after `pnpm lint`.

## Phase H — hygiene and follow-ups (release v0.2.26 if code changes)

- **H1 Unexplained PNG failure "25bb"** (milestone 128). Reproduce with the
  same inputs; loop the PNG e2e and renderer tests 50 times on a fresh stack;
  find the cause or record the bound. Fix with a failing-first test; never
  add retries, widen tolerances or raise timeouts to pass.
- **H2 Verification account growth** (48 archived workspaces, 908 projects).
  Make the live acceptance harness reuse one fixed fixture organization and
  archive its own leftovers through supported APIs at the end of each run;
  test the cleanup locally. Do not delete existing production data:
  `NEEDS-DECISION` for any deletion, which also needs a tested backup.
- **H3 Milestone numbering.** Two files are numbered 127 and three
  `v025-*-preparation` files have none. Renumber to the next free numbers
  with `git mv`, update every link, keep the content.
- **H4 Relations image truncation** (milestone 127): with more than ~140
  tasks the 150-node cap drops all people and agents. `NEEDS-DECISION:
  reserve nodes for people and agents — recommend reserving up to 30`.
  Build only after the owner answers.
- **Release v0.2.26** per [release closeout](release-closeout.md) only if H1,
  H2 or H4 change shipped code; otherwise H2/H3 merge without a release.

## Owner checks after this plan

Owner checks 1–4 stay pending ([owner checks](owner-checks.md)); add 5:
open XIDING on a phone, see six sectors, add one task with Quick Add
`+財務與現金`, and see it under 財務與現金.

## Done when

XIDING exists with the six setup tasks, X3 passed and is recorded, H1–H3 are
merged (H4 per the owner), and any v0.2.26 release is closed out.
