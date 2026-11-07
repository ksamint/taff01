# Agent goal: v0.2.21 — designed summary report (text and image) and the Python ports

> Status 2026-11-06: written from the review in
> `docs/milestones/105-typescript-and-rust-only.md`. Designs:
> [ADR 0029 amendment 1](adr/0029-summary-text-and-image-renders.md#amendment-1--2026-11-06-designed-layout)
> and [ADR 0030](adr/0030-typescript-and-rust-only.md). Nothing below is
> implemented. Build on the stated defaults unless redirected.
>
> **2026-11-06: R1–R4 and R6 done** (`docs/milestones/106-report-design.md`):
> shared layout, `text-2`, colour palette `image-2` with `image-1`
> compatibility, worker on the layout, spec DS-8.2/8.3/8.7. Remaining: R5
> (web page from the layout), P1–P4 (Python ports), release.
>
> **2026-11-07: R5, P1–P3 done; P4 kept by the ADR 0030 fallback**
> (`docs/milestones/107-report-web-and-ports.md`). Remaining: the six
> `summary.png` visual references (pinned Linux pipeline) and the release.

Paste everything below this line as the goal.

---

Work in `ksamint/taff01` on `feat/v0.2.21-report-design` from `main`. Read
first: `AGENTS.md`, `instruction_v0.md`, `docs/spec/daily-summary.md`,
ADR 0027, 0029 (with amendment 1) and 0030, `docs/release-closeout.md`,
`backend/crates/taff-render/src/lib.rs`, `packages/core/src/summary-text.ts`,
`apps/worker/src/summaries.ts`. One card, one commit. TypeScript or Rust
only. Every user-facing string goes through i18next in en, zh-CN and zh-HK;
Rust never formats a date, number or currency. Milestone ≤ 40 lines, push,
continue.

## Why

v0.2.19 shipped text and PNG renders, but the PNG is the text render
rasterized line by line: grayscale, one font size, a character-count wrap
that splits label and value ("Due / today: 2"), the progress bar detached at
the card's foot, risk shown as a bare word, no hierarchy, the full hash
printed as body text. The text render has the same flat structure. The
content, the tag-based audience, the finance and names switches and the
access checks are right and stay unchanged.

## R1 — Layout contract (TypeScript)

- `packages/core/src/summary-layout.ts`: pure
  `buildSummaryLayout(snapshot, watermark, contentHash, createdAt, locale,
  timeZone, t)` → `SummaryLayout` (shared Zod schema
  `summaryLayoutSchema` in `packages/schemas/src/summaries.ts`, emitted to
  `packages/schemas/generated/summary-layout.json` by `pnpm schema:gen`).
- The layout carries only display-ready strings and numbers: `header {title,
  audience ("Shareholder · Harbour Capital"), workspace, localDate}`,
  `kpis[] {label, value}` (projects, open, completed today, due today,
  overdue, blocked, in review), `projects[] {name, number, stageLabel,
  risk {level: low|medium|high, label, reasons[]}, meta[] (lead, due),
  progress {percent, label}, finance? {percent, label}, agentRuns?
  {label}, sections[] {title, count, items[] {number, title, person?,
  due, overdue}, more?}}`, `footer {generated, watermarkText, hashShort,
  hashFull}`. All formatting (dates, currency, percent, plurals) happens
  here with `Intl` in the recipient's locale and zone.
- `renderSummaryText` (text-2) is rebuilt on the layout (R3) so text and
  image cannot drift.
- Tests: three locale goldens of the layout JSON; schema round trip; no
  `comment`, `email` or `token` key; finance and names switches remove their
  fields. Generator registered in `pnpm rust:fixtures`.
- Commit: `feat(core): display layout for summary renders`.

## R2 — Designed image (Rust)

`backend/crates/taff-render`, renderer version `image-2`, input
`{layout, watermark, contentHash}` validated against the generated layout
schema; the old `{text, ...}` input stays accepted for one release
(`image-1`) so a worker/renderer version skew cannot fail a render.

- **Text measurement.** Replace the character-count `wrap` with real
  advances: shape each run with `rustybuzz` (MIT) over the `fontdb` faces
  already loaded, choose the face per code point (Manrope for Latin, Noto
  Sans SC/TC for CJK by locale), break at spaces and between CJK
  characters, never inside a ` · `-joined pair, ellipsize titles at two
  lines.
- **Palette.** From the TABLE AI tokens in
  `apps/web/src/styles/tokens.css`, exported by R1's generator to
  `backend/crates/taff-render/tokens.json` (never a second palette): ink
  `#1b1b1d`, ink-variant `#44474c`, surface `#fbf9fa`, container
  `#f0edef`, accent gold `#a88b52` / deep `#785f2a`, success `#2f5d4e` on
  `#e3eee9`, warning `#8a5a12` on `#f6ebd7`, error `#ba1a1a`. Risk badge:
  low = success, medium = warning, high = error. Colour PNG (RGB), not
  grayscale.
- **Structure, 1080 px wide, 56 px margins, 8 px grid.**
  1. Header band (container colour, gold rule 4 px at the top): title
     40/600, audience chip (gold-mist fill, gold-deep text), workspace and
     date 24/400 ink-variant.
  2. KPI row: up to seven tiles in a 4 + 3 grid, value 44/600, label
     20/500 ink-variant; overdue and blocked tiles turn warning or error
     when non-zero.
  3. Project cards (surface, 1 px container-highest border, 16 px radius):
     name 30/600 with `#number` 22/500 ink-variant; right-aligned risk
     badge; meta line (lead · due) 22/400; progress bar 12 px with its
     percent label at the right end; finance bar (collected of contract)
     only when present; agent-run line; sections with a 22/600 heading and
     count pill, items 22/400 with the task number in tabular figures,
     person and due, overdue items' due in error colour; `+N more` when
     truncated; risk reasons as a small warning list under the badge.
  4. Footer: generated time and zone, watermark text, short hash
     (`405ddea3…3c21`) in 18/500 monospace digits; the full hash goes into a
     PNG `tEXt` chunk `taff:content-hash` and stays in the text render.
  5. Watermark: the existing diagonal repeat at 10% opacity, drawn last.
- **Budgets.** ≤ 400 KB (ADR 0029 decision 2), height ≤ 16,000 px; render
  time ≤ 300 ms for the golden on the release machine.
- **Tests (`cargo test`, `pnpm rust:gate`).** Three locale goldens replaced
  and reviewed by eye in the milestone (attach the three PNGs); perceptual
  hash tolerance unchanged; a long-name case (two-line ellipsis, CJK user
  names outside UI vocabulary, already a regression case); a 20-item
  truncated section; no-finance and no-names variants; size cap; schema
  rejection; `tEXt` chunk equals the content hash; `image-1` input still
  renders.
- Licences in the commit message: `rustybuzz` MIT; nothing else new.
- Commit: `feat(render): designed colour summary layout (image-2)`.

## R3 — Designed text (TypeScript)

`renderSummaryText` text-2 from the layout, plain text for WeChat (no
Markdown, no emoji):

```
Daily progress · Shareholder · Harbour Capital
Northwind · 2026-10-08
────────────────────────────
Projects 1 · Open 9 · Done today 1 · Due today 2
Overdue 0 · Blocked 1 · In review 2

▌Checkout v2 (#12) · In service · Watch
Lead Alex Chen · Due Oct 15, 2026
Progress 60% · Collected 40% (HK$512,000 of HK$1,280,000)
Agents: 1 finished today, 2 waiting for review
Completed today (1)
  1. #135 Task NW-135 · Mia Wong · Due Oct 6
...
────────────────────────────
Generated Oct 8, 2026, 8:00 PM (Asia/Hong_Kong)
Pat Lee · Harbour Capital · 2026-10-08 · 405ddea3
Hash 405ddea38bb8513c2ab87c3afb96f4317ef016074d47cd2aea0db06e41303c21
```

zh-CN and zh-HK use 【】 for project headings and full-width separators.
Wrap at 36 full-width or 72 Latin columns at token boundaries only; never
split `label value`. ≤ 4,000 characters with `…(+N)` per capped list.
Three goldens replaced. Commit: `feat(core): designed plain-text summary
(text-2)`.

## R4 — Worker, stored renders, re-render

- The worker sends `{layout, watermark, contentHash}` to the renderer and
  stores `rendererVersion` `text-2` / `image-2`.
- Renders stay immutable per `(summaryId, format)`. Existing v0.2.19–v0.2.20
  renders keep their bytes; no backfill (the content hash covers the
  snapshot, not the pixels). New summaries get the new design.
- Tests: worker processor with a fake renderer asserting the new body;
  integration: version strings stored.
- Commit: `feat(worker): render summaries from the display layout`.

## R5 — Web and public page parity

- `SummaryDocument` (web and `/s/[token]`) reads the same layout so screen,
  text and image show the same structure; KPI row and risk badge use the
  existing tokens. No new client dependency; public page JavaScript must
  not grow (record the number; 187.7 KiB today).
- `e2e/summaries.spec.ts` three locales: KPI values equal the layout's.
- Commit: `feat(web): summary document from the shared layout`.

## R6 — Spec

`docs/spec/daily-summary.md` DS-8.2 and DS-8.3 rewritten to the layout,
DS-8.7 version coexistence (`image-1` accepted for one release), acceptance
rows for R1–R5. Same commits as the behaviour.

## P1–P4 — Python ports (ADR 0030 decision 3)

Each removes its path from `pendingPythonPorts` in
`scripts/language-policy.test.ts` in the same commit.

- P1 `scripts/deploy/neighbor_preservation.py` + test →
  `scripts/deploy/neighbor-preservation.mts` + Vitest. Same CLI flags,
  stdout JSON and exit codes. The v0.2.21 closeout runs both on the same
  sanitized snapshots and records identical verdicts; `release-closeout.md`
  check 3 names the `.mts` from v0.2.22. Commit: `refactor(deploy): neighbour
  preservation in TypeScript`.
- P2 `e2e/live/email-proof.py` → `e2e/live/email-proof.mts`, imported by
  `live.ts` (no child process); stdout never logged; the proof case and the
  147-case discovery pass. Commit: `refactor(e2e): in-process e-mail proof`.
- P3 `docs/audit/verify.py` → `scripts/audit-contract.test.ts` in `pnpm
  test`; break a fixture to show it fails, restore. Commit: `test: audit
  contract checks in Vitest`.
- P4 `scripts/ui/subset-fonts.py` → `backend/crates/taff-fonts` (binary,
  `subsetter` or `allsorts`, MIT/Apache-2.0) writing both the web WOFF2
  subsets and the renderer TTFs; glyph sets per file equal to the current
  outputs (`fonts.test.ts`, renderer CJK goldens). If no permissive crate
  reaches identical glyph sets, record it in the milestone and keep the
  Python file listed, unchanged. Commit: `feat(fonts): Rust font subsetter`.

## Release

Versions 0.2.21; CHANGELOG; `docs/deploy.md` candidate (no migration, no
new env var, renderer image changes, `image-1` compatibility for one
release); local gate per `docs/release-closeout.md` check 1 including
`pnpm rust:gate` and four image builds; operator closeout. Live acceptance
stays read-only; the owner creates the first real summary.

## Owner steps to switch Twin delivery on (not agent work)

Twin delivery is inactive until a real audience exists. In Taff: an admin
creates the audience tag (`/orgs/summaries`), tags projects (project edit
dialog), adds a recipient with language, zone and delivery time, and
leaves finance and names at the defaults or changes them. In Twin: add the
`taff_summaries` source profile for that workspace and recipient chat
(fenshen01 plan T2–T4). The Twin token already holds `summaries:read` in
all three organizations (milestone 102).
