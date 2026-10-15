# REST and MCP authorization coverage inventory

Reviewed candidate `1200f704fd8bb10af890c6761618291f8370e925` (source at `isolated audit worktree`). Counts expand registration loops: **121 REST method/path pairs, one `/mcp` transport registration (ALL methods), and 30 MCP tools**. This counts registered endpoint patterns, not individual UUID instances, implicit HEAD, or middleware OPTIONS handling.

## Verdict and limitations

Business operations inspected reach `requireMember` → `can` (`packages/core/src/index.ts:360`) directly or through shared helpers. All 44 actions have table-driven permission-rule evidence, but this **does not establish a table-driven authorization test for every route or tool**. Adapter tests frequently mock core. The table below maps endpoints to permission-rule matrix evidence and implementation; no universal endpoint × actor × cross-workspace allow/deny matrix exists. Thus the user’s stronger per-route/tool coverage requirement remains **P2 open** even though no unguarded workspace-business mutation was found.

**P2 explicit identity exception:** `GET /api/me` and `GET /api/bootstrap` call `getMe` (`packages/core/src/index.ts:397`) without `can()`. Session middleware authenticates (`apps/api/src/app.ts:266`), and the SQL filters by that session user. This is not demonstrated unauthorized disclosure, but it does not meet the literal “every REST route goes through can” requirement. Today bootstrap includes the same identity read plus guarded workspace operations; no-workspace/empty paths may not invoke workspace authorization. Consider an explicit identity-read action with self-only table tests rather than mislabeling these paths public.

Public exceptions are intentional: health, auth-method discovery, OTP send/verify, sign-in/sign-up/sign-out use auth provider/session semantics rather than domain `can`. `/mcp` authenticates token and dispatches guarded tools; JSON-RPC initialize/list discovery has no business authorization action. `getSession`, authentication and call persistence are transport/internal helpers, not independent business tools.

Conditional gates: task changes may also require owner/schedule/assignment permissions; suggestion apply/undo reuses task operation guards; mind task creation calls task creation; CRM reads additionally redact phone/email with contact:details and finance with finance:read; timeline/projects/brief redact finance; relation graph conditionally adds CRM. Rows list primary plus significant mutation gates, not a complete dynamic call graph. Function declaration references locate the implementation; helper chains described above were manually reviewed. Rule-test line references are cases within `it.each` matrices, **not assertions that the endpoint itself was exercised**.

## REST routes

