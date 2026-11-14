# Operation sector view — 2026-11-14 UTC

- Requests: (1) "do we have template module? add … as generic operation template", six sectors tag tasks/projects in a new XIDING organization administered by the 侍天TIANSIGHT/APUCH admin, tasks added and opened from H5; (2) "the system admins — release and create XIDING, review all pr, think it as a view … if not [tagged] then no need to show, prepare upgrade plan".
- Finding: there was no template module. Tasks already carry labels; Quick Add parses `+label`.
- First version (create six projects and twelve tasks) was replaced before merge by the view the owner asked for; nothing of it remains in core, API or the database.
- Working (TypeScript only: `packages/schemas`, web client): Projects → More → 營運視圖 / Sectors regroups every task in the workspace by sector label, then by project in project order, showing each sector's 領先指標 and 結果指標; untagged tasks are hidden; filters and sort apply; no project meta or image export in this view. No route, migration, permission or MCP change.
- Spec: [operation templates](../spec/operation-templates.md) OT-1, OT-2.
- Review of unreleased PRs #99–#101: no P0, no authorization or privacy defect. One P2/P1: XML-invalid characters in user text failed every timeline/calendar export (and reached summary watermarks). Fixed in the Rust renderer `escape()` (VE-3.8) with a failing-first test; goldens unchanged.
- Fonts: 塊/块/指/领/域 are not in the bundled subset, so UI strings use 方面 and 視圖; sector and indicator text is template data drawn with the system fallback.
- Upgrade plan: `docs/upgrade-plan.md`, "Release sequence after v0.2.24": v0.2.25 then XIDING on behalf of a system admin through normal core `createWorkspace`.
- ADR: TypeScript and Rust only is ADR 0030; backend to Rust is ADR 0026. No new ADR needed.
- Validation numbers: see the PR body (local gate on the committed tree).
- Pending: v0.2.25 deploy and XIDING creation run on the deploy machine; this cloud session has no production access.
