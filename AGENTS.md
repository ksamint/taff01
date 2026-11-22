# Taff agent instructions

<!-- ksamint-policy-pointer v1 -->
> **Global agent policy:** this repository follows ksamint ADR-0000 (claudememo01 `global/AGENT-POLICY.md`):
> TypeScript first, Rust first (no new JS) · no CI runners (no GitHub Actions, hosted or self-hosted) · validate locally on the
> exact tree · the agent merges on green local validation · deploy directly from the local deploy machine with automatic
> rollback · hard limits on shared infrastructure, secrets and product rules. Stricter safety rules below still apply.
<!-- /ksamint-policy-pointer -->

Baseline: tda01 start@1
Check: `pnpm check`

The two lines above declare the tda01 Start baseline (`ksamint/tda01`,
`baseline/start.json`). `pnpm check` runs the whole local gate and prints the
table, bound to `git rev-parse HEAD^{tree}`, that goes into every pull request
(`.github/PULL_REQUEST_TEMPLATE.md`). A run with `--only`, `--skip` or
`--allow-dirty` reports "partial" and never counts as the gate.

Read `instruction_v0.md` before changing this repository. It contains the original
product, architecture, stack, security, performance, and checkpoint requirements.
The final line is the original repository creation request, not a recurring action.

Delivery rule (no skill is required for it; the `lean-delivery` skill named
here before 2026-11-06 never existed and the requirement is waived): make the
smallest change that meets the user's latest command, ship it with its tests
and its spec change, record the milestone, push, continue. Use the
`orchestrate-development` skill (ksaskill01) only for multi-day features and
the `module-spec` skill (`.claude/skills/module-spec/`) for specs. A skill
named in a goal that cannot be found is reported in the milestone as
missing, never a blocker.

At the start of local Codex work on the M1 Pro, run
`python3 /Users/gf-m1pro/.codex/skills/op-automation/scripts/check_access.py`.
Before credential-dependent work, read
`/Users/gf-m1pro/.codex/skills/op-automation/SKILL.md` and use the existing
`op-automation` wrapper. If access fails, report the diagnostic's sanitized
blocker without changing permissions or requesting repeated desktop sign-in.
Never commit secrets.

Write new source in TypeScript or Rust only (ADR 0030); configuration is
data or TypeScript. `scripts/language-policy.test.ts` fails on anything else.

Product requirements live in `docs/spec/<module>.md`, one living spec per
module written with the `module-spec` skill (`.claude/skills/module-spec/`).
Change the spec in the same commit as the behaviour it describes: ADRs record
decisions, specs record the current contract. Vulnerability reports follow
`SECURITY.md`.

For a requested brand treatment, resolve its latest guide, tokens, and official
assets through https://apuch.art/ before styling.

There are no blocking review gates. At each milestone, push, record working
behavior, missing work, open decisions and validation numbers (≤ 40 lines) in
`docs/milestones/`, then continue. The user reviews asynchronously.
The current goal is the user's latest command.

Access changes: when a role, scope or permission tier changes, list every
operation that issues, extends or re-enables access (approve, exchange,
refresh, restore/undo, list, revoke) and test each with the lowest role that
can reach it, including after that role loses the authority.

No CI and no runners, ever (owner, 2026-11-05). Do not add `.github/`
workflows, runner checks, or any step that waits on a hosted or self-hosted
runner. Before every push run the local gate (`pnpm check`;
`docs/release-closeout.md`, check 1); deploy by pushing directly to the server per `docs/deploy.md` and
the closeout checklist. "CI" in older documents now means that local gate.
The deploy steps and the rollback are in `docs/runbooks/deploy.md`; every
deploy attempt leaves a report in `deploy/reports/`.

Backend port to Rust (owner, 2026-11-15: "yes for all"; plan
`docs/plans/0001-rust-backend-port.md`, ADR 0032):
- From v0.2.27, new backend behaviour (routes, MCP tools, jobs, domain rules)
  is written in Rust under `backend/`. `packages/core`, `apps/api` and
  `apps/worker` take fixes only.
- A pull request that changes only `backend/` code which no production route,
  image or job runs may merge on `pnpm check --only rust` plus the wire replay
  of plan Wave 0. Until that replay exists, and for every route switch and
  every release, the full `pnpm check` is required.
- Sign-in, OAuth and SMS move to Rust last (plan Wave 4).

Plan 0004 queue (owner, 2026-11-22: "yes for all … not gate just do it";
goal `docs/agent-goal-v0.2.27-function-map-in-rust.md`). Every new function
is built in Rust, with its screens in TypeScript. The queue has no decision
stops and no review waits. A PR in it merges on the fast checks named in
that goal, and the full `pnpm check` runs once on each release head before
the deploy. The hard limits under "Stop and report" still apply.

Architecture model (owner, 2026-11-20; ADR 0033, spec `tooling.md` TT-9):
- `pnpm arch:map` builds the OMV map (O defines, M holds, V views; method in
  `scripts/omv/THEORY.md`); read `architecture/README.md`
  before changing structure. A new table, route, MCP tool, core file, page,
  permission action or specification must be placed in
  `scripts/architecture/` in the same commit; `pnpm test` fails otherwise.
- The func-map skill (`.claude/skills/func-map/`) sets Taff against a
  catalog of the field's functions; `pnpm arch:benchmark` writes the table.
- `scripts/omv/` is the portable engine and will be merged into tda01.
  Keep it free of any import from the rest of this repository.

## Stop and report

Stop and report, never work around:
- shared infrastructure other projects use: database access rules, Caddy and
  other proxies, DNS, firewall, shared ports, and the neighbouring containers
  `scripts/deploy/neighbor-preservation.mts` protects;
- creating, printing or committing secrets;
- bypassing the product's own approval, audit or legal rules: agent output
  waits for a person, and an agent never gets a code path a person lacks;
- destructive data operations without a tested backup;
- decisions that change the product contract: licences, deleting data,
  publishing outside the repository.

Print `NEEDS-DECISION: <question> — recommend <option>`, continue with
independent work, and print one `STATUS:` line per finished task.

Goals and prompts for deploy or closeout may only require evidence that
`docs/release-closeout.md` names a source for; reference that file instead of
restating the procedure. A requirement without a recorded source is a bug in
the prompt, not a blocker for the operator.
