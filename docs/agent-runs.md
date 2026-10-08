# Agent runs and review contract

Core keeps the existing `Principal` (`userPrincipal(userId)` or authenticated agent token). All IDs are UUIDs, timestamps ISO UTC JSON transport. costMicros means measured USD microdollars (1,000,000 = US$1). No worker simulation: start creates a `running` record; an external agent submits real events/artifacts and completion. All mutations are transactional, audited and emit `taff_changes`.

## Runs and review

- `getTask(principal, taskId): Task`
- `listRuns(principal, workspaceId): Run[]`
- `getRun(principal, runId): RunDetail` (`run`, `events`, `artifacts`, `canControl`, `canSubmit`)
- `startRun(principal, taskId, StartRun): Run`; `startRunSchema={}`. Requires an assigned agent. Locks task; one active run per task. Task becomes `in_progress`.
- `controlRun(principal, runId, ControlRun): Run`; `controlRunSchema={version, action:'pause'|'resume'|'cancel'}`
- `appendRunEvent(principal, runId, AppendRunEvent): RunEvent`; `appendRunEventSchema={version, kind:'step'|'tool_call'|'message'|'source'|'test', title, text?, sourceUrl?, testStatus?:'passed'|'failed'|'skipped', durationMs?:number, costMicros?:number, capability?:Capability}`. Bumps run version; getRun after submitting.
- `attachRunArtifact(principal, runId, AttachRunArtifact): RunArtifact`; `attachRunArtifactSchema={version,name,mimeType,content,diff?,sourceUrl?}`. Content and optional diff each have a 200,000-character limit; request body is bounded to 1 MiB. At most 100 artifacts per run. No HTML execution or URL fetching. Bumps version.
- `submitRun(principal, runId, SubmitRun): Run`; `submitRunSchema={version,summary,requestReview?:boolean}`. At least one real artifact required. Default `always_review` sets task/run `needs_review`; per-agent `ask_only` may complete if explicitly requestReview:false.
- `getReview(principal, taskId): ReviewWorkspace`; includes `task,run,events,artifacts,checks,comments,canReview`. `checks={matchesDescription,verifiable,withinPermissions}`; defaults false.
- `reviewRun(principal, runId, ReviewRun): Run`; `reviewRunSchema={version,decision:'approve'|'request_changes',checks,comment?,items?:[{artifactId,decision,comment?}]}`. Approval requires three checks and explicit approval of EVERY artifact. Request changes requires nonempty comment (overall or item). Stale version returns `conflict` 409. Approval sets task done/run completed. Changes sets task in_progress/run changes_requested; resume enables further submissions.
- `addReviewComment(principal, runId, ReviewCommentInput): ReviewComment`; `reviewCommentSchema={version,body,artifactId?:UUID,eventId?:UUID,line?:positive integer}`. Comments persist scoped to run/item; bumps version to reject concurrent stale approval.

`Run={id,workspaceId,taskId,agentId,status,version,summary,startedAt,finishedAt,updatedAt,durationMs,costMicros}`.
`RunEvent={id,workspaceId,runId,kind,title,text,sourceUrl,testStatus,durationMs,costMicros,createdAt}`.
`RunArtifact={id,workspaceId,runId,name,mimeType,content,diff,sourceUrl,createdAt}`.
`ReviewComment={id,workspaceId,runId,authorId,body,artifactId,eventId,line,createdAt}`.

Events also expose the submitted `capability` when present. Agent history includes
whitelisted decision details and previous grant status, displayed with localized
labels and member names. Duration and cost limits pause core submissions based on
reported metrics; external agents remain responsible for stopping their own work.

REST recommendation: GET `/api/tasks/:id`; GET `/api/runs?workspaceId=...`; GET `/api/runs/:id`; POST `/api/tasks/:id/runs`; POST `/api/runs/:id/control`; POST `/api/runs/:id/events`; POST `/api/runs/:id/artifacts`; POST `/api/runs/:id/submit`; GET `/api/tasks/:id/review`; POST `/api/runs/:id/review`; POST `/api/runs/:id/comments`.
MCP exports `mcpFilesAttachArgs={runId,...attachRunArtifactSchema}`; files.attach calls attachRunArtifact after separating runId. The tools runs.get/runs.start/runs.control/runs.event/runs.submit and grants.request use the same validated inputs. `inbox.request_review` submits the current running version and requires actual artifacts. Direct task status changes cannot complete agent work or bypass review.

