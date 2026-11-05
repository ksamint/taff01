# Review — open pull requests and unfinished plans (2026-11-05)

Reviewed from `main` at `707161c` (v0.2.16). Sources: the three open pull
requests, `docs/frontend-v2-plan.md` §10, `docs/milestones/36–82`,
`docs/deploy.md` checkpoints, `docs/upgrade-plan.md`. Companion of the daily
summary plan: [ADR 0027](../adr/0027-shareholder-daily-summary.md) and
[agent-goal-daily-summary.md](../agent-goal-daily-summary.md).

## Open pull requests

| PR | State | Head | Size | What | Standing |
| --- | --- | --- | --- | --- | --- |
| [#84 Rust backend foundation (ADR 0026)](https://github.com/ksamint/taff01/pull/84) | open, ready | `6bd9130` | 37 files, +8,872 | `backend/` Cargo workspace, parity fixtures (recurrence, time zone, canonical JSON, token hash, permissions), MCP JSON-Schema bridge, `rust-backend` CI job | `rust-backend` and the hosted `checks` job green; the eight-job CI is skipped because `TAFF_FULL_CI_ENABLED` is off. The in-branch review of 2026-11-01 asked for five fixes before merge. Head `6bd9130` visibly addresses item 1 (recurrence golden now `{accepted, rejected}` with ≥ 14 / ≥ 20 cases) and item 4 (tool schemas derive from `MCP_TOOL_ARGS`, no pinned count). Items 2 (`normalize_rrule` divergences: `until < start`, case-insensitive `RRULE:` prefix, fixed offsets), 3 (`canonical_json` number formatting, which feeds receipt HMACs), 5 (contradicting plan documents, duplicated line in `instruction_v0.md`) and the twelve follow-ups (licence allow-list, permission parity breadth, CI fmt/deny/regeneration diff, crate layout) are not confirmed from `main`; verify them in the PR before merging. |
| [#82 harden MCP authorization, queue durability, recovery](https://github.com/ksamint/taff01/pull/82) | draft | `2b773c3` | 94 files, +17,641 | explicit token grants, serialized revocation, OAuth replay proofs, refresh-family revocation, BullMQ `noeviction`, bounded SQL/shutdown, Nodemailer 10.1.4, additive migration 0039 | Stacks on #81. 1,872 local tests, lint, typecheck, builds, MCP smoke reported. Three-locale browser, visual, performance/image and closeout evidence still pending; eight-job CI not run. Base is one docs commit behind `main`; mergeable. |
| [#81 MCP personal tokens across explicit organizations](https://github.com/ksamint/taff01/pull/81) | draft | `55718da` | 38 files, +1,542 | organization grants for personal tokens, current-scope checks, management API, three-locale UI, new `workspaces.list` MCP tool (34 tools) | 1,844 local tests. Browser acceptance pending. Included in #82. |

Cross-PR notes:

- Migration numbers collide by construction: #81 takes 0038, #82 takes 0039,
  `main` is at 0037. Any new feature branched from `main` today must pick its
  number after these merge (the daily summary plan says so).
- #84 edits `instruction_v0.md` and `.github/workflows/ci.yml`; #82 touches
  CI as well. Merge #81 → #82 → #84 or rebase #84 last.
- The resync note in #84 (`docs/milestones/84-resync-and-validation-20261101.md`)
  records a security-relevant open item on `main`: authenticated SSR HTML is
  served with `Cache-Control: no-store` but without `private`. Fix it as its
  own small PR; it is not in any open PR.
- The full CI gate is disabled by repository variable, so "green" on the PRs
  means the hosted `checks` job only. Re-enable it for the merge of #81/#82
  or record the owner's replacement evidence per `docs/release-closeout.md`.

## Unfinished plan items

From `docs/frontend-v2-plan.md` §10 and later milestones; status as recorded
on `main`.

| Item | Source | Status |
| --- | --- | --- |
| Brief: undo for an applied suggestion | §10.1 item 5; M17 | open (no inverse API; ADR 0017 covers suggestion undo only) |
| Brief: "heaviest load" question (`load` intent) | M17 | open |
| Admin `ai_enabled` switch; AI provider / data-consent decision (D6) | §10.1, §10.2 | open; AI_* unset in production |
| Hard delete of CRM records (D4) | §10.2 | open decision; delete archives |
| Value-chain layer (D8), Neo4j graph scope | §10.2; M9 | open since M9; a side branch `codex/m9-neo4j-release` was never merged |
| Lighthouse and LCP on screens other than Today | §10.3 | never run |
| Phone zh-HK Projects: `new-project` absent after filter click | v0.2.13–v0.2.15 checkpoints; M37 | open, recorded three times |
| v0.2.16 omissions: full eight-job CI, visual regression, LCP | M82 | explicit owner-accepted omission; not re-run |
| Claude.ai connector grant / revoke / reconnect live check | M82; v0.2.12 checkpoint | pending since v0.2.12 |
| Master five-minute and voice acceptance | M78, M82 | pending |
| Ordinary-mutation receipt gap for Twin executor | M78 | tests written, "still unrun pending authorized CI capacity" |
| `Cache-Control: private` on SSR HTML | #84 resync note | open on `main` |
| PostgreSQL 19 move | upgrade plan | GA moved to 2026-11-19; not applied |
| TypeScript 7.1 | upgrade plan | release candidate expected mid-November; nothing to change |
| Drizzle 1.0, ioredis 6 for the worker, BullMQ PostgreSQL backend ADR | upgrade plan | waiting on upstream |

## Daily summary module: does it exist?

No. Two neighbours exist and are reused by the plan, but neither targets an
external audience, neither is tagged, and neither is watermarked:

- **Daily digest** (M7, `docs/notifications.md`): one immutable snapshot per
  person per workspace per local day (reviews waiting, due today, agent
  runs), generated by the BullMQ `digest-scan` / `daily-digest` jobs, shown
  at `/digests`, visible to its recipient only.
- **AI brief** (M17, ADR 0016): rules-based, per reader, across memberships;
  project risk, slip forecast, finance for `finance:read`, suggested actions.
  Not persisted; not shareable.

What is missing, and what ADR 0027 adds: an audience tag of the form
`shareholder + organization`, project tagging, a per-recipient daily project
progress summary built by a pure deterministic function on the same plan
model the brief and timeline use, an immutable persisted row with a
recipient-bound watermark and content hash, in-app and signed-link delivery
with revocation, and a role/access matrix tested per AGENTS.md.
