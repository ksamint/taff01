# Spec: workspace audit log

Living specification for reading a workspace's recorded changes. Back end:
[milestone 36](../milestones/36-integration-permission-audit.md). Change this
file in the same commit as the behaviour it describes.

Status: audit screen deployed in v0.2.22; export audit additions implemented for v0.2.24, not yet released.

## Users and roles

| Role | Can |
| --- | --- |
| Workspace admin (person) | read the workspace's audit rows and filter them |
| Member, guest, agent | nothing; the API answers 403 to people and 401 to agent bearers |

## Requirements

### Reading (AU-1)

- AU-1.1 `GET /api/admin/audit/search?workspaceId=…` shall return the newest
  200 activity rows of the workspace, newest first, with `truncated` when more
  exist, as `integrationAuditResultSchema` (JSON dates as ISO strings).
- AU-1.2 One optional filter shall narrow the rows: `trace_id` (32 hex),
  `request_id` or `approval_id` (1–200 of `[A-Za-z0-9_.:-]`) or `receipt_id`
  (UUID). `GET /api/admin/audit/trace/:trace_id` is the trace filter.
- AU-1.3 Both routes shall require a human session with `workspace:manage`
  in that workspace, at every request.
- AU-1.4 Successfully built export snapshots shall appear as `view.export`
  rows, with the exporter's identity and the allowlisted metadata of VE-1.8.

### Screen (AU-2)

- AU-2.1 `/orgs/audit`, linked from Organizations and the access matrix for
  administrators, shall list time (reader's locale and zone), actor (member
  name when it resolves, else the stored id), change, record and trace.
- AU-2.2 Filters shall be validated with the shared query schema before any
  request; a trace id in a row shall apply the trace filter; a row's details
  expand as formatted JSON only when present.
- AU-2.3 Empty, truncated, error and forbidden states shall each have their
  own localized message; strings in en, zh-CN and zh-HK.
- AU-2.4 Export audit rows shall show a localized view-image export label in
  en, zh-CN and zh-HK; their metadata shall expand through the existing details control.

## Non-functional

- No migration or new route; the screen is a lazy route outside Today's budget.
- Details hold the allowlisted correlation and permission snapshot fields of
  milestone 36, or the export metadata of VE-1.8; no secrets, tokens or message content.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| AU-1.1 | `packages/core/src/runs.integration.test.ts` (result parses through the shared schema) |
| AU-1.2, AU-1.3 | `apps/api/src/app.test.ts` "integration audit REST boundaries"; `runs.integration.test.ts` member refusal |
| AU-1.4 | `packages/core/src/view-export.integration.test.ts` |
| AU-2 | `e2e/audit.spec.ts` in en, zh-CN and zh-HK |

## Sources

[Milestone 36](../milestones/36-integration-permission-audit.md) ·
[v0.2.22 plan](../agent-goal-v0.2.22-admin-gaps.md) · [Export contract](view-export.md) · [ADR 0031](../adr/0031-exported-view-images.md)
