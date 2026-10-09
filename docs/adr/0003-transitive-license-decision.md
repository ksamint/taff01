# 0003 — Resolve transitive licenses in the prescribed stack

## Status

Decided on 2026-10-08. The user restated the standing rules unchanged, with the
fixed Next.js 16 / Tailwind 4 stack and the copyleft ban side by side, after the
Phase 1 checkpoint asked for a choice. That reaffirmation is read as the decision
to keep the fixed stack. Transitive MPL-2.0 components of that stack are accepted
as documented exceptions. The decision is reversible by a later ADR.

## Context

The original requirements prescribe Next.js 16 and Tailwind 4 while banning
copyleft dependencies, naming GPL, AGPL and SSPL. Inspection of the installed
package manifests found:

| Component | Version | License | Relationship |
| --- | --- | --- | --- |
| Lightning CSS and its native binary | 1.32.0 | MPL-2.0 | Tailwind 4 compiler dependency |
| `@vercel/og` | 1.0.1 | MPL-2.0 | Bundled in Next.js 16.4.0 |
| `@img/sharp-libvips-*` | 1.3.4 | LGPL-3.0-or-later | Optional image optimizer dependency |

These findings come from actual dependency manifests, including
`next/dist/compiled/@vercel/og/package.json`, rather than package-name guesses.
The application's own source remains MIT.

## Decision

- Keep the prescribed stack. Lightning CSS and the bundled `@vercel/og` are the
  only MPL-2.0 components and are used unmodified as build-time or framework
  internals. MPL-2.0 is a file-scoped licence outside the GPL, AGPL and SSPL
  families named in the ban, and the application does not modify those files.
- Keep `sharp` (LGPL) excluded through `ignoredOptionalDependencies` and keep
  Next images unoptimized. Re-evaluate in its own ADR if image optimization is
  ever needed.
- GPL, AGPL and SSPL remain banned with no exceptions. Services count too: see
  ADR 0004 for the Redis image, which this rule affects.
- Phase 4 adds a CI licence scan over every installed manifest that fails on
  GPL, AGPL, SSPL, LGPL or unknown licences and allows only the two MPL-2.0
  components listed above.

## Amendment (2026-10-09)

The user approved `axe-core` (MPL-2.0), a dependency of Lighthouse, as a
development-only tool. It may be installed as a devDependency and run in CI
for the Lighthouse audit of the Today route; it is never bundled into or
shipped with the application, and the licence gate lists it as the third
MPL-2.0 exception with that scope. The milestone acceptance "Lighthouse ≥ 90"
is therefore measurable in CI.

## Verification

On 2026-10-08 a scan of every `package.json` under `node_modules/.pnpm`
(including Next's compiled bundles) found MIT, Apache-2.0, ISC, BSD, 0BSD,
CC-BY-4.0, Unlicense and the two MPL-2.0 entries above. No GPL, AGPL, SSPL or
LGPL manifest was present; `sharp` and libvips were absent.

## Consequences

The required framework and compiler stay in place and Phase 2 can start. New
dependencies still declare their licence in the commit message. The CI licence
gate makes the exception list explicit rather than implicit.
