# Spec: Exported view images

Living product specification for exporting the workspace overview and a
project as one image ([ADR 0031](../adr/0031-exported-view-images.md),
milestone 117). This file states the current contract; the ADR holds the
decisions. Change this file in the same commit as the behaviour it describes.

Status: overview/project and agent exports are released in v0.2.24 (`ff411c6`). Timeline, calendar, mind and relations are implemented for v0.2.25 and unreleased.

## Users and roles

| Role | Can |
| --- | --- |
| Admin | Overview, project, timeline, calendar, mind and relations images; finance follows `finance:read` for summary images |
| Member | Overview, project, timeline, calendar, mind and relations images; finance follows `finance:read` for summary images |
| Guest | Nothing; no export button, and the API refuses |
| Agent | Live image through `views.image` with both tasks:read and summaries:read |

## Requirements

### Content (VE-1)
- VE-1.1 When a person exports the workspace overview, the image shall list every non-archived project of that workspace by name, at most 100, as the daily summary does.
- VE-1.2 When a person exports a project, the image shall contain exactly that project, archived or not; a project of another workspace or an unknown id shall answer `not_found`.
- VE-1.3 The image shall be built from the live data at the export instant with the summary model: KPIs, per-project risk, progress, completed/moved/due/overdue/blocked lists and agent runs, in the requested locale and the exporter's time zone.
- VE-1.4 Finance shall appear only when `can(actor, "finance:read")` allows it.
- VE-1.5 The header shall read "Workspace overview" or "Project status", "Exported view", the workspace name and "Exported by <name>", in en, zh-CN or zh-HK.
- VE-1.6 The footer shall carry "Internal. Exported by <name>.", the export instant and zone, and the content hash; the watermark shall read `<exporter> · <workspace> · <local date> · export`.
- VE-1.7 The content hash shall be the sha256 of the snapshot's canonical JSON, so unchanged data gives the same hash and any change gives a new one.
- VE-1.8 When core builds an authorized export snapshot, it shall record one `view.export` activity row in its own transaction, attributed to the exporter and project or workspace. Details shall contain only `scope`, `locale`, `contentHash`, `projectCount`, `finance` and the trusted adapter's `channel` (`web` or `mcp`). Invalid input and permission or project refusals shall write nothing; the audit insert shall emit no realtime notification.

### Access (VE-2)
- VE-2.1 The action `view:export` shall allow people who are members or admins of the workspace and deny guests and non-members. Agents follow VE-2.3.
- VE-2.2 When a member is demoted to guest, the next export shall be refused; when restored, allowed again.

- VE-2.3 Every `views.image` call shall resolve the current token and workspace grant and require both tasks:read and summaries:read. Strict arguments include optional workspaceId, locale and the view-specific options in VE-4, VE-5 and VE-6; omitted locale and time zone use the saved token issuer. Finance follows finance:read for summary images. The PNG watermark, Unicode-safe filename metadata and mcp audit identify the agent. Revoked tokens/grants, missing scopes and unauthorized workspaces shall be denied. REST and MCP share the 10 s renderer and 10/member/minute quota across tokens; unavailable services fail closed with visible MCP errors and failed call logs.

### Delivery (VE-3)
- VE-3.1 `GET /api/workspaces/:id/view-image?locale=<en|zh-CN|zh-HK>[&projectId=<id>]` shall require a session and validate the id and a strict query before any count or read.
- VE-3.2 The route shall count one hit per person per minute in Valkey under a hashed key, refuse above 10 with 429 and `Retry-After: 60`, and answer 503 when the count fails.
- VE-3.3 The route shall post `{layout, watermark, contentHash}` to the internal renderer with a 10 s timeout and return `image/png` with `Cache-Control: private, no-store`, `nosniff`, an attachment name `taff-<workspace|project|timeline|calendar|mind|relations>-<date>-<hash8>.png` and `X-Taff-Content-Hash`.
- VE-3.4 Without `SUMMARY_RENDER_URL` the route shall answer 503 `render_unavailable`; a renderer error, a non-PNG answer or a timeout shall answer 502 `render_failed`.
- VE-3.5 Overview/project summary images shall be 1080 px wide, a palette PNG of at most 400 KB, fitted under the 3,400 px height budget (ADR 0029). Timeline images follow VE-4.3; calendars follow VE-5.6.
- VE-3.6 The projects header shall show an Export image button to confirmed non-guests for summary views; timeline, mind and relations use their own toolbar controls and suppress the duplicate summary button.
- VE-3.7 The dialog shall preview the image with its width and size, and offer Send (only when `navigator.canShare` accepts the file), Copy image (only when `ClipboardItem` exists) and Save (always); Escape closes it and returns focus to the button.