| Method/path | Adapter | Core implementation | can action → table-driven rule evidence |
|---|---|---|---|
| `ALL /mcp` | apps/api/src/app.ts:112 | authenticateAgentToken (packages/core/src/index.ts:1002) | transport: authenticate, dispatch guarded tool |
| `GET /api/health` | apps/api/src/app.ts:206 | no core business method | public auth/health exception |
| `GET /api/auth/methods` | apps/api/src/app.ts:207 | getAuthMethods (manual helper mapping) | public auth/health exception |
| `POST /api/auth/phone-number/send-otp` | apps/api/src/app.ts:215 | handlePhoneAuth (manual helper mapping) | public auth/health exception |
| `POST /api/auth/phone-number/verify` | apps/api/src/app.ts:215 | handlePhoneAuth (manual helper mapping) | public auth/health exception |
| `POST /api/auth/sign-in/email` | apps/api/src/app.ts:245 | auth (manual helper mapping) | public auth/health exception |
| `POST /api/auth/sign-in/username` | apps/api/src/app.ts:249 | auth (manual helper mapping) | public auth/health exception |
| `POST /api/auth/sign-up/email` | apps/api/src/app.ts:256 | auth (manual helper mapping) | public auth/health exception |
| `POST /api/auth/sign-out` | apps/api/src/app.ts:262 | auth (manual helper mapping) | public auth/health exception |
| `GET /api/realtime` | apps/api/src/app.ts:285 | listMembers (packages/core/src/index.ts:437) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `GET /api/me/email-verification` | apps/api/src/app.ts:300 | getEmailVerificationStatus (packages/core/src/email-verification.ts:49) | profile:update → packages/core/src/permissions.test.ts:95 |
| `POST /api/me/email-verification/request` | apps/api/src/app.ts:305 | requestEmailVerification (packages/core/src/email-verification.ts:52) | profile:update → packages/core/src/permissions.test.ts:95 |
| `POST /api/me/email-verification/verify` | apps/api/src/app.ts:321 | verifyEmailOwnership (packages/core/src/email-verification.ts:81) | profile:update → packages/core/src/permissions.test.ts:95 |
| `GET /api/me` | apps/api/src/app.ts:329 | getMe (packages/core/src/index.ts:397) | session identity read; no can (gap) |
| `GET /api/bootstrap` | apps/api/src/app.ts:330 | getMe (packages/core/src/index.ts:397) | session identity read; no can (gap) |
| `GET /api/bootstrap/today` | apps/api/src/app.ts:334 | getTodayBootstrap (packages/core/src/today-bootstrap.ts:37) | inbox:read → packages/core/src/permissions.test.ts:545<br>workspace:read → packages/core/src/permissions.test.ts:25 |
| `GET /api/me/notifications` | apps/api/src/app.ts:342 | getNotificationPreferences (packages/core/src/notifications.ts:262) | notification:read → packages/core/src/notifications-permissions.test.ts:14 |
| `PATCH /api/me/notifications` | apps/api/src/app.ts:347 | updateNotificationPreferences (packages/core/src/notifications.ts:272) | notification:update → packages/core/src/notifications-permissions.test.ts:16 |
| `GET /api/digests` | apps/api/src/app.ts:355 | listDailyDigests (packages/core/src/notifications.ts:301) | digest:read → packages/core/src/notifications-permissions.test.ts:35 |
| `GET /api/digests/:id` | apps/api/src/app.ts:361 | getDailyDigest (packages/core/src/notifications.ts:329) | digest:read → packages/core/src/notifications-permissions.test.ts:35 |
| `GET /api/members` | apps/api/src/app.ts:369 | listMembers (packages/core/src/index.ts:437) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `GET /api/tasks` | apps/api/src/app.ts:375 | listTasks (packages/core/src/index.ts:484) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/tasks` | apps/api/src/app.ts:397 | createTask (packages/core/src/index.ts:552) | task:create → packages/core/src/permissions.test.ts:34 |
| `PATCH /api/tasks/:id/assignment` | apps/api/src/app.ts:404 | assignTask (packages/core/src/index.ts:757) | task:assign → packages/core/src/permissions.test.ts:35 |
| `PATCH /api/tasks/:id/status` | apps/api/src/app.ts:411 | updateTaskStatus (packages/core/src/index.ts:770) | task:review → packages/core/src/permissions.test.ts:85<br>task:status → packages/core/src/permissions.test.ts:60 |
| `PATCH /api/tasks/:id/schedule` | apps/api/src/app.ts:418 | scheduleTask (packages/core/src/index.ts:783) | task:schedule → packages/core/src/permissions.test.ts:86 |
| `GET /api/tasks/:id` | apps/api/src/app.ts:425 | getTask (packages/core/src/runs.ts:168) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `PATCH /api/tasks/:id` | apps/api/src/app.ts:433 | updateTask (packages/core/src/planning.ts:296) | task:edit → packages/core/src/permissions.test.ts:618<br>task:owner → packages/core/src/permissions.test.ts:651<br>task:schedule → packages/core/src/permissions.test.ts:86 |
| `GET /api/tasks/:id/access` | apps/api/src/app.ts:442 | getTaskAccess (packages/core/src/planning.ts:237) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `GET /api/tasks/:id/calendar` | apps/api/src/app.ts:450 | getTaskCalendar (packages/core/src/calendar.ts:101) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `PATCH /api/tasks/:id/calendar` | apps/api/src/app.ts:458 | setTaskCalendar (packages/core/src/calendar.ts:131) | task:schedule → packages/core/src/permissions.test.ts:86 |
| `GET /api/calendar` | apps/api/src/app.ts:467 | listCalendar (packages/core/src/calendar.ts:174) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `GET /api/tasks/:id/comments` | apps/api/src/app.ts:478 | listTaskComments (packages/core/src/planning.ts:373) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/tasks/:id/comments` | apps/api/src/app.ts:486 | addTaskComment (packages/core/src/planning.ts:386) | task:comment → packages/core/src/permissions.test.ts:653 |
| `GET /api/projects` | apps/api/src/app.ts:496 | listProjects (packages/core/src/planning.ts:419) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/projects` | apps/api/src/app.ts:502 | createProject (packages/core/src/planning.ts:431) | project:manage → packages/core/src/permissions.test.ts:613 |
| `PATCH /api/projects/:id` | apps/api/src/app.ts:513 | updateProject (packages/core/src/planning.ts:447) | finance:manage → packages/core/src/permissions.test.ts:775<br>project:manage → packages/core/src/permissions.test.ts:613 |
| `POST /api/workspaces` | apps/api/src/app.ts:523 | createWorkspace (packages/core/src/planning.ts:506) | workspace:create → packages/core/src/permissions.test.ts:731<br>workspace:manage → packages/core/src/permissions.test.ts:585 |
| `GET /api/workspaces/:id/invites` | apps/api/src/app.ts:532 | listWorkspaceInvites (packages/core/src/planning.ts:569) | workspace:manage → packages/core/src/permissions.test.ts:585 |
| `GET /api/workspaces/:id/access` | apps/api/src/app.ts:540 | getWorkspaceAccess (packages/core/src/planning.ts:205) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/workspaces/:id/invites` | apps/api/src/app.ts:548 | createWorkspaceInvite (packages/core/src/planning.ts:583) | workspace:manage → packages/core/src/permissions.test.ts:585 |
| `DELETE /api/workspace-invites/:id` | apps/api/src/app.ts:558 | revokeWorkspaceInvite (packages/core/src/planning.ts:668) | workspace:manage → packages/core/src/permissions.test.ts:585 |
| `POST /api/workspace-invites/accept` | apps/api/src/app.ts:566 | acceptWorkspaceInvite (packages/core/src/planning.ts:685) | workspace:join → packages/core/src/permissions.test.ts:731 |
| `POST /api/workspaces/:id/members` | apps/api/src/app.ts:574 | createWorkspaceAgent (packages/core/src/index.ts:453) | workspace:manage → packages/core/src/permissions.test.ts:585 |
| `PATCH /api/workspaces/:id/members/:memberId` | apps/api/src/app.ts:584 | updateMemberRole (packages/core/src/planning.ts:757) | workspace:manage → packages/core/src/permissions.test.ts:585 |
| `POST /api/search` | apps/api/src/app.ts:594 | search (packages/core/src/planning.ts:823) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/quick-add/parse` | apps/api/src/app.ts:604 | parseQuickAdd (packages/core/src/planning.ts:795) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `GET /api/runs` | apps/api/src/app.ts:614 | listRuns (packages/core/src/runs.ts:182) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `GET /api/runs/:id` | apps/api/src/app.ts:620 | getRun (packages/core/src/runs.ts:197) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/tasks/:id/runs` | apps/api/src/app.ts:628 | startRun (packages/core/src/runs.ts:328) | run:start → packages/core/src/permissions.test.ts:410 |
| `POST /api/runs/:id/control` | apps/api/src/app.ts:638 | controlRun (packages/core/src/runs.ts:369) | run:control → packages/core/src/permissions.test.ts:418 |
| `POST /api/runs/:id/events` | apps/api/src/app.ts:647 | appendRunEvent (packages/core/src/runs.ts:455) | capability:use → packages/core/src/permissions.test.ts:300<br>run:submit → packages/core/src/permissions.test.ts:427 |
| `POST /api/runs/:id/artifacts` | apps/api/src/app.ts:657 | attachRunArtifact (packages/core/src/runs.ts:534) | files:attach → packages/core/src/permissions.test.ts:382 |
| `POST /api/runs/:id/submit` | apps/api/src/app.ts:667 | submitRun (packages/core/src/runs.ts:563) | run:request_review → packages/core/src/permissions.test.ts:275<br>run:submit → packages/core/src/permissions.test.ts:427<br>task:finish → packages/core/src/permissions.test.ts:438 |
| `GET /api/tasks/:id/review` | apps/api/src/app.ts:676 | getReview (packages/core/src/runs.ts:660) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/runs/:id/review` | apps/api/src/app.ts:684 | reviewRun (packages/core/src/runs.ts:765) | task:review → packages/core/src/permissions.test.ts:85 |
| `POST /api/runs/:id/comments` | apps/api/src/app.ts:693 | addReviewComment (packages/core/src/runs.ts:711) | review:comment → packages/core/src/permissions.test.ts:533 |
| `GET /api/agents/:id` | apps/api/src/app.ts:703 | getAgentProfile (packages/core/src/runs.ts:871) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `PATCH /api/agents/:id` | apps/api/src/app.ts:711 | updateAgentProfile (packages/core/src/runs.ts:954) | agent:manage → packages/core/src/permissions.test.ts:463 |
| `PUT /api/agents/:id/permissions` | apps/api/src/app.ts:720 | setAgentPermission (packages/core/src/runs.ts:985) | agent:manage → packages/core/src/permissions.test.ts:463 |
| `POST /api/agents/:id/grants` | apps/api/src/app.ts:729 | requestGrant (packages/core/src/runs.ts:1004) | grant:request → packages/core/src/permissions.test.ts:283 |
| `POST /api/grants/:id/decision` | apps/api/src/app.ts:739 | decideGrant (packages/core/src/runs.ts:1143) | grant:decide → packages/core/src/permissions.test.ts:497 |
| `GET /api/inbox` | apps/api/src/app.ts:748 | listInbox (packages/core/src/runs.ts:1226) | inbox:read → packages/core/src/permissions.test.ts:545 |
| `PATCH /api/inbox/:id` | apps/api/src/app.ts:759 | updateInboxItem (packages/core/src/runs.ts:1274) | inbox:update → packages/core/src/permissions.test.ts:550 |
| `GET /api/agent-tokens` | apps/api/src/app.ts:768 | listAgentTokens (packages/core/src/index.ts:885) | token:manage → packages/core/src/permissions.test.ts:90 |
| `POST /api/agent-tokens` | apps/api/src/app.ts:774 | createAgentToken (packages/core/src/index.ts:844) | token:manage → packages/core/src/permissions.test.ts:90 |
| `DELETE /api/agent-tokens/:id` | apps/api/src/app.ts:781 | revokeAgentToken (packages/core/src/index.ts:909) | token:manage → packages/core/src/permissions.test.ts:90 |
| `POST /api/agent-tokens/:id/restore` | apps/api/src/app.ts:787 | restoreAgentToken (packages/core/src/index.ts:938) | token:manage → packages/core/src/permissions.test.ts:90 |
| `GET /api/mcp-calls` | apps/api/src/app.ts:793 | listMcpCalls (packages/core/src/index.ts:1051) | token:manage → packages/core/src/permissions.test.ts:90 |
| `PATCH /api/profile` | apps/api/src/app.ts:799 | updateProfile (packages/core/src/index.ts:811) | profile:update → packages/core/src/permissions.test.ts:95 |
| `GET /api/brief` | apps/api/src/routes/assistant.ts:29 | getBrief (packages/core/src/assistant.ts:353) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/ask` | apps/api/src/routes/assistant.ts:38 | ask (packages/core/src/assistant.ts:378) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `GET /api/workspaces/:id/suggestions` | apps/api/src/routes/assistant.ts:56 | listSuggestions (packages/core/src/suggestions.ts:170) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/suggestions/:id/apply` | apps/api/src/routes/assistant.ts:65 | applySuggestion (packages/core/src/suggestions.ts:235) | suggestion:decide → packages/core/src/permissions.test.ts:1003 |
| `POST /api/suggestions/:id/undo` | apps/api/src/routes/assistant.ts:74 | undoSuggestion (packages/core/src/suggestions.ts:315) | suggestion:undo → packages/core/src/permissions.test.ts:991 |
| `POST /api/suggestions/:id/dismiss` | apps/api/src/routes/assistant.ts:83 | dismissSuggestion (packages/core/src/suggestions.ts:447) | suggestion:decide → packages/core/src/permissions.test.ts:1003 |
| `GET /api/workspaces/:id/ai` | apps/api/src/routes/assistant.ts:92 | getAiSettings (packages/core/src/assistant.ts:431) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `PATCH /api/workspaces/:id/ai` | apps/api/src/routes/assistant.ts:100 | setAiSettings (packages/core/src/assistant.ts:445) | workspace:manage → packages/core/src/permissions.test.ts:585 |
| `GET /api/companies` | apps/api/src/routes/crm.ts:51 | listCompanies (packages/core/src/crm.ts:289) | contact:read → packages/core/src/permissions.test.ts:797 |
| `POST /api/companies` | apps/api/src/routes/crm.ts:65 | createCompany (packages/core/src/crm.ts:346) | contact:manage → packages/core/src/permissions.test.ts:806 |
| `GET /api/companies/:id` | apps/api/src/routes/crm.ts:76 | getCompany (packages/core/src/crm.ts:310) | contact:read → packages/core/src/permissions.test.ts:797 |
| `PATCH /api/companies/:id` | apps/api/src/routes/crm.ts:79 | updateCompany (packages/core/src/crm.ts:362) | contact:manage → packages/core/src/permissions.test.ts:806<br>crm:archive → packages/core/src/permissions.test.ts:815 |
| `DELETE /api/companies/:id` | apps/api/src/routes/crm.ts:88 | updateCompany (packages/core/src/crm.ts:362) | contact:manage → packages/core/src/permissions.test.ts:806<br>crm:archive → packages/core/src/permissions.test.ts:815 |
| `GET /api/contacts` | apps/api/src/routes/crm.ts:96 | listContacts (packages/core/src/crm.ts:399) | contact:read → packages/core/src/permissions.test.ts:797 |
| `POST /api/contacts` | apps/api/src/routes/crm.ts:110 | createContact (packages/core/src/crm.ts:547) | contact:manage → packages/core/src/permissions.test.ts:806 |
| `GET /api/contacts/:id` | apps/api/src/routes/crm.ts:121 | getContactDetail (packages/core/src/crm.ts:455) | contact:read → packages/core/src/permissions.test.ts:797 |
| `PATCH /api/contacts/:id` | apps/api/src/routes/crm.ts:124 | updateContact (packages/core/src/crm.ts:571) | contact:manage → packages/core/src/permissions.test.ts:806<br>crm:archive → packages/core/src/permissions.test.ts:815 |
| `DELETE /api/contacts/:id` | apps/api/src/routes/crm.ts:133 | updateContact (packages/core/src/crm.ts:571) | contact:manage → packages/core/src/permissions.test.ts:806<br>crm:archive → packages/core/src/permissions.test.ts:815 |
| `PATCH /api/contacts/:id/company` | apps/api/src/routes/crm.ts:141 | setContactCompany (packages/core/src/crm.ts:615) | contact:manage → packages/core/src/permissions.test.ts:806 |
| `GET /api/companies/:id/contacts` | apps/api/src/routes/crm.ts:151 | listContactLinks (packages/core/src/crm.ts:684) | contact:read → packages/core/src/permissions.test.ts:797 |
| `GET /api/projects/:id/contacts` | apps/api/src/routes/crm.ts:151 | listContactLinks (packages/core/src/crm.ts:684) | contact:read → packages/core/src/permissions.test.ts:797 |
| `GET /api/tasks/:id/contacts` | apps/api/src/routes/crm.ts:151 | listContactLinks (packages/core/src/crm.ts:684) | contact:read → packages/core/src/permissions.test.ts:797 |
| `PUT /api/companies/:id/contacts/:contactId` | apps/api/src/routes/crm.ts:154 | setContactRoles (packages/core/src/crm.ts:695) | contact:manage → packages/core/src/permissions.test.ts:806 |
| `PUT /api/projects/:id/contacts/:contactId` | apps/api/src/routes/crm.ts:154 | setContactRoles (packages/core/src/crm.ts:695) | contact:manage → packages/core/src/permissions.test.ts:806 |
| `PUT /api/tasks/:id/contacts/:contactId` | apps/api/src/routes/crm.ts:154 | setContactRoles (packages/core/src/crm.ts:695) | contact:manage → packages/core/src/permissions.test.ts:806 |
| `DELETE /api/companies/:id/contacts/:contactId` | apps/api/src/routes/crm.ts:165 | unlinkContact (packages/core/src/crm.ts:814) | contact:manage → packages/core/src/permissions.test.ts:806 |
| `DELETE /api/projects/:id/contacts/:contactId` | apps/api/src/routes/crm.ts:165 | unlinkContact (packages/core/src/crm.ts:814) | contact:manage → packages/core/src/permissions.test.ts:806 |
| `DELETE /api/tasks/:id/contacts/:contactId` | apps/api/src/routes/crm.ts:165 | unlinkContact (packages/core/src/crm.ts:814) | contact:manage → packages/core/src/permissions.test.ts:806 |
| `GET /api/workspaces/:id/crm/audit` | apps/api/src/routes/crm.ts:169 | auditCrm (packages/core/src/crm.ts:883) | crm:audit → packages/core/src/permissions.test.ts:823 |
| `GET /api/workspaces/:id/crm/search` | apps/api/src/routes/crm.ts:172 | searchCrm (packages/core/src/crm.ts:954) | contact:read → packages/core/src/permissions.test.ts:797 |
| `GET /api/workspaces/:id/mind` | apps/api/src/routes/mind.ts:28 | getMindMap (packages/core/src/mind.ts:144) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/workspaces/:id/mind/nodes` | apps/api/src/routes/mind.ts:37 | createMindNode (packages/core/src/mind.ts:233) | mind:write → packages/core/src/permissions.test.ts:1020 |
| `PATCH /api/mind/nodes/:id` | apps/api/src/routes/mind.ts:47 | updateMindNode (packages/core/src/mind.ts:257) | mind:archive → packages/core/src/permissions.test.ts:1042<br>mind:write → packages/core/src/permissions.test.ts:1020 |
| `POST /api/mind/nodes/:id/task` | apps/api/src/routes/mind.ts:56 | createValidationTask (packages/core/src/mind.ts:520) | mind:write → packages/core/src/permissions.test.ts:1020<br>task:create → packages/core/src/permissions.test.ts:34 |
| `PUT /api/mind/nodes/:id/sources/:sourceId` | apps/api/src/routes/mind.ts:66 | linkMindSource (packages/core/src/mind.ts:461) | mind:write → packages/core/src/permissions.test.ts:1020 |
| `DELETE /api/mind/nodes/:id/sources/:sourceId` | apps/api/src/routes/mind.ts:76 | unlinkMindSource (packages/core/src/mind.ts:491) | mind:write → packages/core/src/permissions.test.ts:1020 |
| `POST /api/workspaces/:id/mind/edges` | apps/api/src/routes/mind.ts:85 | createMindEdge (packages/core/src/mind.ts:298) | mind:write → packages/core/src/permissions.test.ts:1020 |
| `PATCH /api/mind/edges/:id` | apps/api/src/routes/mind.ts:95 | updateMindEdge (packages/core/src/mind.ts:356) | mind:write → packages/core/src/permissions.test.ts:1020 |
| `DELETE /api/mind/edges/:id` | apps/api/src/routes/mind.ts:104 | removeMindEdge (packages/core/src/mind.ts:386) | mind:write → packages/core/src/permissions.test.ts:1020 |
| `POST /api/workspaces/:id/mind/sources` | apps/api/src/routes/mind.ts:107 | createMindSource (packages/core/src/mind.ts:402) | mind:write → packages/core/src/permissions.test.ts:1020 |
| `PATCH /api/mind/sources/:id` | apps/api/src/routes/mind.ts:117 | updateMindSource (packages/core/src/mind.ts:423) | mind:archive → packages/core/src/permissions.test.ts:1042<br>mind:write → packages/core/src/permissions.test.ts:1020 |
| `GET /api/workspaces/:id/graph` | apps/api/src/routes/relations.ts:12 | relationGraph (packages/core/src/relations.ts:50) | contact:read → packages/core/src/permissions.test.ts:797<br>workspace:read → packages/core/src/permissions.test.ts:25 |
| `GET /api/projects/:id/timeline` | apps/api/src/routes/timeline.ts:23 | getTimeline (packages/core/src/timeline.ts:385) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `PATCH /api/tasks/:id/plan` | apps/api/src/routes/timeline.ts:31 | setTaskPlan (packages/core/src/timeline.ts:441) | task:schedule → packages/core/src/permissions.test.ts:86 |
| `GET /api/projects/:id/milestones` | apps/api/src/routes/timeline.ts:40 | listMilestones (packages/core/src/timeline.ts:597) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `POST /api/projects/:id/milestones` | apps/api/src/routes/timeline.ts:48 | createMilestone (packages/core/src/timeline.ts:617) | project:manage → packages/core/src/permissions.test.ts:613 |
| `PATCH /api/milestones/:id` | apps/api/src/routes/timeline.ts:58 | updateMilestone (packages/core/src/timeline.ts:634) | project:manage → packages/core/src/permissions.test.ts:613 |
| `DELETE /api/milestones/:id` | apps/api/src/routes/timeline.ts:68 | archiveMilestone (packages/core/src/timeline.ts:671) | project:manage → packages/core/src/permissions.test.ts:613 |
| `POST /api/dependencies` | apps/api/src/routes/timeline.ts:78 | addDependency (packages/core/src/timeline.ts:729) | dependency:edit → packages/core/src/permissions.test.ts:886 |
| `DELETE /api/dependencies/:id` | apps/api/src/routes/timeline.ts:87 | removeDependency (packages/core/src/timeline.ts:821) | dependency:edit → packages/core/src/permissions.test.ts:886 |
| `GET /api/projects/:id/payments` | apps/api/src/routes/timeline.ts:95 | listPayments (packages/core/src/timeline.ts:845) | finance:read → packages/core/src/permissions.test.ts:773 |
| `POST /api/projects/:id/payments` | apps/api/src/routes/timeline.ts:103 | addPayment (packages/core/src/timeline.ts:864) | finance:manage → packages/core/src/permissions.test.ts:775 |

