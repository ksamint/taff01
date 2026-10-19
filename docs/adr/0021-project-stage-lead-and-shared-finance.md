# 0021 — Project stage, person in charge and finance for every person

Date: 2026-10-18. Status: accepted. Supersedes D7 of ADR 0015 for reading finance.

## Context

The owner asked for a commercial stage on each project (lead, proposal sent,
contract signed, in service, closed), a person in charge, and for the fee
collection figures to be visible to anyone in the organization. Before this
change projects had only a name and an archived flag, and contract amount,
collected amount and collection % were admin-only (D7).

## Decision

- `projects.stage` is a `project_stage` enum, nullable. Null means "not set",
  so existing projects need no backfill; read-only views omit unset metadata.
- `projects.lead_id` references a member of the same workspace. A trigger
  rejects agents, like the task owner rule; core also rejects guests with
  `invalid_input`. A later role demotion leaves the reference intact.
- Creation and profile edits use `project:manage` (person admins). A patch
  containing only stage and version uses `project:stage`: a non-guest person
  admin or the current person in charge. Agents never move stages. Any other
  field, including a lead reassignment, still needs `project:manage`.
- The header offers a native stage select with optimistic rollback and Undo
  to admins and the person in charge. Admins also retain the project dialog;
  its lead picker excludes guests. Version checks prevent lost updates.
- Brief carries nullable stage and `leadId`, displays the person name using
  workspace-scoped labels, and filters rows and currency totals by stage.
  Risk calculation and ordering stay shared with the timeline. The project
  switcher groups stages in pipeline order, followed by projects with no stage.
- `finance:read` is granted to every person member except guests. Admins
  alone keep `finance:manage` (contract amount, currency, client company,
  payments). Agents still never read finance; `projects.list`,
  `timeline.get` and `brief.get` return finance as null over MCP.
- Payment realtime events follow the reader rule: people, not guests.
- MCP agents read stage and `leadId` through `projects.list` and `brief.get`;
  changing them stays a human action. Finance stays null without exception.

## Consequences

- Additive migration 0031; no data is changed.
- Members now see contract and collection figures on the timeline, brief and
  company detail. Guests see delivery % only.
- The person in charge can move stages without gaining profile or finance
  administration. A guest demotion removes that authority immediately.
- Both open questions are resolved: non-guest people in charge may move the
  stage; agents remain unable to read finance, including with grants.
- No further migration or backfill is needed. Unstaged Brief rows and their
  seeded screens keep their existing appearance; the admin project header
  gains the stage control even before a stage is set.
