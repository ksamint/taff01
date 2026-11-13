# Spec: Exported view images

Living product specification for exporting the workspace overview and a
project as one image ([ADR 0031](../adr/0031-exported-view-images.md),
milestone 117). This file states the current contract; the ADR holds the
decisions. Change this file in the same commit as the behaviour it describes.

Status: implemented on `main`; not yet released (production is v0.2.23).

## Users and roles

| Role | Can |
| --- | --- |
| Admin | Export the workspace overview or any project of the workspace, with finance |
| Member | The same; finance follows `finance:read` (people who are not guests) |
| Guest | Nothing; no export button, and the API refuses |
| Agent | Nothing; agents read summaries through `summaries.image` (ADR 0029) |

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
- VE-2.1 The action `view:export` shall allow people who are members or admins of the workspace and deny guests, agents and non-members.
- VE-2.2 When a member is demoted to guest, the next export shall be refused; when restored, allowed again.

### Delivery (VE-3)
- VE-3.1 `GET /api/workspaces/:id/view-image?locale=<en|zh-CN|zh-HK>[&projectId=<id>]` shall require a session and validate the id and a strict query before any count or read.
- VE-3.2 The route shall count one hit per person per minute in Valkey under a hashed key, refuse above 10 with 429 and `Retry-After: 60`, and answer 503 when the count fails.
- VE-3.3 The route shall post `{layout, watermark, contentHash}` to the internal renderer with a 10 s timeout and return `image/png` with `Cache-Control: private, no-store`, `nosniff`, an attachment name `taff-<workspace|project>-<date>-<hash8>.png` and `X-Taff-Content-Hash`.
- VE-3.4 Without `SUMMARY_RENDER_URL` the route shall answer 503 `render_unavailable`; a renderer error, a non-PNG answer or a timeout shall answer 502 `render_failed`.
- VE-3.5 The image shall be 1080 px wide, a palette PNG of at most 400 KB, fitted under the 3,400 px height budget (ADR 0029).
- VE-3.6 The projects header shall show an Export image button to people who are not guests, once the session is confirmed; it shows the current project, or the workspace overview when no project is selected.
- VE-3.7 The dialog shall preview the image with its width and size, and offer Send (only when `navigator.canShare` accepts the file), Copy image (only when `ClipboardItem` exists) and Save (always); Escape closes it and returns focus to the button.

## Non-functional

- Image binaries are not stored; only the allowlisted export audit metadata is retained. No migration or new client dependency; the CJK text is drawn with the renderer's server fonts, so the web font subsets do not limit names.
- Environment: the API reads `SUMMARY_RENDER_URL` (optional); the renderer stays internal with no public route.

## Out of scope in v1

- Planned, owner-approved 2026-11-13 ([ADR 0031 amendment 1](../adr/0031-exported-view-images.md#amendment-1--2026-11-13-owner-decisions), goal E3, S1–S3): the agent `views.image` tool, and timeline, calendar, mind and relations images. None is current behaviour yet.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| VE-1.1–1.7 | `packages/core/src/view-export.integration.test.ts` (5 cases, PostgreSQL) |
| VE-1.8 | `view-export.integration.test.ts` audit metadata/refusal/notification barrier case; `e2e/audit.spec.ts` in three locales |
| VE-2.1 | `packages/core/src/permissions.test.ts` (five `view:export` rows); `docs/spec/permissions-matrix.md` |
| VE-2.2 | `view-export.integration.test.ts` "stops a demoted member…" |
| VE-3.1–3.4 | `apps/api/src/view-export.test.ts` (6 cases) |
| VE-3.5 | `e2e/view-export.spec.ts` (≤ 400 KB, 1080 px through the real renderer); `taff-render` caps |
| VE-3.6–3.7 | `e2e/view-export.spec.ts`, en, zh-CN, zh-HK |
| Deploy wiring | `scripts/apuch-compose.test.ts` (API and worker share the renderer URL) |

## Open decisions

None open; the owner decided all three on 2026-11-13 (ADR 0031 amendment 1).

## Sources

- [ADR 0031](../adr/0031-exported-view-images.md), [ADR 0029](../adr/0029-summary-text-and-image-renders.md), [daily summary spec](daily-summary.md)
- [Milestone 117](../milestones/117-view-export-and-gui-alignment.md), [CHANGELOG](../../CHANGELOG.md)
