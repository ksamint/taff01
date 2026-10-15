# 0017 — Versioned suggestion undo

Status: accepted · 2026-10-15

Applying an agent proposal needs a real person-triggered inverse. Restoring a
client snapshot can overwrite intervening work; deleting generated tasks would
violate retained-history and additive-migration rules.

Apply now stores a validated, server-only inverse in the same audited transaction.
`POST /api/suggestions/:id/undo` requires the current suggestion version and
`can(actor, "suggestion:undo", parent)` (person owner or admin; never guests or
agents). Applied history remains applied with `undoneAt` and an incremented
version. Older applied suggestions without an inverse cannot be undone.

A split inverse archives only its own untouched generated subtasks. It rejects
all of the undo if any child was edited or has comments, schedules, plans, runs,
contacts, dependencies, grants, inbox rows, proposals, mind links or descendants.
The archived rows retain their original status and identity; ordinary active
lists, search, timelines, graphs, calendars, brief and digest omit them. Shared
mutation locks reject archived tasks. This is a bounded inverse, not a general
task archive API.

A reschedule inverse restores the precise prior due instant and plan dates,
including the absence of a plan. A newly created plan is archived; planning can
subsequently reactivate that retained row with a higher version. Concurrent task
or plan edits cause a conflict instead of being overwritten. No rows are deleted.
All inverse writes use the existing transactional activity/NOTIFY triggers.

The applied toast offers Undo and reports conflicts through the normal localized
error toast. No model provider is enabled and no dependency is added.