### Timeline exports (VE-4)
- VE-4.1 The internal `POST /render/timeline` shall accept only the generated `timeline-image.json` display contract and report `X-Taff-Renderer: timeline-1`.
- VE-4.2 The pure `buildTimelineLayout` builder shall retain the first 60 rows in `getTimeline` order, remove dependencies with omitted endpoints, and receive localized title, subtitle, today, footer, date and overflow labels from its caller.
- VE-4.3 The chart shall fit civil dates, inclusive task bars, milestone diamonds, dependency arrows, forecasts and today to 1600 px; output shall be a palette PNG at most 400 KB and 4000 px high.
- VE-4.4 The renderer shall validate bounded coordinates, strings and arrays before raster allocation, escape text, reject mismatched footer/watermark hashes, and embed the full hash in a PNG text chunk.
- VE-4.8 Timeline rendering shall use the approved TABLE AI light palette in `apps/web/src/styles/tokens.css`, preserving gold normal/progress marks and error-coloured risk/slip marks.

- VE-4.5 REST and MCP shall accept `view=overview|project|timeline`, with graph selections defined in VE-6; omitted view preserves projectId-based summary behavior. Project/timeline require projectId; explicit overview refuses projectId. `criticalPath=show|hide` applies only to timeline and defaults to show; unknown or irrelevant options shall be refused.
- VE-4.6 Core shall read the project through authorized `getTimeline` in the saved viewer/token-issuer zone, and bind the canonical hash to the snapshot, project, locale, zone and normalized highlight option. Timeline images contain no finance; their snapshot audit shall use `scope=timeline`, `projectCount=1`, `finance=false` and the trusted adapter's channel.
- VE-4.7 The timeline toolbar shall show one Export image button to confirmed non-guests, export the current critical-path highlight, and fit the full chart independent of browser horizontal zoom. The existing preview/send/copy/save flow shall handle its 1600 px PNG.

### Calendar exports (VE-5)
- VE-5.1 The internal `POST /render/calendar` shall accept only the generated `calendar-image.json` display contract and report `X-Taff-Renderer: calendar-1`.
- VE-5.2 `calendarImageWindow` shall validate a visible civil date, week/month mode and viewer IANA time zone; weeks start Monday and months include complete surrounding weeks (28, 35 or 42 days), matching the calendar screen. Its `from` and exclusive `to` shall be converted separately from local midnight.
- VE-5.3 `buildCalendarLayout` shall split authorized `CalendarViewData` occurrences across intersecting civil days, clip at the window and day boundaries, deduplicate task/start occurrences, and preserve end-exclusive semantics across DST. Unscheduled tasks shall not appear.
- VE-5.4 Whole local-day spans starting at midnight and ending at a later local midnight shall occupy the separate all-day band, including 23/25-hour days. An end at `23:59:59.999` shall remain timed; the source has no all-day flag. A timed segment clipped at next-day midnight shall label its end as 24:00, preserving its actual DST instants.
- VE-5.5 Each day shall show at most eight items total, ordered all-day first then start, end and occurrence id, with a localized known omitted count. `source.truncated` shall produce a separate localized unknown-overflow note without inventing a count.
- VE-5.6 The palette PNG shall be 1600 px wide, at most 4000 px high and 400 KB; bounded layout validation, escaped text, matching footer/watermark hashes and embedded hash metadata shall precede delivery.

