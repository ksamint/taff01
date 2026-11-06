# Spec: TypeScript tooling

Living specification for scripts, browser tests and operator tooling.
Change it in the same commit as the behavior it describes.

Status: v0.2.20 candidate; script/e2e baseline typecheck implemented.

## Users and roles

| Role | Can |
| --- | --- |
| Developer/operator | Run local validation and the bounded private live harness |

## Requirements

### Checked sources (TT-1)

- TT-1.1 The local typecheck shall check all six packages plus root scripts,
  e2e sources and Playwright/Vitest configuration under strict TypeScript.
- TT-1.2 Checked tooling shall use erasable TypeScript syntax, no explicit any
  and no ts-ignore directives. Existing runtime behavior and live artifact
  redaction shall remain unchanged when adding types.

### Private live runner (TT-2)

- TT-2.1 The live runner and safety helpers shall execute as native Node .mts
  modules. The artifact guard shall preload through --import and remain
  inherited by forked workers.
- TT-2.2 The runner shall retain its targeting allow-list, serialization and
  categorical private diagnostics. Its preload shall suppress raw
  error-context.md writes while allowing the existing safe receipts.

### Operator scripts (TT-3)

- TT-3.1 The local production-stack runner and isolated Valkey rehearsal shall
  execute directly as native .mts modules, retaining their existing flags,
  environment checks, cleanup and owned-container boundaries.

## Non-functional

- No new dependency; Node 24–26 remains supported. Library errors retain their
  existing public properties after parameter-property syntax is removed.
- Browser capture calls shall retain their existing font and clock behavior.

## Out of scope

- Production activation, vendored documentation assets and public layout changes.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| TT-1 | pnpm typecheck; pnpm lint; tsconfig.scripts.json |
| TT-2 | scripts/live-harness.test.ts; native Node runner/worker preload regression; 147-case discovery |
| TT-3 | Native release:stack health/worker readiness; scripts/valkey-rehearsal.mts seven-check rehearsal |
| Runtime/artifact parity | scripts/live-harness.test.ts; capture-runtime.test.ts; visual-clock.test.ts; OAuth integration tests |

## Open decisions

- Legacy script renames and the service-worker build follow the same local gate.

## Sources

- [TypeScript task cards](../agent-goal-js-to-ts.md)
- [Runtime contract](runtime.md)
