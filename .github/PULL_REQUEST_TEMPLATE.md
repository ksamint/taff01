## What and why

<!-- One task. Name the plan task or goal item it closes. -->

## Validation

<!-- Run `pnpm check` in a clean checkout of the PR head rebased on `main` and
paste `release-reports/check-report.md` here. It starts with the tree. A
"partial" result is not the gate: say which rule in AGENTS.md allows it. A step
that could not run is listed as not run, never as passed. -->

Tree: `<git rev-parse HEAD^{tree}>`

| Command | Result | Time |
| --- | --- | --- |
| `pnpm check` | | |

## Language targets

<!-- TypeScript or Rust for each component touched (ADR 0030). New backend
behaviour is Rust from v0.2.27 (ADR 0032). -->

## Spec, milestone and dependencies

<!-- The `docs/spec/` change, the `docs/milestones/` entry, and each new
dependency with its licence, or "None". -->

## Deploy impact

<!-- Migrations, environment values, images, and how it rolls back
(`docs/runbooks/deploy.md`). "None" for documentation and tooling. -->
