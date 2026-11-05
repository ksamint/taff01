# Agent goal: TypeScript-only sources — retire the last JavaScript files, release as v0.2.18

> Status 2026-11-05: plan written after the v0.2.17 review
> (`docs/milestones/91-js-to-ts-plan.md`). No code change yet. The owner
> reviews asynchronously; the three open decisions below have proposed
> defaults, so build on those unless redirected.
>
> **2026-11-05 (later):** sequenced as v0.2.20 after the access work; read
> `agent-goal-access-and-completion.md` §2. Replace "v0.2.18" below with
> "v0.2.20" and "after the v0.2.17 closeout" with "after the v0.2.19 closeout".

Paste everything below this line as the goal.

---

Work in `ksamint/taff01` on a branch from `main` **after the v0.2.17
production closeout is recorded** (`docs/deploy.md` checkpoint, tag
`v0.2.17`); the v0.2.17 gate evidence belongs to its own SHA and is not
re-run for this change. Read first: `AGENTS.md`, `instruction_v0.md`,
`docs/release-closeout.md` (check 1 is the local gate), `docs/deploy.md`
"Release candidate v0.2.17" (the checkpoint format), ADR 0024 (Node 26).

Standing rules: no new dependency; `strict` TypeScript with no `any` and no
`@ts-ignore`; conventional commits; tests ship with the code; never commit
secrets; no `.github/` workflows; no CI, no runners.

## What exists

The repository has 456 TypeScript files and 13 JavaScript files (2,802
lines) that are code. Everything under `docs/ui/prototype*/` (vendored React
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
  `scripts/ui/app-shots.mjs` already imports `./prepare-fonts.ts` and
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

## T1 — Rename the eleven scripts (one commit per directory)

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

## T3 — Release v0.2.18

1. Bump `apps/api`, `apps/web` and `apps/worker` to 0.2.18 (lockstep, as
   every release). `CHANGELOG.md`: "v0.2.18 — TypeScript-only sources": the
   runtime delta is the service worker now built from TypeScript; API and
   worker images carry no code change; no migration, no environment variable,
   no new dependency.
2. `docs/deploy.md`: "Release candidate v0.2.18" in the v0.2.17 format:
   source SHA, scope, "no migration", routing unchanged, assets (only
   `sw.js` is regenerated), the local gate results, live acceptance (health,
   `/sw.js` headers, one signed-in page load that registers the worker,
   `/mcp` 401), rollback = v0.2.17 images.
3. Run the whole local gate from `docs/release-closeout.md` check 1 on the
   release SHA; record pass and fail counts; a check that cannot run is
   listed as not run. The 13 failures the owner accepted for v0.2.17 are
   expected to repeat unless fixed; list them as pre-existing, never as
   passing. Milestone `docs/milestones/NN-v0.2.18.md` (≤ 40 lines), push to
   `main`, then the deploy operator's native steps and closeout.

## Open decisions (defaults proposed)

1. `apps/web/postcss.config.mjs` stays JavaScript. Next 16.4.2's
   `dist/lib/find-config.js` reads only `.json`, `.js`, `.mjs` and `.cjs`;
   a `postcss.config.ts` would be ignored silently and Tailwind would stop
   compiling. Record it as the one documented exception. Default: keep.
2. Native type stripping versus tsx for the direct `node *.mts` entries.
   Default: native, because the gate already depends on it (T1 note) and it
   adds no loader to the operator's commands.
3. Ship as v0.2.18 after the v0.2.17 closeout rather than folding into the
   v0.2.17 candidate. Default: separate release, so the recorded v0.2.17
   evidence stays tied to its SHA.

## Validation before every push

`pnpm lint && pnpm typecheck && pnpm licence:check && pnpm test && pnpm build && pnpm build:server && pnpm perf:budget && pnpm e2e && pnpm mcp:smoke`,
then `release:stack --migrate --seed --worker` and `release:checklist` for
T3. Count the JavaScript files at the end:
`git ls-files | grep -E '\.(js|mjs|cjs|jsx)$' | grep -v '^docs/ui/'` must
print `apps/web/postcss.config.mjs` and nothing else.