- VE-5.7 REST/MCP `view=calendar` shall require `calendarMode=week|month` and `visibleDate=YYYY-MM-DD`, reject projectId/criticalPath/client zone and irrelevant options, and query authorized `listCalendar` in the saved human/token-issuer zone. Hashes shall bind the normalized window, visible date/mode, locale, exporter and scheduled display data; no unscheduled tray data or finance is rendered/hashed. Snapshot audit shall use scope calendar, resource workspace, finance false and a deduplicated project count from scheduled source occurrences in the window (zero allowed).
- VE-5.8 Confirmed non-guests shall see the calendar Export image button only in week/month grid views, not day or list views. The current visible date and mode shall pass through the existing preview/send/copy/save flow and shared REST/MCP quota and audit pipeline.
- VE-5.9 Calendar rendering shall use the approved TABLE AI light tokens. Export reads shall omit the unscheduled tray query and its truncation via trusted internal scheduled-only mode; ordinary calendar reads retain the tray and combined truncation. Scheduled-row/occurrence overflow shall still show the export warning.

The caller imports `calendarImageWindow` and `buildCalendarLayout` from `@taff/schemas/calendar-image`.
Use `calendarImageWindow({mode, visibleDate, timeZone})` to obtain `startDate`, exclusive `endDate`, `from`, `to` and canonical `timeZone`; pass the instant range to authorized `listCalendar`.
Build with `(source, query, locale, labels, contentHash)`. Labels supply `title`, `subtitle`, `allDay`, `footer`, `sourceTruncated`, `date(civil)`, `weekday(civil)`, `time(startInstant, endInstant, viewerZone)` and `more(count)`.
Post `{layout, watermark: {text, contentHash}, contentHash}`. Core must bind the canonical hash to the authorized snapshot/window, format exporter attribution and timestamps, and apply permissions, audit and rate limiting.

### Mind and relations exports (VE-6)
- VE-6.1 The internal `POST /render/graph` shall accept only the generated `graph-image.json` display contract, validate matching footer/watermark/content hashes and projected geometry before pixel allocation, and report `X-Taff-Renderer: graph-1`.
- VE-6.2 The pure relations builder shall receive authorized `RelationGraph` data plus explicit layout, scope, project id, layers and force seed; it shall retain the first 150 visible nodes in shared web reading order before layout. Uncapped core graphs shall preserve web positions; truncated relation graphs shall be laid out on their retained subgraph and may move.
- VE-6.3 The pure mind builder shall receive authorized `MindMap` data and an explicit archived filter, retain the first 150 visible nodes in shared reading order, preserve web node/label/curve geometry and derive ring extent from all visible nodes.
- VE-6.4 Both builders shall deduplicate semantic edges, remove dangling endpoints, render at most 600 edges deterministically and show caller-localized exact omitted-node and omitted-edge counts, including edges dropped with omitted endpoints. Relations geometry shall use all unique edges between retained nodes before applying the render-only edge cap. Counts shall exclude nodes and edges hidden by selected layers or archived filters.
- VE-6.5 The builders shall receive localized header, footer, empty and overflow labels, with centre/ring labels for mind, and shall omit CRM details, notes, source URLs and linked-task content from the display contract.
- VE-6.6 Graph export fitting shall include label bounds without the interactive minimum-zoom clamp; output shall use the canonical web palette tokens and be a 1080 px palette PNG, at most 4000 px high and 400 KB, with the full hash in a PNG text chunk and a visible watermark.

- VE-6.7 REST and MCP shall accept `view=mind` with `archived=include|exclude` (default exclude); projectId and all timeline/relation options shall be refused.
- VE-6.8 REST and MCP shall accept `view=relations` with layout layered/force (default layered), scope workspace/project (default inferred from projectId), optional projectId, unique layers (default all four) and unsigned 32-bit forceSeed (default 7). Explicit project scope requires projectId; workspace scope forbids it. Archived/timeline options and all unknown fields shall be refused. HTTP layers use comma-separated names (empty means none) and seed uses canonical decimal digits; MCP uses an array and integer.
- VE-6.9 Core shall call authorized `getMindMap` or `relationGraph` with the current principal, preserving CRM permission checks. Hashes shall bind the sanitized visible layout, normalized options, locale, saved viewer/token-issuer zone, exporter and local date; hidden notes, sources, CRM details and finance shall neither enter the layout nor change its hash.
- VE-6.10 Graph exports shall use the shared quota, watermark, renderer delivery and snapshot audit with scope mind/relations, finance false and trusted web/MCP channel. Mind projectCount is zero; relations count the authorized visible source's project nodes. Demotion, scope loss, token/grant revocation and CRM capability loss shall take effect on the next export.
- VE-6.11 The mind and relations toolbars shall show one export button to confirmed non-guests, sending current archived/layout/scope/layer options and seed 7. Relations list mode shall hide the graph button. Pan, zoom, selection and list presentation shall not change graph geometry or hashes; export always fits the capped graph. The shared dialog shall preview/send/copy/save the PNG in all three locales.

