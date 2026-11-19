# Plan 0003 D2 · Sectors on the Projects index

- The Projects index exposes Sectors at `/projects?view=sectors`.
- Project selectors omit Sectors. Legacy `/projects/:id?view=sectors` links
  continue to render the workspace-wide view.
- Browser coverage exercises index navigation as a guest on both layouts and
  checks the legacy link in each locale.
- Lint, typecheck and the regenerated test ID contract checks passed. The full
  gate and pinned visual comparisons remain pending.