## MCP tools

| Tool | Registration | Core implementation | can action → table-driven rule evidence |
|---|---|---|---|
| `companies.list` | apps/api/src/mcp-crm.ts:21 | listCompanies (packages/core/src/crm.ts:289) | contact:read → packages/core/src/permissions.test.ts:797 |
| `contacts.list` | apps/api/src/mcp-crm.ts:32 | listContacts (packages/core/src/crm.ts:399) | contact:read → packages/core/src/permissions.test.ts:797 |
| `contacts.get` | apps/api/src/mcp-crm.ts:43 | getContactDetail (packages/core/src/crm.ts:455) | contact:read → packages/core/src/permissions.test.ts:797 |
| `relations.get` | apps/api/src/mcp-insights.ts:23 | relationGraph (packages/core/src/relations.ts:50) | contact:read → packages/core/src/permissions.test.ts:797<br>workspace:read → packages/core/src/permissions.test.ts:25 |
| `brief.get` | apps/api/src/mcp-insights.ts:34 | getBrief (packages/core/src/assistant.ts:353) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `suggestions.create` | apps/api/src/mcp-insights.ts:50 | createSuggestion (packages/core/src/suggestions.ts:115) | suggestion:create → packages/core/src/permissions.test.ts:949 |
| `timeline.get` | apps/api/src/mcp-timeline.ts:25 | getTimeline (packages/core/src/timeline.ts:385) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `tasks.plan` | apps/api/src/mcp-timeline.ts:35 | setTaskPlan (packages/core/src/timeline.ts:441) | task:schedule → packages/core/src/permissions.test.ts:86 |
| `dependencies.add` | apps/api/src/mcp-timeline.ts:46 | addDependency (packages/core/src/timeline.ts:729) | dependency:edit → packages/core/src/permissions.test.ts:886 |
| `dependencies.remove` | apps/api/src/mcp-timeline.ts:56 | removeDependency (packages/core/src/timeline.ts:821) | dependency:edit → packages/core/src/permissions.test.ts:886 |
| `tasks.list` | apps/api/src/mcp.ts:104 | listTasks (packages/core/src/index.ts:484) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `tasks.create` | apps/api/src/mcp.ts:113 | createTask (packages/core/src/index.ts:552) | task:create → packages/core/src/permissions.test.ts:34 |
| `tasks.update` | apps/api/src/mcp.ts:130 | updateTaskWork (packages/core/src/index.ts:723) | task:assign → packages/core/src/permissions.test.ts:35<br>task:status → packages/core/src/permissions.test.ts:60 |
| `tasks.edit` | apps/api/src/mcp.ts:147 | updateTask (packages/core/src/planning.ts:296) | task:edit → packages/core/src/permissions.test.ts:618<br>task:owner → packages/core/src/permissions.test.ts:651<br>task:schedule → packages/core/src/permissions.test.ts:86 |
| `tasks.comments.list` | apps/api/src/mcp.ts:158 | listTaskComments (packages/core/src/planning.ts:373) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `tasks.comments.add` | apps/api/src/mcp.ts:167 | addTaskComment (packages/core/src/planning.ts:386) | task:comment → packages/core/src/permissions.test.ts:653 |
| `projects.list` | apps/api/src/mcp.ts:178 | listProjects (packages/core/src/planning.ts:419) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `search.query` | apps/api/src/mcp.ts:188 | search (packages/core/src/planning.ts:823) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `quickadd.parse` | apps/api/src/mcp.ts:198 | parseQuickAdd (packages/core/src/planning.ts:795) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `calendar.list` | apps/api/src/mcp.ts:209 | listCalendar (packages/core/src/calendar.ts:174) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `calendar.set` | apps/api/src/mcp.ts:220 | setTaskCalendar (packages/core/src/calendar.ts:131) | task:schedule → packages/core/src/permissions.test.ts:86 |
| `calendar.schedule` | apps/api/src/mcp.ts:231 | scheduleTask (packages/core/src/index.ts:783) | task:schedule → packages/core/src/permissions.test.ts:86 |
| `inbox.request_review` | apps/api/src/mcp.ts:244 | requestReview (packages/core/src/runs.ts:1314) | run:request_review → packages/core/src/permissions.test.ts:275<br>run:submit → packages/core/src/permissions.test.ts:427<br>workspace:read → packages/core/src/permissions.test.ts:25 |
| `runs.get` | apps/api/src/mcp.ts:257 | getRun (packages/core/src/runs.ts:197) | workspace:read → packages/core/src/permissions.test.ts:25 |
| `runs.start` | apps/api/src/mcp.ts:267 | startRun (packages/core/src/runs.ts:328) | run:start → packages/core/src/permissions.test.ts:410 |
| `runs.control` | apps/api/src/mcp.ts:277 | controlRun (packages/core/src/runs.ts:369) | run:control → packages/core/src/permissions.test.ts:418 |
| `runs.event` | apps/api/src/mcp.ts:288 | appendRunEvent (packages/core/src/runs.ts:455) | capability:use → packages/core/src/permissions.test.ts:300<br>run:submit → packages/core/src/permissions.test.ts:427 |
| `files.attach` | apps/api/src/mcp.ts:299 | attachRunArtifact (packages/core/src/runs.ts:534) | files:attach → packages/core/src/permissions.test.ts:382 |
| `runs.submit` | apps/api/src/mcp.ts:310 | submitRun (packages/core/src/runs.ts:563) | run:request_review → packages/core/src/permissions.test.ts:275<br>run:submit → packages/core/src/permissions.test.ts:427<br>task:finish → packages/core/src/permissions.test.ts:438 |
| `grants.request` | apps/api/src/mcp.ts:320 | requestGrant (packages/core/src/runs.ts:1004) | grant:request → packages/core/src/permissions.test.ts:283 |

