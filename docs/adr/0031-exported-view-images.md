# 0031 — Exported view images for the workspace overview and a project

Date: 2026-11-12. Status: accepted and implemented on `main` (milestone 117);
not yet released. Owner request: "ensure workspace, project views can save as
optimized image for export and send". Follows ADR 0029 (summary renders in
Rust) and ADR 0021 (finance visibility).

## Context

People pass project status into chat apps (WeChat groups, Slack) where a link
is not read and an image is. Only the daily summary had an image (ADR 0029),
and only for configured shareholder recipients. The workspace overview
(`/projects?all=1`) and a project (`/projects/:id`) had no export at all
(GUI alignment review, milestone 117).

Constraints: no new client dependency over 20 KB (instruction_v0); CJK must
render in every locale, while the web ships only subset fonts; one permission
function; no stored artifact without a retention decision; nothing the
exporter cannot already read.

## Decision

1. **Draw on the server with the existing renderer, not a browser
   screenshot.** A DOM-to-canvas capture would need a library or fragile
   `foreignObject` inlining, would miss CJK glyphs outside the web subsets,
   and would vary by device. Core builds the same `summaryLayoutSchema`
   document the daily summary uses (`buildDailySummary` → `buildSummaryLayout`
   → `fitSummaryLayout`) from live data, and `taff-render` draws it unchanged:
   1080 px, 8-bit palette PNG, ≤ 400 KB, `tEXt` content hash. No Rust change.
2. **Read with the exporter's own rights.** New action `view:export`: people
   who are members or admins of the workspace; guests and agents are denied
   (guests have their summaries, agents `summaries.image`). Finance appears
   only when `finance:read` allows it. The overview takes every non-archived
   project (≤ 100, as summaries); a project export may name an archived one.
3. **Bind every copy to its exporter.** The watermark reads
   `exporter · workspace · local date · export`; the header and footer say
   "Exported by <name>" and the export instant in the exporter's zone; the
   content hash is the canonical-JSON hash of the snapshot.
4. **Nothing is stored.** `GET /api/workspaces/:id/view-image?locale=&projectId=`
   renders on request, `Cache-Control: private, no-store`, rate-limited to 10
   per person per minute in Valkey (fail closed). The API gains
   `SUMMARY_RENDER_URL` (same internal value as the worker); unset answers 503.
5. **Send through the platform.** The dialog previews the PNG and offers Send
   (Web Share API with a file, shown only when `navigator.canShare` accepts
   it), Copy image (`ClipboardItem`) and Save (download).

## Consequences

- No migration, no new dependency, no MCP tool change (37 tools).
- Deploy: the API container needs `SUMMARY_RENDER_URL=http://render:3002`;
  the renderer stays internal with no Caddy route.
- The renderer now serves interactive requests as well as worker jobs; the
  per-person limit and the 10 s timeout bound that load.

## Open decisions

1. Whether exports write an audit row (who exported which view, when). The
   watermark identifies a leaked copy; an audit row would list exports.
2. Whether agents get a `views.image` MCP tool for Twin to post project
   images (needs a scope and grant decision like ADR 0029 decision 5).
3. Exports of the calendar, timeline chart and mind map as drawn (a picture
   of the screen) rather than the status report document.
