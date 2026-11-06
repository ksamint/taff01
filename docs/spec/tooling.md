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
| Runtime/artifact parity | scripts/live-harness.test.ts; capture-runtime.test.ts; visual-clock.test.ts; OAuth integration tests |

## Open decisions

- Legacy script renames and the service-worker build follow the same local gate.

## Sources

- [TypeScript task cards](../agent-goal-js-to-ts.md)
- [Runtime contract](runtime.md)