## Person/agent parity recommendation

`suggestions.create` is a literal exception: `packages/core/src/suggestions.ts:120` refuses user principals and `packages/core/src/permissions.ts:135` allows only an agent. The matrix explicitly tests that a person cannot propose (`packages/core/src/permissions.test.ts`, Phase B table). Human owners can directly split/reschedule, so the agent lacks authority to alter tasks without human acceptance; nevertheless the standing requirement says no agent-only code path, and the current proposal workflow fails that literal requirement.

The standing user requirement is explicit, so a narrow parity correction is authorized and should not be deferred merely as an unspecified product decision. Allow a person who owns the task (or an admin), expose the same createSuggestion core operation through a human REST route, and record the actual person proposer. Do **not** impersonate an agent. Existing suggestions.created_by already references members of either kind (`packages/db/src/schema.ts:1263`, `:1284`), so a DB migration is not intrinsically needed. However assistant source currently relabels created_by as agentId (`packages/core/src/assistant.ts:197`), and proposal UI resolves that through agent-only labels (`apps/web/src/components/brief-view.tsx:600`). Correct the shared proposer representation and labels, preserve current agent restrictions, and test person/agent/cross-workspace/guest cases plus apply/dismiss/undo. This is larger than a one-line can widening but is a bounded parity fix directly requested by the user; recommend implementation rather than a product-decision-only exception. No behavior change implemented in this read-only assignment.

