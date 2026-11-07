# Agent goal: v0.2.22 — admin screens for finance, audit and permissions

> Status 2026-11-07: written from the GUI alignment review of v0.2.21
> (milestone 111). **G1–G3 done** (milestone 111); release preparation remains. Each gap is a back-end capability that shipped without a
> screen. No migration and no new dependency; one new access flag.

Paste everything below this line as the goal.

---

Work in `ksamint/taff01` from `main`. Read first: `AGENTS.md`,
`instruction_v0.md`, ADR 0021 (finance for every person, management for
admins), milestone 36 (integration audit endpoints), `docs/spec/access-matrix.md`,
`docs/release-closeout.md`. TypeScript only (ADR 0030); three locales per
commit; tokens only, no second palette; Today stays within 200 KiB (new
screens are lazy routes or lazy panels); every control works by keyboard and
has an accessible name; spec changes ship with the behaviour.

## G3 — Permissions tab in the workspace access matrix (smallest first)

Why: the matrix response already carries `actions`, the `can()` rows for
admin, member, guest and agent (AM-3.1), but `/orgs/access` never shows them.

- `apps/web/src/components/access-matrix.tsx`: a fifth tab, Permissions,
  after Apps. A table grouped by the action's resource prefix (workspace,
  project, task, token, …) with a localized group heading, the action code in
  monospace, and four columns Admin · Member · Guest · Agent showing an
  allowed or denied mark with a text label for screen readers. The baseline
  note from the generated document (AM-3.2) sits above the table.
- Strings: `access.permissions`, `access.permissionsBaseline`,
  `access.allowed`, `access.denied`, `access.group.<prefix>` in en, zh-CN, zh-HK.
- Test: `e2e/access.spec.ts` opens the tab in three locales, finds
  `workspace:manage` allowed for admin and denied for member, and checks the
  row count equals the matrix response's `actions` length.
- Spec: `access-matrix.md` AM-3.4 (the matrix shows the rows it returns).

## G1 — Project finance management for admins

Why: ADR 0021 gives admins `finance:manage` for contract amount, currency,
client company and payments. Core and REST support all of it (`PATCH
/api/projects/:id` finance fields, append-only `GET|POST
/api/projects/:id/payments`, cumulative received amount from payments), but
no screen sets any of it; only the agent's confirmed MCP operations can.

- Access: `workspaceAccessSchema` gains `canManageFinance`
  (`can(actor, "finance:manage", …)`), computed in core with the other flags;
  table rows in the access tests; no route change.
- `apps/web/src/components/project-finance-panel.tsx` on the project's
  timeline view, for anyone with `canReadFinance`:
  - read view: contract amount and currency, client company, collected amount
    and percent, and the payment list (date, amount, note, newest first);
  - with `canManageFinance`: Edit (contract amount, currency from the shared
    currency list, client company from the companies list) sent as a
    versioned project patch with optimistic rollback and an error toast; and
    Record payment (amount > 0, paid-on date defaulting to today in the
    reader's zone, optional note) posting to the payments route. Payments are
    append-only: no edit or delete, matching the back end.
  - Money is formatted in the reader's locale; amounts are typed as decimal
    strings and validated with the shared schemas before sending.
- Shown even when no contract exists yet, so the first amount can be set.
- Tests: core access flag rows; `e2e/project-finance.spec.ts` in three
  locales: admin sets a contract and records a payment and sees collected
  percent update; member sees read-only; guest sees no panel.
- Spec: new `docs/spec/project-finance.md` (module-spec skill).

## G2 — Workspace audit screen

Why: milestone 36 shipped `GET /api/admin/audit/search` and
`/api/admin/audit/trace/:trace_id` (workspace admins; 200 newest activity
rows with filters) without a screen.

- Shared schema `integrationAuditResultSchema` (`entries` with id, actorId,
  traceId, workspaceId, action, resourceId, details, createdAt; `truncated`)
  so the web parses what the API returns; route tests assert it.
- `apps/web/app/orgs/audit/page.tsx` and
  `apps/web/src/components/audit-view.tsx`, linked from Organizations and the
  access matrix: filters for trace, request, approval and receipt id
  (validated as the API does), a table of time (reader's locale and zone),
  actor (member name when it resolves, else the id), action, resource and
  trace id; a trace id opens the trace filter; each row's details expand as
  formatted JSON. A truncation note when 200 rows are shown.
- Test: `e2e/audit.spec.ts` in three locales: an admin's own role change
  appears; filtering by an unknown trace shows the empty state; a member gets
  the forbidden state.
- Spec: new `docs/spec/audit.md`.

## Release

v0.2.22: no migration, no environment value, no new image. Local gate per
`docs/release-closeout.md` check 1; deploy and close out by the operator.
