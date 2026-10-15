# Manual contrast adjudication — v0.2.1 audit

18 local contexts (Calendar phone+desktop × 3 locales × 2 themes, desktop Relations × 3 locales × 2 themes), exactly 216 manual observations reproduced. Original 348-context audit's 216 manual items are fully located: Calendar 36; Relations 180. Instrumentation and screenshots are local only; no production/shared audit profile writes.

## Verdict

- Calendar: all 36 observations pass an analytical bound over the computed opaque repeating-linear-gradient stop colors. No bitmap images are involved. Minimum ratio 8.4431:1 vs required 4.5:1; selectors `.calendar-event-title` and `.calendar-event-time` under `.calendar-engine-day .taff-agent-event`. Foregrounds light #0a1626/#44474c, backgrounds #fff/#f5f3f4; dark #f3f0f1/#bbc7dd on #0a1626/#122034. Source: `apps/web/src/styles/calendar.css:86`; `apps/web/src/components/calendar-scene.tsx:225`.
- Relations: **P2, real edge/text overlap contrast**. 18 of 180 observed label states have underlying painted pixels below 4.5:1, all in dark mode. Worst observed 2.6338:1, label `張穎`, fill rgb(228,226,227), background rgb(128,140,161), desktop English pixel (269,492). These are **pixel-backed visual-review findings**, not a claim to reconstruct full WCAG semantics from a flattened image. Source: `apps/web/src/components/relations-view.tsx:467` paints edges before text; `:510` labels; `apps/web/src/styles/relations.css:171` fills labels without an opaque underlay.

## Method and limits

The Relations canvas has 48px grid backgrounds: source `apps/web/src/styles/relations.css:78`. Its transparent grid lines alone compose to >=12.5021:1 light and >=9.0243:1 dark against text-body (including two lines at grid intersections), so checking background tokens alone would falsely pass. Graph edges can cross behind labels and add brighter/darker backgrounds. The full per-item ancestor/style/token/location records are in `manual-contrast-ledger.json`.

For each of six desktop Relations frames, capture the normal frame and another with only SVG label text visibility hidden (layout and edge geometry unchanged), restore visibility, then compare same pixels. Use computed SVG fill, and retain only changed glyph pixels with estimated coverage >=90% to avoid treating anti-aliased fringes as foreground. Measure fill versus actual background in those samples. Per-item minimum ratios and exact pixel coordinates are retained in `manual-contrast-before-pixels.json`. Text with no qualifying samples remains explicitly unsampled. This scope covers the captured default graph states, not every drag/selection/zoom combination.

Raw local screenshots remain in the private operator evidence directory. No unknown bitmap content was encountered. Proposed repair: an opaque background-colored SVG text stroke painted behind the fill; keep graph layout, labels and edge semantics unchanged, then rerun the same pixel review.

## Repair verification

Focused Relations-only repair adds `paint-order: stroke`, `stroke: var(--bg)`, `stroke-width: 3px`, `stroke-linejoin: round` to `.relations-label` (no graph geometry, edge, layout or label change). In the same six desktop locale/theme contexts, all 180 labels have qualifying glyph samples and none fall below 4.5:1. Minimum observed ratios are 14.0929:1 dark and 17.1974:1 light. After screenshots hide only text **fill**, retaining the opaque stroke underpaint, so the background includes the actual halo beneath each glyph. Original labels had no stroke, making the earlier visibility-hidden baseline equivalent. This is pixel-backed visual review of the captured states, not a guarantee for every possible selection/drag state.

Fixed raw screenshots remain private; per-label after pixel data: `manual-contrast-after-pixels.json`. Calendar's separately adjudicated 36 observations remain analytically passing; no Calendar contrast styling changed.