## Verification evidence

Prior scoped run: 268 tests in permission/API CRM/insights/logger suites passed. This inventory itself is static evidence extraction with manually assigned primary gates, not execution of every role/endpoint combination. The JSON preserves all expanded endpoint patterns and method mapping for a future exhaustive authorization matrix. Public URL security probes and production-read-only checks remain owned by lead.

## Follow-up implementation prepared for review

- Human suggestion parity: PR https://github.com/ksamint/taff01/pull/42, `7ce291c`. One additional REST registration (`POST /api/suggestions`) uses the shared core/schema; person proposer attribution preserved through brief, Ask and all three UI locales. No migration. Node 24 checks: 270 focused tests including local PostgreSQL integration, six-package typecheck, lint and diff checks passed.
- Self identity read guard: branch `fix/self-profile-read-permission`, `79e323b`, adds `profile:read` and invokes can in getMe before response data; same account-identity pattern as notifications. Node 24 checks: 287 tests including local PostgreSQL, API boundaries, Today bootstrap and new eight-case permission matrix; core typecheck and formatting passed.
- Neither PR is merged/deployed by this worker. The original inventory counts describe v0.2.1, not the proposed v0.2.2 changes. Exhaustive per-endpoint × actor × workspace authorization matrix remains broader P2 test debt; permission-action test references must not be presented as endpoint-level execution evidence.
