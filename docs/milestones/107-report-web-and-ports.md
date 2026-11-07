# 107 — v0.2.21 R5 web page from the layout; Python ports (2026-11-07)

Branch `claude/nifty-pascal-tm5d5d` after [106](106-report-design.md). Not released.

## Works

- The builder moved to `@taff/schemas` (pure, shared with web); core re-exports
  it. The layout gains task and project ids, the tag label in the audience,
  "prepared for", a full localized date, forecast and slip when behind plan,
  an empty-state line and a confidential footer, so web, text and image say
  the same thing. The densest fitted PNG is 3,054 px, 292,857 bytes.
- R5: the in-app page, admin preview and public `/s/[token]` page render the
  layout: audience chip, KPI tiles (blocked/overdue toned), cards with risk
  badge, ARIA progress and finance bars, counted sections, task links in app.
  Share-page client JS 200,842 vs main 200,839 gzip bytes (same manifest method).
- P1 `neighbor-preservation.mts` replaces the Python check: 6,000 random cases
  gave identical full reports before deletion; 10 Vitest cases incl. CLI exit
  code; closeout checklist check 3 names it.
- P2 `email-proof.mts` runs in process; remote command byte-identical to `shlex.join`; 4 tests.
- P3 `audit-contract.test.ts` replaces `verify.py`. The pack's references are
  read from its pinned commit `55718da`; exactly 12 rows point at that
  snapshot's uncommitted tree (dirty_tree: true), as `verify.py` also reports.
- P4 kept: Noto Sans variable fonts need fvar/gvar/HVAR/avar/STAT and GSUB/GPOS;
  `allsorts` 0.17 keeps none of them. Recorded in ADR 0030.

## Missing

- Six `summary.png` visual references: recapture on the pinned build-1248 Linux pipeline (host has 1243).
- Release v0.2.21; renderer image build; MCP smoke; release checklist.

## Validation (Node 26.13.0, PostgreSQL 18.6, Redis 7.0.15, Rust 1.97, Chromium 1243)

| Check | Result |
| --- | --- |
| `pnpm test` | 138 files, 2,231 tests passed |
| `pnpm rust:gate` | fixtures stable, fmt, clippy, 29 tests, licences ok |
| Lint, licence gate, six package and root typechecks | clean |
| Web build, `build:server`, Today JS | passed; 197,395 bytes gzipped |
| `e2e/summaries.spec.ts` (renderer live) | 3 passed |
| Full `pnpm e2e`, three locales | running at this commit; recorded before merge |
