# Agent goal: TypeScript-only sources — v0.2.20

> Status 2026-11-06: T0 and T1 are implemented on the isolated v0.2.20
> hardening branch. T2 source/build work is implemented; PWA/header acceptance
> is pending. T3 versions/changelog are prepared; final integration, checks
> on the final source and release closeout remain pending. See
> [milestone 100](milestones/100-v0.2.20-implementation.md).
>
> Sequencing follows `agent-goal-access-and-completion.md`: release after
> v0.2.19. PR #82 hardening ships in the same candidate, including additive
> migration 0042 and the runtime/storage changes in `spec/runtime.md`.

Paste everything below this line as the goal.

---

Work in `ksamint/taff01` on an isolated branch from `main`. Development may
proceed while prior releases are validated; v0.2.20 activation follows the
v0.2.19 production closeout (`docs/deploy.md` checkpoint and tag `v0.2.19`).
Each release retains its own exact-source gate evidence.
Read first: `AGENTS.md`, `instruction_v0.md`,
`docs/release-closeout.md` (check 1 is the local gate), `docs/deploy.md`
"Release candidate v0.2.17" (the checkpoint format), ADR 0024 (Node 26).

Standing rules: no new dependency; `strict` TypeScript with no `any` and no
`@ts-ignore`; conventional commits; tests ship with the code; never commit
secrets; no `.github/` workflows; no CI, no runners.

## Original inventory and final source audit

The original plan counted 456 TypeScript files and 13 JavaScript files
(2,802 lines). PR #82 also added `scripts/valkey-rehearsal.mjs`; it was
converted to `valkey-rehearsal.mts` with the root operator scripts.
The final tracked JavaScript inventory outside `docs/ui/` is exactly
`apps/web/postcss.config.mjs`. Twelve owned operator/capture modules now use
`.mts`; the service worker uses `src/sw/sw.ts` and generates ignored `public/sw.js`.
Dated audits, capture manifests, deployment history and the original table
below retain their historical source paths.
Everything under `docs/ui/prototype*/` (vendored React
builds, the design-system bundle and the static prototype's `support.js` and
`taff-store.js`) is a documentation asset, excluded from Biome, and stays as
it is.

| File | Lines | Runs as | Target |
| --- | --- | --- | --- |
| `apps/web/public/sw.js` | 88 | served to browsers, registered by `src/lib/pwa.ts` | `apps/web/src/sw/sw.ts`, built to `public/sw.js` (generated, git-ignored) |
| `apps/web/postcss.config.mjs` | 1 | read by Next's `findConfig` | stays `.mjs` (decision 1) |
| `e2e/live/run.mjs` | 32 | `node e2e/live/run.mjs` (operator, `live-harness.test.ts`) | `run.mts` |
| `e2e/live/safety.mjs` + `safety.d.mts` | 79 | imported by `live.ts`, `agent-cleanup.ts`, `run.mjs`, tests | `safety.mts`; delete the `.d.mts` |
| `e2e/live/artifact-guard.cjs` | 16 | `--require` preload, inherited by Playwright workers | `artifact-guard.mts` loaded with `--import` |
| `scripts/release-stack.mjs` | 132 | `pnpm release:stack` | `release-stack.mts` |
| `scripts/ui/a11y-audit.mjs` | 604 | `node scripts/ui/a11y-audit.mjs` | `a11y-audit.mts` |
| `scripts/ui/app-shots.mjs` | 434 | `pnpm ui:app-shots`, `capture-runtime.test.ts` | `app-shots.mts` |
| `scripts/ui/capture-selection.mjs` | 85 | imported by `app-shots`, tested | `capture-selection.mts` |
| `scripts/ui/prepare-time.mjs` | 18 | imported by `app-shots`, `a11y-audit`, `e2e/ui-v2.spec.ts` | `prepare-time.mts` |
| `scripts/ui/prototype-shots.mjs` | 696 | `pnpm ui:prototype-shots` | `prototype-shots.mts` |
| `scripts/ui/prototype-shots-v2.mjs` | 572 | dynamic import from `prototype-shots` | `prototype-shots-v2.mts` |
| `scripts/ui/visual-clock.mjs` | 45 | `--import` preload of the visual API (`playwright.visual.config.ts`) | `visual-clock.mts` |

## How the files run after the move

- **Node runs `.mts` directly.** The engines field is `>=24 <27` and
  production is Node 26 (ADR 0024); both strip types natively.
  Before conversion, `scripts/ui/app-shots.mjs` already imported `./prepare-fonts.ts` and
  `prepare-view.ts` this way and `capture-runtime.test.ts` spawns it with a
  plain `node`, so the pattern is already inside the gate. Keep the syntax
  erasable (no `enum`, `namespace`, parameter properties or `import =`);
  enforce it with `erasableSyntaxOnly` in the tsconfig below. Local
  Node 22 needs `--experimental-strip-types`; say so in the README commands
  only if an operator machine still runs 22.
