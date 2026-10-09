# 0007 — Measure Next's Webpack production bundle

## Context

The signed-in, 20-card Today audit still misses the unchanged Lighthouse gate.
The exact cold capture for `a6ad6a49` reproduced its 3,368 ms greeting LCP.
The eleven initial scripts started with the parser; the final AppShell script
finished at 3,109 ms. Turbopack's module initializer accounted for 85.3 ms of
sampled self time and 127.6 ms inclusive time. These samples do not establish
a network discovery cascade or predict a particular score improvement.

## Decision

Measure Next 16.4's supported `next build --webpack` production build through
the existing web package script. This changes the build backend within the
installed Next version; runtime dependencies, development commands, framework,
routes and standalone packaging retain their existing contracts. No dependency
is added.

Adoption requires the same bundle budget, signed-in three-locale Lighthouse
audit, three-run LCP measurements, browser flows, MCP smoke and exact-commit CI.
No threshold, audit setting, data fixture, font behavior or authorization guard
is relaxed. Candidate `d06d2fc4` passed every check, including both exact-commit
GitHub CI runs on the feature branch and main. The production selection is
accepted with ADR 0008's authenticated server render.

## Consequences

Build and Docker callers inherit one explicit selection from the package script.
Chunk names and grouping can change, so browser navigation and service-worker
cache behavior must pass on the resulting production artifacts. Revert this
selection if the measured output fails the existing requirements.
