# 0003 — Resolve transitive licenses in the prescribed stack

## Status

The user explicitly authorized committing and pushing Phase 1 on 2026-10-08.
That publication authorization supersedes the earlier publication hold. The
transitive-license policy decision remains open; no blanket exception is inferred.

## Context

The original requirements prescribe Next.js 16 and Tailwind 4 while banning
copyleft dependencies. Inspection of the installed package manifests found:

| Component | Version | License | Relationship |
| --- | --- | --- | --- |
| Lightning CSS and its native binary | 1.32.0 | MPL-2.0 | Tailwind 4 compiler dependency |
| `@vercel/og` | 1.0.1 | MPL-2.0 | Bundled in Next.js 16.4.0 |
| `@img/sharp-libvips-*` | 1.3.4 on this host | LGPL-3.0-or-later | Optional image optimizer dependency |

These findings come from actual dependency manifests, including
`next/dist/compiled/@vercel/og/package.json`, rather than package-name guesses.
The application's own source remains MIT.

## Work completed

Excluded optional `sharp` with pnpm's `ignoredOptionalDependencies` and configured
Next images as unoptimized. The current UI does not use image optimization.
The required compiler and framework still contain MPL-2.0 code.

## Decision requested

Either retain the specified stack with documented transitive MPL-2.0 exceptions,
or preserve the blanket copyleft ban and propose changes to the fixed stack.
No exception has been inferred from silence. Implementation and local validation
are available for review while this policy decision is pending.

## Consequences

The first option preserves the required framework and compiler. The second needs
a stack ADR and implementation changes before publication. Neither option changes
the MIT license of original application code.
