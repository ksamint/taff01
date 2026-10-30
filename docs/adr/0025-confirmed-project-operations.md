# ADR 0025: Human-confirmed project operations

Owner request (2026-10-30): Twin instructions create and update projects, including
an ISO deadline, delivery progress0–100%, agreed total and cumulative actual receipts.
Currency is explicit per project; ask when monetary input lacks it. Reuse existing
`contractAmount`, `currency` and the payment ledger rather than a second balance.

`projects.manage` defaults to deny. The existing human-admin permission UI/API may
explicitly grant it; a token also needs tasks:write. Project finance visibility
requires tasks:read plus the current capability, including revocation checks.
Other agent finance and project administration remain denied. MCP projects.create
and projects.edit prepare only and return tool/arguments/expected_version with
requires_confirmation=true. They never mutate project or payment data.

Only the signed original-agent operation adapter enables project writes. It checks
the original token, capability and workspace, a unique provisioned controller
mapping, and both mapped human and verifier's current native administrator rights
on every execution/replay/status call. The signature covers existing exact bytes;
create expects null version; edit locks and compares the project version.

Cumulative receipts append only the positive exact decimal delta. Equal totals do
nothing; lower totals reject (refund/correction semantics are out of scope). A
currency change after any receipt rejects. Payments also lock/update the project
version, preventing approval with stale totals. Payment date uses the token
issuer's saved timezone. Business changes, payment, audit and receipt share one
transaction. ISO deadline and progress use additive migration0036.
