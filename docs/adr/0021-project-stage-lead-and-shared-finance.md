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
  so existing projects need no backfill and show nothing new.
- `projects.lead_id` references a member of the same workspace. A trigger
  rejects agents, like the task owner rule; core returns `invalid_input`.
- Both are set at creation or through `PATCH /api/projects/:id` with the
  project version, by `project:manage` (admins). The project dialog edits
  them; the project header shows them when set.
- `finance:read` is granted to every person member except guests. Admins
  alone keep `finance:manage` (contract amount, currency, client company,
  payments). Agents still never read finance; `projects.list`,
  `timeline.get` and `brief.get` return finance as null over MCP.
- Payment realtime events follow the reader rule: people, not guests.
- MCP agents read stage and `leadId` through `projects.list`; changing them
  stays a human action.

## Consequences

- Additive migration 0031; no data is changed.
- Members now see contract and collection figures on the timeline, brief and
  company detail. Guests see delivery % only.
- Open: whether the person in charge (not only admins) may move the stage,
  and whether agents may read finance with a grant. Neither is built.
