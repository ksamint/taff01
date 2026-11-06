# 106 — v0.2.21 report design: shared layout, text-2, colour image-2 (2026-11-06)

Branch `claude/nifty-pascal-tm5d5d` from `main` `1cfd7e6`. Not released. Plan:
[v0.2.21 goal](../agent-goal-v0.2.21-report-design-and-ports.md) R1–R4, R6.

## Works

- `buildSummaryLayout` (core) turns the snapshot into one localized display
  layout (`summaryLayoutSchema`, emitted as JSON Schema). Text and image both
  read it, so they cannot drift; Rust still formats nothing.
- `text-2`: title and audience, KPI line, per-project heading with stage and
  risk, reasons, lead and due, progress and finance, agent runs, counted
  sections with indented items, then time, watermark and full hash last.
  Breaks only between `label value` tokens; omissions read "+N more".
- `image-2` (Rust): header band with gold rule and audience chip, seven KPI
  tiles (overdue/blocked toned), project cards with risk badge, labelled gold
  progress and green finance bars, sections with count pills, footer with
  short hash; full hash in PNG `tEXt` `taff:content-hash`. TABLE AI tokens
  only. Shaped measurement via usvg; titles clamp to two lines with "…".
- 8-bit palette PNG: goldens 1080×1820, 110–113 KB (were 96 KB grayscale).
  Worker fits under a 3,400 px estimate; densest fitted case 3,088 px, 296 KB.
- Renderer answers `x-taff-renderer`; `image-1` text input still renders for
  one release; the worker stores only `image-2` PNGs. Old renders unchanged.
- Spec DS-8.2, DS-8.3, DS-8.7; ADR 0029 amendment 1 accepted.

## Missing

- R5 web and public page from the shared layout; P1–P4 Python ports; release.
- Renderer image build (`deploy/Dockerfile.render`), e2e, MCP smoke, release
  stack and checklist: not run here (no Docker); the operator's gate runs them.

## Validation (Node 26.13.0, PostgreSQL 18.6, Redis 7.0.15, Rust 1.97, this container)

| Check | Result |
| --- | --- |
| `pnpm test` | 136 files, 2,213 tests passed (+8: layout 7, worker 1) |
| `pnpm rust:gate` | fixtures clean, fmt, clippy, 29 Rust tests (+4), licences ok |
| Lint, licence gate, six package and root typechecks | clean |
| Web production build, `build:server` | passed |
| Today initial JS | 197,396 bytes gzipped (192.8 KiB of 200) |
