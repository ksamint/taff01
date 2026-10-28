# Default organization agents and action feedback — v0.2.15
- Owner scope: default agent creation/backfill, Organizations action, MCP empty state, same-class UI review; production release; no production token issuance.
- New organizations receive 默认智能体 / Default agent when no agent is copied; personal signup provisions it atomically. Existing custom agents are preserved.
- Additive 0033 retains personal-workspace provisioning; the standard migrator runs the idempotent core backfill with migration audit actor and change notifications. No credentials are created.
- Agent defaults match manual creation: agent/member, no linked user or supervisor, always_review, existing lazy capability defaults.
- Organizations exposes Add agent with session/loading/rights/busy feedback; MCP replaces empty selects with loading/error/no-agent guidance and links to Organizations. Clipboard failures give feedback; agent permission controls explain insufficient rights; MCP selection reconciles on workspace changes.
- Access operations reviewed: agent create; token issue/list/regenerate/revoke/restore; OAuth approve/code exchange/refresh/list/revoke/restore. Existing authorization matrix retained; new demotion test covers member and guest. Lists preserve the existing scoped OAuth-grant contract.
- Local checks: lint/typecheck and production web/server builds passed; default-agent integration 3/3, relevant browser 12/12 across en/zh-CN/zh-HK; Today JS 192.3 KiB. Full suite 1747/1747 after updating two old no-default-agent assumptions and the generated UI test-id contract. Local organization visual comparison differs only in font rasterization; existing baselines/thresholds retained, Linux CI authoritative.
- Remaining same-class findings (follow-ups, no authority changes):
| Priority | Location | Remaining behavior |
| --- | --- | --- |
| P2 | apps/web/src/components/oauth-consent-view.tsx:166 | No-agent guidance has no direct organization-management link; preserve the OAuth request when designing this navigation. |
| P2 | apps/web/src/components/me-desktop.tsx:49 | Lazy panels render null during module loading; add localized progress feedback. |
- Hidden/hash review: Team and create fragments have ordinary route actions; task fragments have task links. No additional confirmed route-only mutation found.
- Quick Add, task editor, calendar gesture and Inbox bulk mutations already expose error/rollback state; MCP submit error regression is covered.
- Release candidate/checkpoint and exact-source CI: see docs/deploy.md and PR #78. Pending: CI, live backfill count and scoped release acceptance.
- Owner instruction overrides live token issuance: MCP round trip deferred to the separate afmac/fenshen01 session; never create a production agent token here.
