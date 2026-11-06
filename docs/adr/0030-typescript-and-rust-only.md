# 0030 — TypeScript and Rust are the only source languages

Date: 2026-11-06. Status: accepted (owner: "add adr always use ts rust, and
update now js to all ts"). Builds on ADR 0004 (stack review), ADR 0026
(backend migration to Rust) and ADR 0029 (Rust renderer). The owner's earlier
direction, recorded in milestone 90, is "we are ts and rust".

## Context

v0.2.20 moved every owned JavaScript module to strict TypeScript except
`apps/web/postcss.config.mjs`, kept because Next 16.4.2's webpack config
loader reads no TypeScript file (`docs/spec/tooling.md` TT-5.3). Five Python
files remain: the deploy neighbour check and its test, the live harness's
private e-mail proof bridge, the font subsetter and the offline audit
verifier. Nothing stops a new JavaScript, Python or shell file from landing.

The loader reads PostCSS settings from `package.json`, `.postcssrc.json` and
`postcss.config.json` before any JavaScript file, and Turbopack (the dev
server) reads `postcss.config.json` as well. A JSON file is data, not code.

## Decision

1. **Two languages for every new source file.**
   - TypeScript (strict, erasable syntax, no `any`, no `ts-ignore`): the web
     client, `packages/schemas` (the wire contract), `packages/core` and the
     Node services until each module's Rust cutover (ADR 0026), tests, e2e,
     operator scripts and tooling.
   - Rust (edition 2024, toolchain pinned in `backend/rust-toolchain.toml`):
     backend services as ADR 0026 ports them, any new standalone service,
     CPU-bound or binary work (rendering, image, PDF, fonts), and any tool
     that ships inside a production image.
   - Anything that only configures a tool is data (JSON, YAML or TOML) or
     TypeScript. When a tool reads neither, the choice of tool is revisited
     before a JavaScript file is added; adding one needs an amendment to
     this ADR.
2. **No JavaScript source.** `apps/web/postcss.config.mjs` becomes
   `apps/web/postcss.config.json` with the same content. JavaScript produced
   by a build (`apps/web/public/sw.js`, `.next/`, `dist/`) is output,
   git-ignored, never committed.
3. **Python is retired by porting, with parity, when each file is next
   touched or by v0.2.22 at the latest.**

   | File | Port to | Parity evidence |
   | --- | --- | --- |
   | `scripts/deploy/neighbor_preservation.py` and its test | `scripts/deploy/neighbor-preservation.mts` | run both on the same sanitized snapshots for one release; identical verdicts |
   | `e2e/live/email-proof.py` | a TypeScript module called in process by `e2e/live/live.ts` | live discovery and the proof case pass; nothing written to logs |
   | `docs/audit/verify.py` | `scripts/audit-contract.test.ts` in `pnpm test` | same checks, same failures on a broken fixture |
   | `scripts/ui/subset-fonts.py` (fontTools) | a Rust tool in `backend/` producing both the web WOFF2 subsets and the renderer TTF subsets | identical glyph sets per file; web `fonts.test.ts` and renderer CJK goldens pass |

4. **Excluded:** vendored documentation assets under `docs/ui/prototype/`
   and `docs/ui/prototype-v2/` (third-party builds and the static
   prototype). They are not source and are not served by the app.
5. **Enforced.** `scripts/language-policy.test.ts` runs in `pnpm test` and
   fails on any tracked `.js`, `.mjs`, `.cjs`, `.jsx`, `.py`, `.sh`, `.bash`,
   `.rb`, `.go`, `.java`, `.kt`, `.php`, `.pl`, `.lua`, `.swift` or `.cs`
   file outside the exclusions, except the Python files named above. Porting
   a Python file removes it from the test's allow-list in the same commit, so
   the list only shrinks.

## Consequences

- The repository holds no owned JavaScript. Next's webpack build and
  Turbopack dev server read the JSON config; the build's 22 stylesheets are
  byte-identical to the JavaScript config's output, and a build with no
  config emits no Tailwind, so the JSON file is the one in effect
  (milestone 105).
- Operators need Node and, for the Rust gate, Cargo. Python remains a local
  prerequisite only until the four ports land.
- `docs/spec/tooling.md` TT-5.3 changes from "the sole JavaScript exemption"
  to "configuration is JSON"; TT-6 records this policy.
