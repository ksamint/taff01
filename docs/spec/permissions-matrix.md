# Permissions matrix

Generated from `can()` by `pnpm exec tsx scripts/permissions-matrix.mts`. Do not edit by hand.

Baseline: actors share a workspace; people are unrelated to the task owner; the agent is its worker, uses all standard token scopes, default capabilities and always_review, and has no temporary grants. Identity actions target the person's own account. Conditional owner, lead, supervisor, recipient and approved-operation cases remain covered by permissions.test.ts. This table describes baseline decisions, not every possible resource.

| Action | Admin | Member | Guest | Agent |
| --- | --- | --- | --- | --- |
| workspace:archive | Yes | No | No | No |
| workspace:default | Yes | Yes | Yes | No |
| workspace:create | Yes | Yes | Yes | No |
| workspace:join | Yes | Yes | Yes | No |
| workspace:manage | Yes | No | No | No |
| project:manage | Yes | No | No | No |
| project:stage | Yes | No | No | No |
| task:edit | Yes | No | No | Yes |
| task:owner | Yes | No | No | No |
| task:comment | Yes | Yes | No | Yes |
| workspace:read | Yes | Yes | Yes | Yes |
| task:create | Yes | Yes | No | Yes |
| task:assign | Yes | No | No | No |
| task:status | Yes | No | No | Yes |
| task:schedule | Yes | No | No | Yes |
| task:review | Yes | No | No | No |
| token:policy | No | No | No | No |
| token:grant | Yes | No | No | No |
| token:grant_revoke | Yes | No | No | No |
| token:manage | Yes | No | No | No |
| token:connect | Yes | No | No | No |
| token:revoke | Yes | No | No | No |
| profile:read | Yes | Yes | Yes | No |
| profile:update | Yes | Yes | Yes | No |
| notification:read | Yes | Yes | Yes | No |
| notification:update | Yes | Yes | Yes | No |
| digest:read | Yes | Yes | Yes | No |
| run:start | Yes | No | No | Yes |
| run:control | Yes | No | No | Yes |
| run:submit | Yes | No | No | Yes |
| run:request_review | Yes | No | No | Yes |
| files:attach | Yes | No | No | Yes |
| agent:manage | Yes | No | No | No |
| grant:request | Yes | No | No | Yes |
| grant:decide | Yes | No | No | No |
| inbox:read | Yes | Yes | Yes | No |
| inbox:update | Yes | Yes | Yes | No |
| capability:use | Yes | Yes | No | Yes |
| review:comment | Yes | Yes | No | Yes |
| task:finish | Yes | No | No | No |
| dependency:edit | Yes | No | No | Yes |
| finance:read | Yes | Yes | No | No |
| finance:manage | Yes | No | No | No |
| contact:read | Yes | Yes | No | No |
| contact:details | Yes | Yes | No | No |
| contact:manage | Yes | Yes | No | No |
| crm:archive | Yes | No | No | No |
| crm:audit | Yes | No | No | No |
| suggestion:create | Yes | No | No | Yes |
| suggestion:decide | Yes | No | No | No |
| suggestion:undo | Yes | No | No | No |
| mind:write | Yes | Yes | No | No |
| mind:archive | Yes | No | No | No |
| audience:read | Yes | Yes | No | No |
| audience:manage | Yes | No | No | No |
| summary:read | Yes | No | No | Yes |
| summary:preview | Yes | No | No | No |
| summary:share | Yes | No | No | No |
| summary:revoke | Yes | No | No | No |
