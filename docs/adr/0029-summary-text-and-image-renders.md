# 0029 — Daily summary as text and image, rendered in Rust, readable by agents

Date: 2026-11-05. Status: accepted for implementation (owner: "the daily report in txt, image
(use rust solution) format is on", "let fenshen using mcp visit all
authorized workspace and projects and all"). Follows ADR 0027 (summary model
and watermark), ADR 0026 (Rust migration, phase 1 foundation) and ADR 0028
(organization-wide grants). Supersedes ADR 0027 decision 4 (agents denied
summary reads) for read-only tools.

## Context

A daily summary is one immutable row per recipient and local day with a
snapshot, a watermark and a content hash (ADR 0027), rendered only as a web
page. The owner wants every summary also available as plain text and as an
image, so that Twin (fenshen01) can post it into WeChat private and group
chats, where a page link is not read and an image is. Twin already sends
image bubbles through its media module and reads Taff over MCP with an
approved read-tool profile (`notifications/mcp_source.py`, `taff_tasks`).

Constraints: the snapshot is the single source; the watermark and hash must
appear on every rendering; no new client dependency; Rust components read
the same contract and never own data until cutover (ADR 0026); agents never
get a write path a person lacks; three locales; no secret in any render.

## Decision

1. **Text render is a pure TypeScript function now, Rust twin later.**
   `renderSummaryText(snapshot, watermark, contentHash, createdAt, locale,
   t)` in `packages/core/src/summary-text.ts` produces a fixed, line-based
   layout (title, organization, date, per-project block, totals, watermark
   line, hash line), at most 4,000 characters, wrapped for WeChat. Golden
   files in en, zh-CN and zh-HK; added to `pnpm rust:fixtures`.
2. **Image render is a Rust service.** `backend/crates/taff-render` (axum,
   `resvg` + `usvg` + `tiny-skia` + `fontdb`, all MIT) listens on an
   internal port only and answers `POST /render/summary` with
   `{snapshot, watermark, contentHash, createdAt, locale}` → `image/png`,
   1080 px wide, height by content, ≤ 400 KB, with the diagonal watermark
   layer and the hash footer drawn into the pixels. Fonts are TTF subsets
   produced by the existing `scripts/ui/subset-fonts.py` pipeline (Noto Sans
   SC/TC, Manrope, OFL) committed under `backend/fonts/`. The service holds no
   credentials, reads no database and keeps no state; it is the first Rust
   runtime component and ships as `deploy/Dockerfile.render`, service
   `render` in Compose, no Caddy route.
3. **Renders are stored beside the summary.** Table `summary_renders`
   `{id, workspaceId, summaryId, format CHECK ('txt','png'), body text |
   bytes bytea, byteSize, rendererVersion, contentHash (of the summary),
   createdAt}`, unique `(summaryId, format)`, immutable like the summary.
   The worker enqueues one `summary-render` job per generated summary
   (stable id, 3 attempts); txt renders in the worker, png calls the service
   with a 10 s timeout; a failed png leaves a `render_failed` activity row and
   the next scan retries once a day. Both formats are generated for every
   summary ("on" by default); `SUMMARY_RENDER_URL` unset disables png only.
4. **Delivery.** REST `GET /api/summaries/:id/render?format=txt|png`
   (`summary:read`); the public read `POST /api/shared-summary` accepts
   `format` and the page `/s/[token]` offers "Copy text" and "Save image";
   MCP tools `summaries.list`, `summaries.get` (`format: json|txt`) and
   `summaries.image` (MCP image content, base64 PNG), all read-only, all
   through core and `can()`.
5. **Agent access.** New scope `summaries:read` on tokens and grants.
   `summary:read` allows an agent only when the token's effective grant for
   the workspace carries `summaries:read`; `summary:share`, `summary:preview`
   and `audience:*` stay denied to agents. Twin's policy grants (ADR 0028)
   carry the token's scopes, so one scope change enables summaries in every
   organization.

## Consequences

- Additive migration: `summary_renders`; scope enum gains `summaries:read`
  (`packages/schemas/src/primitives.ts`, a CHECK if one exists).
- `docs/spec/daily-summary.md` gains DS-8 (renders) and DS-9 (agent reads).
- The Rust gate runs `taff-render`'s tests: a golden PNG per locale compared
  by perceptual hash, and the text golden parity once the Rust text twin
  exists.
- Compose gains a fourth application image; the closeout checklist's image
  list grows by `deploy/Dockerfile.render`.
- Twin needs a `taff_summaries` source profile and an image-capable
  delivery; recorded for fenshen01's plan.

## Open decisions

1. PNG width 1080 and the 400 KB cap (WeChat compresses above ~1 MB).
2. Whether to also keep an SVG render (smaller, text-selectable) for the web
   page's "Save image" instead of PNG only.
3. Retention of renders: same as summaries (keep; archive by tag).

## Implementation calibration (2026-11-06)

The server font subsets retain the available CJK character coverage of the same
pinned source fonts in addition to the web vocabulary. Organization, recipient
and task names are user data and cannot be constrained to UI labels; a glyph
regression checks names such as 侍天 and 饕餮. This adds no client font payload.
Local Docker publishes the internal port3002 only on loopback56302, avoiding
an existing local service on3002. Production has no published renderer port.

## Amendment 1 — 2026-11-06: designed layout

Status: accepted and implemented on `main` (milestone 106); release v0.2.21 pending.
The image is an 8-bit palette PNG (NeuQuant via `color_quant`, MIT, already
in the lockfile) because colour RGB averaged 112 bytes per pixel row; the
worker fits layouts under a 3,400-pixel estimate so the densest image stays
under 400 KB (worst case 3,088 px, 296 KB). Weights are drawn with a hairline
stroke because the bundled font subsets are single-weight; shaping comes from
usvg's own text layout, so no `rustybuzz` dependency was added. The v0.2.19 image is the text render rasterized line by
line in grayscale (milestone 105). Decisions 1 and 2 are refined:

1. A pure TypeScript `buildSummaryLayout` turns the snapshot into
   display-ready strings and numbers in the recipient's locale and zone
   (`summaryLayoutSchema`, emitted as JSON Schema). Both renders consume it,
   so text and image cannot drift and Rust still formats nothing.
2. `taff-render` draws the layout as a colour document from the TABLE AI
   tokens (header band, KPI tiles, project cards with risk badges and
   labelled progress and finance bars, sections, footer with a short hash and
   the full hash in a PNG `tEXt` chunk), with shaped text measurement
   (`rustybuzz`, MIT) instead of a character-count wrap.
3. Renderer versions `text-2` and `image-2`; the `image-1` input stays
   accepted for one release; stored renders are never rewritten.

Plan: `docs/agent-goal-v0.2.21-report-design-and-ports.md` R1–R6.
