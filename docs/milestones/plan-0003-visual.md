# Plan 0003 · integrated visual references

- Local Chromium 156.0.8078.80 on Linux ARM64 with Playwright 1.64.1.
  Built the app at `827b12c` and rebuilt for the Mind label contrast fix.
  Used the fixed 2026-10-08 Northwind seed and the repository's visual
  clock. The delivery fixture used a separate migrated local database.
- Projects, Projects list and Type show the compact board, the first-row
  controls and the new project navigation. Task detail and Review reflect
  the shorter phone sheet or shared review gutter and the Projects
  backdrop. Search hides keyboard hints on touch devices.
- Timeline shows the phone finance disclosure and distinct task completion
  label. Brief shares the task completion label. Mind and Relations show
  the combined graph switcher, and the Mind centre labels separate in both
  themes. Stakeholders uses the shortened project header.
- Me and Inbox reflect the grouped navigation and route-specific font stack.
  Team shows agent details folded. Organizations, Agent, MCP and delivery
  access screens reflect the shared settings header and gutter. MCP uses
  the canonical local port 3000 for its displayed URL.
- Sectors shows the index entry and desktop grid. Export image uses the
  compact Projects backdrop and a real preview. The eight G4 artifacts and
  their hashes are in [the capture manifest](../ui/screenshots/v026-gui-capture-manifest.json).
  Delivery summaries changed only for zh-CN and zh-HK punctuation.
- Capture preparation keeps the 16 shared UI faces and recognizes the one
  Me face with its default Unicode range. The board fixture checks confirmed
  drag targets. Browser comparison tolerances remain unchanged.
- The before/after PNGs, pixel bounds, hashes and Playwright reports are
  in the worktree's ignored `release-reports/plan-0003-visual/` directory.
- No-update comparisons passed 104/106 UI cases and all six delivery cases.
  The two desktop Notifications captures were pixel-identical to fresh
  captures at `96d037e`. Existing references for those unchanged layouts
  were retained. Their pre-existing difference appears in the report.
- Lint, typecheck and the focused test-ID, clock and capture-selection
  checks passed. The exact integrated gate remains with the release lead.
