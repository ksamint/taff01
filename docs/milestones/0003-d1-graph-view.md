# Plan 0003 D1 · Graph view

- Projects lists one Graph entry. Relations and Mind map stay reachable from
  the mode switch and their existing query links.
- A production browser probe on phone and desktop confirmed a guest could
  switch and reload both modes while write and export controls stayed hidden.
- A production administrator probe switched through both modes. Each preview
  reached the API with its own mode and returned 200 with `image/png`.
- Build, lint, typecheck and 10 focused board and font checks passed.
- The full gate and pinned visual comparisons remain pending.