- **tsx stays where it is used today** (`dev`, `perf:*`, `mcp:smoke`,
  `build:server`, `licence:check`, the visual API's `--import tsx`). Nothing
  moves from tsx to native stripping or back.
- **Preload order.** `playwright.visual.config.ts` becomes
  `node --env-file=.env --import ./scripts/ui/visual-clock.mts --import tsx apps/api/src/index.ts`:
  native stripping loads the preload, then tsx loads the API. The
  production branch `node --import ./scripts/ui/visual-clock.mts dist/runtime/api/api.mjs`
  needs no tsx. Update the exact string asserted in
  `scripts/ui/visual-clock.test.ts` in the same commit.
- **Live artifact guard.** `run.mts` spawns Playwright with
  `--import <artifact-guard.mts>` instead of `--require <artifact-guard.cjs>`.
  Both are `execArgv`, so forked workers inherit it unchanged; the guard
  patches `fs.promises.writeFile`, a process-wide singleton, from ESM
  exactly as it did from CJS. `live-harness.test.ts` spawns
  `e2e/live/run.mts --list` and must still discover all 147 cases.

## T0 — Baseline typecheck for scripts and e2e (own commit)

`pnpm typecheck` runs `turbo typecheck`, which covers the six packages only.
`scripts/**`, `e2e/**`, the Playwright configs and `vitest.config.mts` have
never been type-checked by the gate. Before renaming anything:

1. Add root `tsconfig.scripts.json`: extends `tsconfig.base.json`;
   `include` `scripts/**/*.ts`, `scripts/**/*.mts`, `e2e/**/*.ts`,
   `e2e/**/*.mts`, `playwright*.config.ts`, `vitest.config.mts`;
   `allowImportingTsExtensions: true` (the `.ts` imports in `e2e/support`
   and `scripts/ui` need it; `noEmit` is already on),
   `erasableSyntaxOnly: true`, `types: ["node"]`.
2. Root `package.json`: `"typecheck": "turbo typecheck && tsc -p tsconfig.scripts.json"`.
3. Run it on unmodified `main`. Fix every pre-existing error in that commit
   (`fix(scripts):` / `fix(e2e):`), without changing behaviour. Record the
   count in the milestone; if it is above 40, stop and report before fixing.

## T1 — Rename the owned scripts (one commit per directory)

1. `git mv` each `.mjs` to `.mts`; add parameter and return types from the
   callers; type `page.evaluate` results with `unknown` and narrow; keep every
   comment, option and message. No behaviour change: diff the `.mts` against
   the `.mjs` with `git diff -M` and expect type annotations only.
2. Update every reference, all in the same commit as its file:
   `package.json` (`release:stack`, `ui:prototype-shots`, `ui:app-shots`),
   `playwright.visual.config.ts`, `scripts/ui/visual-clock.test.ts`,
   `scripts/ui/capture-runtime.test.ts`, `scripts/ui/capture-selection.test.ts`,
   `scripts/live-harness.test.ts`, `scripts/test-id-contract.mts` (the
   `app-shots`/`a11y-audit` names) and regenerate
   `e2e/support/test-id-contract.md`, `e2e/ui-v2.spec.ts`,
   `e2e/live/live.ts`, `e2e/live/agent-cleanup.ts`, `e2e/live/README.md`
   (`run.mjs` twice), `docs/ui/README.md` line 130, and the usage comments
   inside `a11y-audit`, `release-stack` and `prototype-shots` (the
   `scriptPath`/`file` fields that name their own path). `docs/deploy.md` and
   older milestones are history and stay unchanged.
3. Delete `e2e/live/safety.d.mts`; the `.mts` carries its own types.
4. PR #84 adds a `rust:fixtures` script to `package.json` beside
   `release:stack`; expect a one-line conflict there and nothing else (PRs
   #81, #82 and #84 touch none of the thirteen files, checked 2026-11-05).

## T2 — Service worker as a TypeScript source (own commit)

1. Move `apps/web/public/sw.js` to `apps/web/src/sw/sw.ts`. Type it with
   `/// <reference lib="webworker" />` and
   `declare const self: ServiceWorkerGlobalScope;`. Logic, regexes, cache
   name and the `?v=` version stamp are unchanged.
2. `apps/web/scripts/build-sw.mts`: esbuild (already a root devDependency,
   MIT; add it to `apps/web` devDependencies at the same version so the
   package declares what it uses) builds `src/sw/sw.ts` to `public/sw.js`
   with `format: "iife"`, `target: "es2022"`, `bundle: true`, no minify, no
   sourcemap. Compare the first build with the tracked `sw.js` and keep the
   diff to the IIFE wrapper.
3. `apps/web/package.json`: `"build": "node scripts/build-sw.mts && next build --webpack"`,
   `"dev": "node scripts/build-sw.mts && next dev --hostname 0.0.0.0"`
   (pnpm does not run `pre*` hooks by default, so chain explicitly).
   `deploy/Dockerfile.web` runs `pnpm --filter @taff/web build` and copies
   `public/`, so the image needs no change; `pnpm e2e` starts
   `pnpm --filter @taff/web dev`, so the dev chain covers it.
4. Typecheck: `apps/web/tsconfig.sw.json` with `lib: ["ES2022", "WebWorker"]`
   and `include: ["src/sw/sw.ts"]`; exclude `src/sw` from
   `apps/web/tsconfig.json` (DOM and WebWorker libs conflict in one
   program); web `typecheck` becomes `tsc --noEmit && tsc -p tsconfig.sw.json`.
   Remove `allowJs` from `apps/web/tsconfig.json`.
5. `git rm apps/web/public/sw.js`; add `apps/web/public/sw.js` to `.gitignore`.
   `next.config.ts` headers for `/sw.js` and `src/lib/pwa.ts` stay as they are.
6. Evidence: `e2e/persistence.spec.ts` "PWA caches only public resources"
   green in en, zh-CN and zh-HK; `curl -I /sw.js` on the candidate stack
   shows `Cache-Control: no-cache` and `Service-Worker-Allowed: /`.

## T3 — Release v0.2.20

1. Align `apps/api`, `apps/web` and `apps/worker` at 0.2.20. The changelog
   covers typed tooling and the service-worker build alongside the cumulative
   OAuth/runtime hardening and C1–C6 completion work that actually lands.
   Migration 0042 and persisted Valkey configuration belong to PR #82;
   the TypeScript conversion itself adds no migration or dependency name.
2. After final integration, add the v0.2.20 checkpoint to `docs/deploy.md`
   using `docs/release-closeout.md`: exact validated source, cumulative scope,
   migration/storage changes, generated assets, actual gate results and
   required live acceptance. Rollback uses the accepted v0.2.19 artifacts;
   preserve additive data and queued jobs per the existing runtime contract.
3. Run the complete exact-source local gate from `docs/release-closeout.md`
   check 1. Record pass/fail/skip/not-run counts in a milestone of ≤40 lines.
   Prior release exceptions stay with their own source; this candidate needs
   its own gate. Push and native release follow only after that gate and the
   preceding release closeouts.

### Current completion audit

| Card | Implemented source/evidence | Remaining acceptance |
| --- | --- | --- |
| T0 | Strict six-package/root check, erasable syntax and no-any/no-ignore rules; baseline 28 diagnostics in 14 files | Repeat on final integrated source |
| T1 | Twelve native modules, declarations removed, callers updated; live fork guard/discovery, stack/Valkey, UI tests and 8 PNG parity checks | Full final-source gate |
| T2 | Typed worker, explicit build/dev chain, separate worker check, ignored output; canonical emitted-code parity | PWA in all three locales and production worker headers |
| T3 | All three app versions 0.2.20, changelog/spec and source inventory | C6 final comparison, exact-source full gate, deploy checkpoint and native closeout; C5 conditional default recorded |

The final integrated gate remains pending; pending checks are not passes.
For C5, the owner did not confirm the route-group move, so this release
follows the conditional default and retains current routing. The measured
valid shared page is 187.7 KiB; the 50 KiB target remains an unresolved
optimization and does not block this release’s acceptance.

## Decisions and remaining scope

1. `apps/web/postcss.config.mjs` stays JavaScript. Next 16.4.2's
   `dist/lib/find-config.js` reads only `.json`, `.js`, `.mjs` and `.cjs`;
   a `postcss.config.ts` would be ignored silently and Tailwind would stop
   compiling. Record it as the one documented exception. Default: keep.
2. Native type stripping versus tsx for the direct `node *.mts` entries.
   Default: native, because the gate already depends on it (T1 note) and it
   adds no loader to the operator's commands.
3. Ship as v0.2.20 after the v0.2.19 closeout. Each release retains its own
   exact-source validation and deployment evidence.

## Validation before every push

`pnpm lint && pnpm typecheck && pnpm licence:check && pnpm test && pnpm build && pnpm build:server && pnpm perf:budget && pnpm e2e && pnpm mcp:smoke`,
then `release:stack --migrate --seed --worker` and `release:checklist` for
T3. Count the JavaScript files at the end:
`git ls-files | rg '\.(js|mjs|cjs|jsx)$' | rg -v '^docs/ui/'` must
print `apps/web/postcss.config.mjs` and nothing else.
