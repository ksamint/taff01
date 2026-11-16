# 141 — policy acceptance observes its write acknowledgement

Status: implemented; exact-source full local gate and publication pending.
Production remains v0.2.25. TypeScript browser driver only; no API, permission or Rust change.

- PR108's production matrix on `9d5f64f` finished 377 passed, 3 expected skips and one failure.
- The HK policy-disable request returned HTTP 200 in 6494 ms; its switch assertion expired after 5000 ms while the control correctly remained disabled.
- Policy acceptance now observes that exact token's PUT response and asserts HTTP 200 before checking reconciled switch and grants.
- Both enable and disable confirmations use the same local helper. Cancel, manual/policy origin, revoke, restore and final state assertions remain.
- No retry, sleep, timeout, permission, API status, fixture grant or control behavior changed.
- Trace was retained privately; no raw credentials or headers are included here.
- Focused validation and the complete local gate are recorded against the final clean commit/tree in the PR body.
- Spec: tooling TT-4.5; generated test-ID contract updated in the same change.
- PR108 remains pending until this separate fix lands and its updated head passes its own full gate.
