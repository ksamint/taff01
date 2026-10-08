# ADR 0006 — Separate calendar schedules and use MIT gesture plugins

## Context

M6 needs calendar intervals, recurrence and gestures. A task's `dueAt` is its
existing deadline; treating it as both deadline and interval start loses that
meaning. Task versions, audit transactions and core permissions already exist.
Schedule-X's current documented drag/drop and resize plugins require paid
licences. The published `@schedule-x/drag-and-drop` and `@schedule-x/resize`
3.7.3 tarballs retain their MIT licences.

## Decision

Keep the prescribed Schedule-X stack. Use React 4.1.0 and calendar, controls,
events service, theme and translations 4.9.1 with the free MIT gesture plugins
pinned to 3.7.3. Calendar v4 renamed three drag entry points: supply bound aliases
from `createTimeGridDragHandler`, `createDateGridDragHandler` and
`createMonthGridDragHandler` to the corresponding `start*Drag` methods. Inspected
resize and calendar application contracts remain compatible. Actual browser
moves, resizes, touch cancellation and rollback must verify this integration.
Use its exact MIT `temporal-polyfill` peer 0.3.2; `temporal-spec` is ISC.
Month events reuse one native Pointer Events handler for primary mouse and
touch input, with cancellation and exactly one update; native HTML dragging is
suppressed there. The MIT plugins handle day/week dragging and edge resizing.
Do not install `@sx-premium/*` or introduce a commercial licence.
The free gesture packages and polyfill use exact manifest pins. Resize 3.7.3
omits its package metadata licence field but contains the complete standard MIT
text in `LICENSE`; its SHA-256 is
`c38937352e57d6e95aca6506641c3319ab4fe26ecb71350021c35a3bc29c14f9`.
The licence gate must verify this file rather than treating missing metadata as
a different licence. Preact and signals are MIT; RRULE is BSD-3-Clause.

Calendar code and theme load on the Calendar route. This ADR permits the
prescribed calendar dependencies above 20 KiB on that route; the Today initial
JavaScript budget remains 200 KiB. Supply `zhHK` translations using the official
Traditional Chinese dictionary plus the application's Hong Kong wording.
Date formatting continues to use the actual user's locale and time zone.
Pass BCP47 locale values to the renderer while retaining its dictionary keys.
Map canonical occurrence IDs to private CSS-safe renderer IDs and carry the
original occurrence ID through callbacks. For the day view's agent lane, reuse
two calendar engines with synchronized scrolling: each engine handles overlap
within its own lane. Week and month keep one engine.

Store one separate calendar schedule per task: start/end instants, its own time
zone and optional RRULE. Deadlines remain unchanged. Calendar writes share the
task version, transactional audit and `task:schedule` authorization. Core
expands recurrence with BSD-3-Clause `rrule`; browser rendering receives bounded
occurrences and authoritative permission flags. Query ranges and rule expansion
must be bounded. Edits and gestures apply to the whole series; occurrences share
the task's completion state. Preserve the series' local wall clock across DST.
Creating a task from an empty slot must write its task and schedule atomically.

## Consequences

The adapter pins legacy MIT plugins and needs regression coverage when upgrading
Schedule-X. Paid plugins are unnecessary. A separate schedule adds one table but
preserves deadline semantics and avoids adding calendar fields to every Task
DTO. Per-occurrence completion and recurrence exceptions are outside this
milestone; the interface must make whole-series editing clear.

## Sources

- [React integration](https://schedule-x.dev/docs/frameworks/react),
  [Temporal](https://schedule-x.dev/docs/calendar/temporal),
  [custom translations](https://schedule-x.dev/docs/calendar/language).
- [Current drag/drop](https://schedule-x.dev/docs/calendar/plugins/drag-and-drop)
  and [resize](https://schedule-x.dev/docs/calendar/plugins/resize) licence terms.
- Published metadata and tarball licences: [calendar 4.9.1](https://registry.npmjs.org/@schedule-x/calendar/4.9.1),
  [drag/drop 3.7.3](https://registry.npmjs.org/@schedule-x/drag-and-drop/3.7.3),
  [resize 3.7.3](https://registry.npmjs.org/@schedule-x/resize/3.7.3),
  [polyfill 0.3.2](https://registry.npmjs.org/temporal-polyfill/0.3.2).
- [RRULE time-zone guidance](https://github.com/jkbrzt/rrule#important-use-utc-dates)
  and [RFC gap/fold clarification](https://www.rfc-editor.org/errata/eid4271).
