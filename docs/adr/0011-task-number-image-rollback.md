# 0011: Preserve task writes after an image rollback

## Context

Migration 0021 adds per-workspace task numbers with NOT NULL and uniqueness.
The previous production API (`55b315b`) omits this new column when inserting
tasks. Restoring that API image while retaining additive migrations would
therefore reject task creation, including during the migration/startup gap.

## Decision

Add migration 0022 with a BEFORE INSERT fallback for missing task numbers.
It locks the workspace row, then assigns `max(number) + 1`, matching current
core allocation. Explicit task numbers are preserved. Its trigger name sorts
after the planning guard so parent locks precede workspace locks in both old
and current task creation. Existing constraints, audit and notifications stay.

## Consequences

Previous images can keep writing against the upgraded schema. Rollback restores
images and the private environment while keeping both migrations and data.
Legacy-created workspaces retain the existing `WS` key default. Number allocation
remains serialized per workspace, with no global lock or new runtime dependency.
Disposable integration checks cover omitted numbers, mixed old/current root and
subtask creation, separate workspaces, explicit numbers and transactional audit.
