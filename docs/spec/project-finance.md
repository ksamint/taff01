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

## Non-functional

- No migration and no new route; the panel loads with the lazy timeline view,
  so Today's initial JavaScript is unchanged. Strings in en, zh-CN and zh-HK.

## Acceptance

| Requirement | Evidence |
| --- | --- |
| PF-1, PF-2 | `e2e/project-finance.spec.ts` in en, zh-CN and zh-HK |
| PF-1.2 | `e2e/finance-visibility.spec.ts`; `packages/core/src/planning.integration.test.ts` |
| PF-2.1 | `packages/core/src/planning.integration.test.ts` (admin, member, guest flags) |

## Sources

- [ADR 0021](../adr/0021-project-stage-lead-and-shared-finance.md) ·
  [v0.2.22 plan](../agent-goal-v0.2.22-admin-gaps.md)
