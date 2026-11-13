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

All three were decided by the owner on 2026-11-13 ("yes for all"); see
Amendment 1.

## Amendment 1 — 2026-11-13: owner decisions

Status: accepted; implementation planned in the
[v0.2.24 goal](../agent-goal-v0.2.24-view-export-and-alignment.md) (E2, E3, S1–S3).

1. **Exports are audited.** Every authorized export snapshot built by core writes one `activity` row
   `view.export` in the workspace (actor, scope, project id, locale, content
   hash, project count, finance shown, channel `web` or `mcp`). It is a read,
   so it emits no change event and invalidates no cache. `/orgs/audit` lists it.
   This records snapshot construction, as E2 specifies, before rendering or
   delivery; it is not a receipt that a PNG reached the caller. Invalid input
   and authorization or project refusals write nothing.
2. **Agents export over MCP.** Tool `views.image` (read-only) returns the same
   PNG as an MCP image block. `view:export` allows an agent only when its
   token's effective grant for the workspace carries both `tasks:read` and
   `summaries:read` (the scope ADR 0029 already gives Twin for status images);
   finance follows the existing agent `finance:read` rule. The watermark and
   the audit row name the agent. No new scope. Tools: 37 → 38.
3. **Screen exports are drawn on the server too.** The timeline chart, the
   calendar (week and month) and the mind and relations graphs export as
   images from typed layouts built in TypeScript (`packages/schemas`, emitted
   as JSON Schema) and drawn by new `taff-render` modules; never a DOM
   capture or client-supplied SVG, so the watermark and the data stay
   server-authored. Each layout has row or node caps with localized "+N more",
   a width and height cap and the 400 KB cap.
4. **Workspace archive gets a screen and a restore** (goal A4): archive stays
   `workspace:archive` (workspace admin or system admin, never a personal
   workspace); a new restore reverses it with the same rule; the archive
   confirmation names the workspace and what members lose.

## Amendment 2 — OAuth refresh scope ceiling

E3 adds nullable `agent_tokens.refresh_scopes` (migration 0043). Access scopes
may narrow on refresh; rotated refresh credentials retain the original ceiling,
and omitted/empty scope restores that ceiling. Legacy null falls back to scopes.
Every refresh and member restore rechecks authority against the ceiling; OAuth
approval UI shows the ceiling, while access checks use current scopes. Unknown
or expanding requested scopes are refused without consuming the credential.
This follows [RFC 6749 section 6](https://www.rfc-editor.org/rfc/rfc6749#section-6):
access may narrow, but rotated refresh scope must remain identical. Old images
tolerate the nullable added column; rollback retains it and its data. No new
dependency, renderer change or permission scope. Tool count is now 38.

## Amendment 2 — timeline export integration

The S1 candidate adds strict `view=overview|project|timeline` to the existing
REST/MCP query; omitted view keeps projectId-based summary behavior. Timeline
requires a project and accepts only `criticalPath=show|hide` (default show).
The current screen has no row/date filter. Its day/week zoom is a horizontal
browser scale, so the export always fits the complete capped chart to 1600 px;
the critical-path highlight is preserved. Explicit overview/project selections
and timeline options cannot be mixed ambiguously.

Core calls the existing authorized `getTimeline` with the caller's principal;
the saved human/token-issuer zone determines civil dates. Canonical snapshot
hashing includes project, locale, zone and normalized highlight option, exporter
and workspace labels. No timeline finance is rendered or hashed. The existing
snapshot audit records scope timeline, projectCount 1 and finance false before
rendering, using the same trusted web/MCP channel and quota. No scope or
permission rule changes. The shared renderer helper selects `/render/timeline`;
the existing export dialog handles its PNG. Calendar and graphs remain separate.
