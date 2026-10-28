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

## Release acceptance — 2026-10-28 UTC
- Released `b52866ddaf72b09637ca3c7db4e4c5b7a31b0a96`; tag v0.2.15 verified on origin; PR #78 merged. PR CI 40631434743 and exact-source main CI 40632532580: 8/8 green, 1748 tests, 288 browser and 166 visual cases. This supersedes the initial pending CI status above.
- Main performance: Today 192.4 KiB; LCP EN/CN/HK 616/672/676 ms; Lighthouse P/A/BP 100/100/100, 99/100/100, 100/100/100. All existing visual baselines passed in Linux CI.
- Additive 0033 plus core backfill inserted 245 agent members; zero remaining workspaces without an agent. Existing 侍天TIANSIGHT agent fenshen01 retained; Table AI/APUCH default name is 默认智能体 / Default agent. No token issued.
- Bundled migration imports are side-effect free; regression plus default-agent checks 4/4. Empty-database and final Node 26 image inventory probes prove the inventory does not migrate. Three local images, local 32/32 production checklist and official MCP smoke passed.
- Native lock/backups verified; initial Compose API export omission reconciled with the existing isolated migrate-target build before any migration/startup. Only API/web/worker replaced; initial preservation 27/27, PostgreSQL start unchanged.
- Live 33/34 distinct cases passed after two targeted Projects retries; 2/2 new EN/zh-CN agent-control checks passed without token creation. All 36 cleanup journals complete; zero page errors, cleanup failures and agent tokens.
- Remaining P2: apps/web/src/components/projects-scene.tsx:667 — phone HK create action absent after filter click despite backend canManageProjects=true; two pre-write failures, no entities. Desktop cases and phone EN retry pass. Track mobile readiness per the existing non-critical release policy.
- Owner decision/pending: no production token issuance; separate afmac session handles fenshen01 and token-dependent MCP/review acceptance. Source CI/local smoke pass; no live round trip claimed.
- Final receipt/lock release follows green docs merge under docs/release-closeout.md; no rollback. See docs/deploy.md checkpoint for source and acceptance links.
