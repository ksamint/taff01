# 105 — Review of v0.2.20; TypeScript and Rust only; report design plan (2026-11-06)

From `main` `e251d00` (production v0.2.20 `596272a`), branch `claude/nifty-pascal-tm5d5d`.

## Review

- Twin access: yes. ADR 0028 shipped in v0.2.18; the Twin token holds
  `all_organizations`, one manual home and two policy grants across the three
  active organizations, scopes tasks read/write, calendar write and
  `summaries:read` (milestones 97, 102, 104; 37 MCP tools). Personal and
  archived workspaces are excluded by design; a workspace admin can revoke.
- Report by tag and authority: yes. Audience tags select projects; recipient
  language, zone, finance and names switches shape content; every read goes
  through `can()`; agents read only with `summaries:read`. Live Twin delivery
  waits for the owner's first tag, recipient and Twin source profile.
- Professional design: no. The PNG rasterizes the text render line by line,
  grayscale, character-count wrap splitting label from value, risk as a bare
  word, progress bar detached. Plan: v0.2.21 R1–R6.

## Done

- ADR 0030: TypeScript and Rust are the only source languages; enforced by
  `scripts/language-policy.test.ts`; five Python files listed with port targets.
- Last JavaScript removed: `apps/web/postcss.config.mjs` → `postcss.config.json`.
  Tooling spec TT-5.3 and TT-6, README, `instruction_v0.md`, AGENTS.md updated.
- ADR 0029 amendment 1 and `docs/agent-goal-v0.2.21-report-design-and-ports.md`.

## Validation (Node 26.13.0, pnpm 12.10.1, this container)

| Check | Result |
| --- | --- |
| Web production build, JSON config | passed; 22 stylesheets byte-identical to the JS config |
| Control build without any config | no Tailwind output, so JSON is the config in effect |
| Turbopack dev CSS, JSON vs JS config | identical (79,966 bytes); no-config control uncompiled |
| `pnpm lint` | 642 files clean; permissions matrix current |
| Six package typechecks and root tooling typecheck | clean (run with `pnpm -r`; Turbo cannot spawn this container's pnpm shim) |
| Vitest `scripts/` incl. new policy test | 21 files, 85 tests passed |

Not run here: full `pnpm test` and e2e (no PostgreSQL 18 or Valkey), Rust gate
(no Rust change), image builds. The operator's gate covers them before release.
