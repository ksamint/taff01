# Spec: project finance

Living specification for project contract, currency, client company and
payments. Decisions: [ADR 0021](../adr/0021-project-stage-lead-and-shared-finance.md).
Change this file in the same commit as the behaviour it describes.

Status: back end since v0.2.10; the management screen is on `main` for v0.2.22, not yet released.

## Users and roles

| Role | Can |
| --- | --- |
| Workspace admin (person) | read finance; set contract amount, currency and client company; record payments |
| Member (non-guest person) | read contract amount, collected amount and percent, and the payment list |
| Guest | nothing; the panel is absent and the API withholds the figures |
| Agent | nothing, except confirmed project operations (ADR 0025) |

## Requirements

### Reading (PF-1)

- PF-1.1 Every non-guest person shall see, on the project's timeline view, the
  contract amount and currency, the collected amount (the sum of payments) and
  the collected percent of the contract, and the payments newest first with
  date, amount and note. Money and dates use the reader's locale.
- PF-1.2 Guests and agents shall not see the panel; `/api/projects/:id/payments`
  requires `finance:read`.
- PF-1.3 The timeline finance strip shall label the computed percentage as
  Task completion. Delivery progress shall refer to the saved project field
  documented in [project profiles](projects.md).

- PF-1.4 On a phone the finance strip shall show a disclosure for the payments
  and management panel, closed by default. A project without a contract shall
  still provide the disclosure for readers with finance access. Desktop shall
  keep the panel visible.

### Managing (PF-2)

- PF-2.1 `canManageFinance` in the workspace access flags shall equal
  `can(actor, "finance:manage")`; only administrators see Edit and Record payment.
- PF-2.2 Edit shall send one versioned project patch with contract amount
  (up to 12 digits and two decimals, or empty for none), currency and client
  company, with optimistic rollback. A contract amount shall require a
  currency, and the currency shall be locked once any payment exists.
- PF-2.3 Record payment shall require a currency, an amount above zero with up
  to two decimals and a paid-on date (default: today in the reader's zone),
  with an optional note up to 500 characters. Payments are append-only: no
  edit or delete.
- PF-2.4 Invalid input shall be reported before sending; server errors keep the
  form open with the localized error.

### Agent run cost (PF-3)

- PF-3.1 The Rust cost endpoints for a project and for a task shall return
  total USD cost in micros, run count, failed run count, failed cost and
  total duration in milliseconds. Each project shall include every run of
  its tasks in the workspace, including failed runs and rework.
- PF-3.2 A person shall need `finance:read` to fetch a project's costs or a
  cost for a task in that project. Only a workspace admin shall fetch costs
  for an unprojected task.
- PF-3.3 Task detail and project finance shall display the authorized USD
  total in the reader's locale.

### Budget and actual (PF-4)

- PF-4.1 People with `finance:read` shall see a project budget and recorded
  actuals in the finance panel. People with `finance:manage` shall set the
  budget in one currency.
- PF-4.2 Actuals shall include every run in the project and the rated time
  logged against its tasks. Each entry uses the latest rate effective on the
  entry day. Sum rated labor before rounding to a micro per currency.
- PF-4.3 Display each currency separately and flag unrated minutes. The
  actual response omits the rates and the identities of people who logged time.

## Non-functional

- The panel loads with the lazy timeline view,
  so Today's initial JavaScript is unchanged. Strings in en, zh-CN and zh-HK.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| PF-1, PF-2 | `e2e/project-finance.spec.ts` in en, zh-CN and zh-HK |
| PF-1.4 | `e2e/project-finance.spec.ts`, disclosure and role checks in three locales |
| PF-1.2 | `e2e/finance-visibility.spec.ts`; `packages/core/src/planning.integration.test.ts` |
| PF-1.3 | `e2e/timeline.spec.ts`, distinct progress labels in three locales |
| PF-2.1 | `packages/core/src/planning.integration.test.ts` (admin, member, guest flags) |
| PF-4 | `backend/crates/taff-api/tests/project_actual.rs` and `e2e/project-budget-actual.spec.ts` |
| PF-3 | `backend/crates/taff-api/tests/agent_cost.rs` and `e2e/agent-cost.spec.ts` |

## Sources

- [ADR 0021](../adr/0021-project-stage-lead-and-shared-finance.md) ·
  [v0.2.22 plan](../agent-goal-v0.2.22-admin-gaps.md)
