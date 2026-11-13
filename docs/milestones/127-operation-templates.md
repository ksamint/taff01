# Operation templates — 2026-11-13 UTC

- Request: "do we have template module? add … as generic operation template"; six sectors tag tasks and projects in a new XIDING organization administered by the 侍天TIANSIGHT/APUCH admin; tasks added and opened from H5.
- Finding: there was no template module. Tasks already carry labels and projects; no migration was needed.
- Working (branch `claude/epic-thompson-iwoxr3`): template data in `packages/schemas/src/operation-templates.ts`; core `applyOperationTemplate` creates six sector projects, each with a 領先指標 and a 結果指標 task labelled with the sector and indicator; idempotent under the workspace row lock; admin-only (`project:manage`), agents refused. Route `POST /api/workspaces/:id/operation-templates/generic-operation`. Projects shows Add six-sector operation template to admins with no project selected (en, zh-CN, zh-HK).
- Spec: [operation templates](../spec/operation-templates.md), requirements OT-1 to OT-3.
- Access operations reviewed: only apply is new; it grants no access. Tested with admin, member, guest, outsider, demoted admin and agent.
- H5: the template creates ordinary projects and tasks, so the existing phone Projects and task screens list, open and add them; no phone-specific change.
- Missing work: live XIDING creation. It needs a release from the deploy machine (docs/deploy.md, docs/release-closeout.md); this cloud session has no production access. After release, a system admin creates XIDING in Organizations (system admins hold protected admin memberships in every organization), opens Projects and applies the template.
- Phone: `e2e/operation-templates.spec.ts` applies the template and opens an indicator task on the Pixel 7 profile in en, zh-CN and zh-HK. zh-CN says 领域, not 板块: 块 is not in the bundled font subset.
- Validation numbers: see the PR body (local gate on the committed tree).
- Open decision: which account is "tiansight apuch admin" if it should be a named org admin rather than the system admins.
