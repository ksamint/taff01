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
- TT-4.3 When a calendar acceptance case measures or activates events after
  changing view, it shall wait for the selected native SDK grid before
  resolving event geometry; a React mode button alone is insufficient.
- TT-4.4 Calendar-only fixtures shall reuse the normally authenticated demo
  session in worker memory, bound to origin and account. A reused session
  shall pass the current Me boundary without a relogin fallback; cookies
  shall not be written to a storage-state file or copy private query caches.

- TT-4.5 Token-policy browser acceptance shall observe the successful policy
  write response before checking the reconciled switch and grant state.
  Pending writes shall retain the existing disabled control behavior; the
  response status, switch, grant-origin and revocation assertions remain.
- TT-4.6 The explicitly enabled visual API clock shall use the capture
  instant for real workspace image GETs as well as its existing read routes.
  Authentication, writes and unrelated reads shall retain native time.

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
- TT-6.2 The only remaining Python file shall be `scripts/ui/subset-fonts.py`
  (ADR 0030 port status); it leaves the policy test's allow-list in the commit
  that ports it.
- TT-6.3 The neighbour check, the live e-mail proof bridge and the audit-pack
  checker shall run as TypeScript: `scripts/deploy/neighbor-preservation.mts`
  (same report and exit code as before), `e2e/live/email-proof.mts` (called in
  process; same remote command; stdout never logged) and
  `scripts/audit-contract.test.ts` (references read from the audit's pinned
  source commit).

### The single check command (TT-7)

- TT-7.6 The production SSR step shall reuse the stack owned by the gate,
  including when the initial browser matrix selected production-mode servers.

- TT-7.1 `pnpm check` shall run every command of the local gate
  ([release closeout](../release-closeout.md), check 1) in one fixed order:
  lint, typecheck, licences, the Rust gate, unit and integration tests,
  migrate and seed, both builds, the bundle budget, the browser suite, then
  the production SSR case, the release checklist and the MCP smoke against a
  production-mode stack it starts and stops itself, then the four image
  builds. It shall stop at the first failure.
- TT-7.2 It shall print `tree=<git rev-parse HEAD^{tree}>` first and refuse a
  working tree with uncommitted changes unless `--allow-dirty` is given.
- TT-7.3 It shall refuse to start when `DATABASE_URL` or `TEST_DATABASE_URL`
  names a host other than this machine, naming the variable and never its
  value, and shall refuse the stack steps when another server already answers
  on the web or API address.
- TT-7.4 It shall write `release-reports/check-report.json` and `.md` (both
  git-ignored) with the tree, the commit, each command, its result and its
  duration. A step that did not run is `not run` with the reason. The result
  is `passed` only when every step ran and passed on a clean tree, `failed`
  when a step failed, and otherwise `partial`.
- TT-7.5 `--only` and `--skip` shall accept step names from `--list` and
  refuse unknown names; `AGENTS.md` shall declare the tda01 Start baseline and
  name `pnpm check` as the check command.

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
| TT-4.3 | e2e/calendar.spec.ts multi-day 44px targets and stacked rows; e2e/support/calendar.ts native view readiness |
| TT-4.4 | e2e/demo-session.spec.ts fresh-context identity and sign-in count; e2e/support/demo-session.ts |
| TT-4.5 | e2e/token-grants.spec.ts exact policy-write acknowledgement before switch/grant assertions |
| TT-4.6 | scripts/ui/visual-clock.test.ts scoped read clock and native-time isolation; pinned Export image dialog capture |
| TT-5 | Canonical emitted-code comparison; three-locale persistence PWA test passed against production build; /sw.js 200, application/javascript, no-cache, Service-Worker-Allowed /; same headers passed on native deployment; milestones 100 and [104](../milestones/104-v0.2.20.md) |
| TT-5.3 | Build CSS: 22 stylesheets byte-identical to the former JS config; no-config control emits no Tailwind; Turbopack dev CSS identical ([milestone 105](../milestones/105-typescript-and-rust-only.md)) |
| TT-6.1, TT-6.2 | scripts/language-policy.test.ts |
| TT-6.3 | scripts/neighbor-preservation.test.ts (10, incl. CLI exit code; 6,000-case differential run in [milestone 107](../milestones/107-report-web-and-ports.md)); scripts/live-email-proof.test.ts (4); scripts/audit-contract.test.ts (5) |
| TT-7 | scripts/check-plan.test.ts (9); full run recorded in [milestone 131](../milestones/131-tda01-start-baseline.md) |
| Runtime/artifact parity | scripts/live-harness.test.ts; capture-runtime.test.ts; visual-clock.test.ts; OAuth integration tests |

## Open decisions

- Final-source acceptance completed: 2202 Node tests, 25 Rust tests, 318 browser cases, six Linux visual cases/36 references, seven persistence checks, three production SSR cases, checklist 32 and MCP 69 checks/37 tools including refresh-family revocation. Historical checkpoint counts retain their source; see [milestone 104](../milestones/104-v0.2.20.md).

## Sources

- [TypeScript task cards](../agent-goal-js-to-ts.md)
- [Runtime contract](runtime.md)
- [ADR 0030](../adr/0030-typescript-and-rust-only.md)
