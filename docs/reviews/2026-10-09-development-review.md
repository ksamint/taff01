# Development quick review — 2026-10-09

Taff is live at [taff.apuch.cn](https://taff.apuch.cn). The deployed release is
`ef7f52c3`; the deployment documentation checkpoint is `22b29c9`. SMS
implementation `d0bbe47` passed the full validation gates. The final contrast
and report checkpoint follows those same gates before push. M9 and the
`v0.1.0` release remain unfinished.

| Area | Review |
| --- | --- |
| Product | Tasks, people/agents, review/Inbox, projects, calendar, organizations, MCP, realtime, cache/PWA and notifications are implemented. |
| Architecture | Core owns database access and permissions; shared schemas validate REST/MCP boundaries. Auth uses Better Auth and transactional PostgreSQL provisioning. |
| Deployed baseline validation | 409 unit tests, 87 production browser cases and MCP smoke passed. Deployed Today JS is 191,397 gzip bytes; Lighthouse EN/CN/HK is 99/99/98 and separate LCP medians are 536/568/564 ms. |
| Production | Separate Taff Docker project, dedicated PostgreSQL role/database with verified TLS, trusted public HTTPS and DNS. Signup, task writes, cookie security and realtime smoke passed; neighboring services retained their start times. |
| SMS implementation acceptance | All nine gates passed for `d0bbe47`: 428 unit/integration tests (seven PostgreSQL SMS cases), 96 browser cases (nine mocked SMS cases), MCP smoke. Today JS is 191,576 gzip bytes; Lighthouse EN/CN/HK is 99/98/98 and separate LCP medians are 552/564/560 ms. |
| CI | [Main 37928770076](https://github.com/ksamint/taff01/actions/runs/37928770076) and [feature 37928698218](https://github.com/ksamint/taff01/actions/runs/37928698218) passed for the documentation checkpoint. |

## Next development steps

1. **SMS login — implementation ready for acceptance.** Tencent delivery,
   six-digit expiring OTPs, atomic single use, bounded attempts, persistent send
   limits and translated mobile forms are implemented. Email login, cookie/origin
   checks and account isolation are preserved. The unchanged full gates must
   pass before push; implementation `d0bbe47` passed all nine. Production
   configuration/readiness needs 1Password unlock;
   SMS is not live yet. Real delivery needs an authorized recipient; no real SMS
   test has been sent.
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