## Agent profile, permissions and grants

- `getAgentProfile(principal, agentId): AgentProfile` (`member,supervisorId,reviewPolicy,maxDurationMs,maxCostMicros,permissions,grants,history,runs,canManage,canDecideGrants`). `AgentPermission={capability,decision}`.
- `updateAgentProfile(principal,agentId,AgentProfileInput): AgentProfile`; `agentProfileInputSchema={supervisorId:UUID|null,reviewPolicy:'always_review'|'ask_only',maxDurationMs?:number|null,maxCostMicros?:number|null}`; admin only.
- `setAgentPermission(principal,agentId,AgentPermissionInput): AgentProfile`; `agentPermissionInputSchema={capability,decision:'allow'|'ask'|'deny'}`; admin only.
- `requestGrant(principal,agentId,RequestGrant): Grant`; `requestGrantSchema={capability,taskId?:UUID,runId?:UUID,reason}`; own agent or task owner/admin may request. Creates a blocker Inbox item, pauses running run.
- `decideGrant(principal,grantId,DecideGrant): Grant`; `decideGrantSchema={decision:'allow'|'deny'|'revoke',expiresAt?:ISO}`; supervisor or workspace admin; allow requires future expiry <=30days. `Grant={id,workspaceId,agentId,capability,taskId,runId,status:'pending'|'allowed'|'denied'|'revoked',reason,expiresAt,decidedBy,createdAt,updatedAt}`.
`Capability` values: `tasks.read,tasks.write,calendar.schedule,files.attach,web.search,repo.read,repo.pr,repo.merge,deploy.prod,staging.read,staging.write,alerts`. Token scopes remain separate and cap capabilities; new scope `files:write` required for agent files.attach. Grant cannot override deny or missing token scope. Permissions default task read/write/calendar/files allow; risky merge/deploy deny; other capabilities ask. Review policy default always_review. All configuration/grant history in audited activity DTOs.

REST GET/PATCH `/api/agents/:id`; PUT `/api/agents/:id/permissions`; POST `/api/agents/:id/grants`; POST `/api/grants/:id/decision`.

## Inbox

- `listInbox(principal,workspaceId,filter?:{tab?:'all'|'reviews'|'blockers'}): Inbox`.
  `Inbox={items:InboxItem[],groups:{taskId,items:InboxItem[]}[],unreadCount,reviewCount,blockerCount}`. Items include id/workspaceId/memberId/taskId/runId/grantId/kind/title/readAt/snoozedUntil/resolvedAt/createdAt. Snoozed and resolved hidden; badge counts only unread visible items. User-person only.
- `updateInboxItem(principal,itemId,InboxItemInput): InboxItem`; `inboxItemInputSchema={read?:boolean,snoozedUntil?:ISO|null}`. Own items only. Review/grant decisions resolve corresponding items for all recipients.
REST GET `/api/inbox?workspaceId=...&tab=...`; PATCH `/api/inbox/:id`.

Final additions: RunDetail.canControl/canSubmit and ReviewWorkspace.canReview are actual current actor decisions; AgentProfile.canManage/canDecideGrants drive profile controls. InboxItem includes agentId for direct blocker links. RunEvent.capability records the validated capability for tool-call evidence. AgentProfile.history entries include whitelisted `details` (decision/status/expiry/policy and previous values). `requestReview(principal,taskId,{note?}):Task` submits the current running run; legacy direct task status updates cannot bypass output/checklist review. Artifact submissions are bounded to100 per run, matching the maximum explicit review decisions. Agent limits pause a run based on submitted measured duration/cost and prevent further core submissions until an admin raises/removes the limit; they do not terminate an external process. Scope-specific grants apply to legacy scheduleTask through taskId/currentRunId as well as run tool events. Matching files:write-only or calendar:write-only tokens can request own Ask grants.