## Non-functional

- Image binaries are not stored; only the allowlisted export audit metadata is retained. One additive nullable OAuth refresh-scope migration; no new client dependency; the CJK text is drawn with the renderer's server fonts, so the web font subsets do not limit names.
- Environment: the API reads `SUMMARY_RENDER_URL` (optional); the renderer stays internal with no public route.

## Out of scope in v1

- Final combined release validation and deployment remain outside this candidate integration.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| VE-1.1–1.7 | `packages/core/src/view-export.integration.test.ts` (5 cases, PostgreSQL) |
| VE-1.8 | `view-export.integration.test.ts` audit metadata/refusal/notification barrier case; `e2e/audit.spec.ts` in three locales |
| VE-2.1 | `packages/core/src/permissions.test.ts` (five `view:export` rows); `docs/spec/permissions-matrix.md` |
| VE-2.3 | `mcp-views.test.ts`, `view-export.integration.test.ts`, `oauth.integration.test.ts`, authorization matrix and MCP smoke |
| VE-2.2 | `view-export.integration.test.ts` "stops a demoted member…" |
| VE-3.1–3.4 | `apps/api/src/view-export.test.ts` (6 cases) |
| VE-3.5 | `e2e/view-export.spec.ts` (≤ 400 KB, 1080 px through the real renderer); `taff-render` caps |
| VE-3.6–3.7 | `e2e/view-export.spec.ts`, en, zh-CN, zh-HK |
| Deploy wiring | `scripts/apuch-compose.test.ts` (API and worker share the renderer URL) |
| VE-4.1–4.4 | `packages/schemas/src/timeline-image.test.ts`; `backend/crates/taff-render/tests/render.rs` timeline cases and three locale PNG goldens |
| VE-4.5–4.7 | `packages/schemas/src/view-export.test.ts`; `view-export.integration.test.ts`; `apps/api/src/view-export.test.ts`, `mcp-views.test.ts`; timeline case in `e2e/view-export.spec.ts` across three locales |
| VE-5.1–5.6 | `packages/schemas/src/calendar-image.test.ts`; `backend/crates/taff-render/tests/render.rs` calendar cases and six locale/mode PNG goldens |
| VE-5.7–5.8 | `packages/schemas/src/view-export.test.ts`; `view-export.integration.test.ts`; API/MCP export tests; calendar case in `e2e/view-export.spec.ts`, three locales |
| VE-6.1–6.6 | `packages/schemas/src/graph-image.test.ts`; existing web `graph-layout.test.ts` and `mind-model.test.ts`; `backend/crates/taff-render/tests/graph.rs`, six locale PNG goldens and empty/capped/dense fixtures; `scripts/ui/graph-palette.test.ts` |
| VE-6.7–6.11 | `packages/schemas/src/view-export.test.ts`, `view-export.integration.test.ts`, REST authorization matrix, `apps/api/src/view-export.test.ts`, `mcp-views.test.ts`, two graph cases in `e2e/view-export.spec.ts` across three locales |

## Open decisions

None open; the owner decided all three on 2026-11-13 (ADR 0031 amendment 1).

## Sources

- [ADR 0031](../adr/0031-exported-view-images.md), [ADR 0029](../adr/0029-summary-text-and-image-renders.md), [daily summary spec](daily-summary.md)
- [Milestone 117](../milestones/117-view-export-and-gui-alignment.md), [Milestone 127](../milestones/127-graph-view-export.md), [CHANGELOG](../../CHANGELOG.md)
