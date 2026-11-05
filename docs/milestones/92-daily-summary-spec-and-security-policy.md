# 92 — Daily summary spec, SECURITY.md and the module-spec skill (2026-11-05)

Docs-only milestone from `main` `ed84cab` on branch `claude/nifty-pascal-tm5d5d`,
after [91](91-js-to-ts-plan.md). No code, schema or runtime change.

## What was done

- `docs/spec/daily-summary.md`: the first living module spec. Roles table,
  27 numbered EARS requirements in seven groups (tags, recipients,
  generation, content, in-app reading, share links, permissions), the
  non-functional limits, out-of-scope list, an acceptance table naming the
  unit, integration, authorization, worker, REST and e2e tests, and the three
  open decisions carried from milestones 88–89. Every number was taken from
  the schemas, core, routes and tests on `main`, not from the ADR text alone.
- `SECURITY.md`: GitHub private vulnerability reporting as the channel,
  acknowledgement in 3 working days, triage in 7, fix targets 30/90 days,
  supported versions, scope, testing rules and the design facts a reviewer
  needs.
- `.claude/skills/module-spec/SKILL.md`: the procedure and template, in the
  `ksaskill01` front-matter format so it can be copied to
  `ksaskill01/skills/module-spec/` and catalogued there.
- `AGENTS.md` gains the same-commit rule for specs; README links the spec.
- Other repositories (read-only check, 2026-11-05): fourteen `ksamint`
  repositories received "chore: remove GitHub CI check workflows; checks run
  locally" between 16:05 and 16:08 UTC, matching milestone 90 here.
  `fenshen01` has an open PR #12 "archive persistent memory and daily
  summary design (UP9)", a second daily-summary design worth aligning with
  this spec. Twenty PRs are open across the account; taff01 has #81, #82, #84.

## Missing

- GitHub private vulnerability reporting must be enabled by the owner in the
  repository's Security settings; until then the link in `SECURITY.md` 404s.
- Specs for the other modules (tasks, calendar, agents and MCP, CRM,
  planning, notifications); the skill is written so each takes one pass.
- The skill is not yet in `ksaskill01` (this session cannot push there).

## Validation

Docs only: `git diff --check` clean; links resolve; spec 178 lines (cap 200); no secret or personal address added. No test, build or e2e run was needed or claimed.
