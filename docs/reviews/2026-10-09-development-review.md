# Development quick review — 2026-10-09

Updated with the 2026-10-10 live SMS checkpoint. Taff is live at
[taff.apuch.cn](https://taff.apuch.cn), serving `41ae94ff`. SMS is enabled;
one authorized application send was accepted and carrier delivery was confirmed.
Real OTP login has not yet been verified; the original code expired before
local session verification completed. M9 and the
`v0.1.0` release remain unfinished.

| Area | Review |
| --- | --- |
| Product | Tasks, people/agents, review/Inbox, projects, calendar, organizations, MCP, realtime, cache/PWA and notifications are implemented. |
| Architecture | Core owns database access and permissions; shared schemas validate REST/MCP boundaries. Auth uses Better Auth and transactional PostgreSQL provisioning. |
| Historical EF7 baseline validation | 409 unit tests, 87 production browser cases and MCP smoke passed. EF7 Today JS is 191,397 gzip bytes; Lighthouse EN/CN/HK is 99/99/98 and separate LCP medians are 536/568/564 ms. |
| Production | Release `41ae94ff`: existing email login, task writes, Secure/HttpOnly cookies, foreign-origin rejection, mobile Today, realtime and sign-out/sign-in passed. Eight neighbors and Caddy/Valkey preserved images/start times/health; PostgreSQL was unchanged. The deployment lock was released. |
| Historical SMS implementation acceptance | All nine gates passed for `d0bbe47`: 428 unit/integration tests (seven PostgreSQL SMS cases), 96 browser cases (nine mocked SMS cases), MCP smoke. Today JS is 191,576 gzip bytes; Lighthouse EN/CN/HK is 99/98/98 and separate LCP medians are 552/564/560 ms. |
| Historical documentation CI | [Main 37928770076](https://github.com/ksamint/taff01/actions/runs/37928770076) and [feature 37928698218](https://github.com/ksamint/taff01/actions/runs/37928698218) passed for the documentation checkpoint. |
| Live SMS release acceptance | `41ae94ff` passed all nine gates: 428 unit/integration tests, 96 production browser cases and MCP smoke. Today JS is 191,578 gzip bytes; Lighthouse EN/CN/HK is 98/98/98, accessibility 96, best practices 100; separate LCP medians are 544/544/560 ms. Provider readiness passed; exactly one authorized send was accepted and carrier status was `SUCCESS`. Real OTP login has not yet been verified; the original code expired. |
| Live release CI | [Main 37954047982](https://github.com/ksamint/taff01/actions/runs/37954047982) and [feature 37954048010](https://github.com/ksamint/taff01/actions/runs/37954048010) passed for exact deployed `41ae94ff`. |

## Next development steps

1. **Complete real OTP session verification.** SMS is live after approved
   provider readiness, the additive migration and the validated upgrade. Exactly
   one authorized app send was accepted and carrier delivery was confirmed.
   The original code expired before local session verification completed, so
   real OTP login is not yet verified. A fresh real test needs separate send
   authorization; no additional automatic SMS was sent. Mocked send/verify,
   expiration, replay, concurrency, account separation and email fallback are
   covered by the accepted gates.
2. **Complete M9 accessibility and locale acceptance.** Key parity already has
   tests. Finish the full keyboard-only workflow, typography review, both themes
   and committed screenshots across routes. The mobile Hong Kong locale
   selector clips its label. Shared form hints now use the existing muted token:
   measured contrast is 9.327:1 in light and 10.666:1 in dark, improving on the
   previous 4.476:1 light value. Today Lighthouse alone does not establish
   full-app accessibility. See the [WCAG contrast criterion](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
3. **Finish seed and invitation identity.** The seed currently has five people,
   three agents and three tasks; align the complete prototype data and prove
   idempotence. Add SMTP and verified email ownership: invitation acceptance
   currently matches the signed-in email string, which does not prove ownership
   of that address. SMS login does not fix this gap.
4. **Release handoff.** Verify the clean-checkout walkthrough, add the changelog,
   complete M9 validation/CI, then tag `v0.1.0`.

## Decisions for review

- Neo4j: choose the graph data/feature and isolation model before integration.
- MCP OAuth: choose the authorization server; agent-token authentication works.
- Phone accounts: initial SMS login supports `+86` mainland mobile numbers and
  creates a separate verified phone identity. Existing email accounts are not
  automatically merged. Authenticated account linking is a later scoped change.

Sources: [M9 checkpoint](../milestones/09-hardening-and-handoff.md),
[acceptance requirements](../agent-goal.md), [deployment](../deploy.md),
[seed](../../packages/core/src/seed.ts),
[invitation acceptance](../../packages/core/src/planning.ts), and
[locale tests](../../apps/web/src/lib/i18n.test.ts).
