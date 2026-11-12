# v0.2.24 — exported view images and GUI alignment gaps

Status: E1 implemented on `main` (milestone 117); A1–A4 and release open.
Production is v0.2.23 `4a751a9`.

## Targets

- Strict TypeScript: core export builder, REST route, web dialog, project
  settings fields, desktop navigation, tests and specs.
- TypeScript core stays the database, session and permission authority.
- Rust: `taff-render` is reused unchanged for exports; no renderer change.

## Contract, in order (smallest first)

- **E1 Exported view images (done).** [ADR 0031](adr/0031-exported-view-images.md),
  [spec view-export](spec/view-export.md): Export image on the projects header
  for the current project or the workspace overview; Send, Copy image, Save;
  `view:export` for members and admins; nothing stored.
- **A1 Desktop link to /summaries** (gap G1, DS-5.2). Desktop Me (Settings tab)
  and ⌘K settings shortcuts link to `/summaries` like the phone Me row. Test:
  extend `e2e/summaries.spec.ts` with a desktop-viewport recipient click.
- **A2 Project due date and delivery progress** (gap G2). The project dialog
  edits `dueAt` and `deliveryProgress` (0–100) through the existing versioned
  `PATCH /api/projects/:id`; the project meta line shows both. Both drive the
  summary and the export ("Progress 0%" today because no person can set it).
  Spec: a project section in `docs/spec/project-finance.md` or a new
  `projects.md`; e2e in three locales; lowest role = admin (`project:manage`).
- **A3 Task titles in pending requests** (gap G4, AM-1.7). Show the task's
  reference and title with a link instead of the raw task id.
- **A4 Workspace archive screen** (gap G3). Needs an owner decision first:
  archive without an unarchive route is irreversible from the UI. Record the
  decision in an ADR before building; otherwise leave it listed as open.

## Release

Follow [release closeout](release-closeout.md) for the full gate, deploy and
closeout; this goal adds no other evidence. Deployment delta for E1: the API
container needs `SUMMARY_RENDER_URL=http://render:3002` (the worker's value,
`compose.prod.yaml`); the renderer keeps no public route. No migration, no new
dependency, MCP still 37 tools. Rollback: v0.2.23 `4a751a9`.

## Open decisions (owner)

- Export audit rows; an agent `views.image` MCP tool; screen-picture exports
  of calendar, timeline chart and mind (ADR 0031 open decisions).
- A4 as above.
