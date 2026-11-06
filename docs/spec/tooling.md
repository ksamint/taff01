# Spec: TypeScript tooling

Living specification for scripts, browser tests and operator tooling.
Change it in the same commit as the behavior it describes.

Status: T0–T3 shipped in v0.2.20, source `596272a`; complete exact-source release and native worker-header acceptance are recorded in [milestone 104](../milestones/104-v0.2.20.md).

## Users and roles

| Role | Can |
| --- | --- |
| Developer/operator | Run local validation and the bounded private live harness |

## Requirements

### Checked sources (TT-1)

- TT-1.1 The local typecheck shall check all six packages plus root scripts,
  e2e sources and Playwright/Vitest configuration under strict TypeScript.
  Every package shall accept typed extension imports across the shared tooling boundary.
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

### UI capture drivers (TT-4)

- TT-4.1 The converted capture drivers and clock helpers shall execute as native
  .mts modules with typed Playwright boundaries and checked capture selection.
- TT-4.2 Renaming shall retain the capture matrix, paths, timers, fonts and
  screenshots. Browser-returned fixture data shall cross an unknown boundary
  and be narrowed before use. Approved references shall not change.

### Service worker source (TT-5)

- TT-5.1 The web dev/build commands shall explicitly compile the typed service
  worker to the ignored public/sw.js using the existing esbuild version,
  IIFE/ES2022, without minification or source maps.
- TT-5.2 A separate WebWorker typecheck shall cover the source without DOM
  globals. Public cache rules, private navigation exclusions, the version
  query, registration and response headers shall remain unchanged.
- TT-5.3 PostCSS configuration shall be the JSON file
  `apps/web/postcss.config.json`, read by both the webpack build and the
  Turbopack dev server. Its compiled stylesheets shall equal those of the
  former JavaScript configuration. Vendored documentation assets remain unchanged.

### Language policy (TT-6)

- TT-6.1 Tracked source files shall be TypeScript or Rust (ADR 0030). No
  owned JavaScript shall be committed, including configuration; build output
  stays git-ignored.
- TT-6.2 The remaining Python files shall be only those listed in ADR 0030,
  each removed from the policy test's allow-list in the commit that ports it.

## Non-functional

- No new dependency name; web declares the same esbuild version already used
  at the root. Node 24–26 remains supported. Library errors retain their
  existing public properties after parameter-property syntax is removed.
- Browser capture calls shall retain their existing font and clock behavior.

## Out of scope

- New deployment infrastructure, vendored documentation assets and public layout changes.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| TT-1 | pnpm typecheck; pnpm lint; tsconfig.scripts.json |
| TT-2 | scripts/live-harness.test.ts; native Node runner/worker preload regression; 147-case discovery |
| TT-3 | Native release:stack health/worker readiness; scripts/valkey-rehearsal.mts seven-check rehearsal on pinned production 9.1.2; native persisted-state proof in [milestone 104](../milestones/104-v0.2.20.md) |
| TT-4 | Native before/after capture PNG hashes; capture-runtime, capture-selection and visual-clock tests |
| TT-5 | Canonical emitted-code comparison; three-locale persistence PWA test passed against production build; /sw.js 200, application/javascript, no-cache, Service-Worker-Allowed /; same headers passed on native deployment; milestones 100 and [104](../milestones/104-v0.2.20.md) |
| TT-5.3 | Build CSS: 22 stylesheets byte-identical to the former JS config; no-config control emits no Tailwind; Turbopack dev CSS identical ([milestone 105](../milestones/105-typescript-and-rust-only.md)) |
| TT-6 | scripts/language-policy.test.ts |
| Runtime/artifact parity | scripts/live-harness.test.ts; capture-runtime.test.ts; visual-clock.test.ts; OAuth integration tests |

## Open decisions

- Final-source acceptance completed: 2202 Node tests, 25 Rust tests, 318 browser cases, six Linux visual cases/36 references, seven persistence checks, three production SSR cases, checklist 32 and MCP 69 checks/37 tools including refresh-family revocation. Historical checkpoint counts retain their source; see [milestone 104](../milestones/104-v0.2.20.md).

## Sources

- [TypeScript task cards](../agent-goal-js-to-ts.md)
- [Runtime contract](runtime.md)
- [ADR 0030](../adr/0030-typescript-and-rust-only.md)
