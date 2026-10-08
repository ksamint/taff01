# 0002 — Use the specified client stack and measure its budget

## Context

The product mandates Next.js 16, React 19, TanStack Query 5, Tailwind 4, shadcn/ui
and i18next. Several complete libraries in this stack can exceed the 20 KB gzip
threshold for new client dependencies. The initial Today route still has a hard
200 KB gzip JavaScript budget. Phase 1 needs authentication, localized strings
and cache-first task queries.

## Decision

Use the specified framework, i18next and TanStack Query rather than introducing
alternatives. Keep shadcn-style controls local and use native HTML inputs and
selects. Use direct HTTP requests instead of shipping an authentication SDK to
the browser. Defer calendar and recurrence imports until their views exist.

This ADR records the decision to use the prescribed stack dependencies over the
per-library threshold; it does not exempt the route from its aggregate budget. Measure the
production Today bundle and implement CI enforcement before release. No other
large client dependency is authorized by this decision.

## Consequences

The fixed stack is preserved with a small application surface. Tree shaking and
route boundaries must keep the Today route within budget. If measurements exceed
it, optimize imports and rendering boundaries before adding more dependencies.
