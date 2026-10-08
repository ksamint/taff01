# Planning contract

Core owns PostgreSQL. REST and MCP validate the exported shared schemas, then call these functions. Core still takes `Principal` (signed-in user or authenticated agent token) first. Existing M3/M4 methods remain.

## Tasks

`Task` retains all existing fields and adds `description:string` (default empty), `priority:number` (1 urgent, 2 high, 3 medium default, 4 low), `projectId:string|null`, `labels:string[]` (unique, max20, each1–40), `parentId:string|null`, `version:number` (starts1). Existing fixtures need these six fields. `Member.role` adds `guest`; `Me.workspaces` stays `{id,name,memberId}`.

- `createTask(principal, input:CreateTask):Promise<Task>` / POST `/api/tasks`: existing fields plus optional description/priority/projectId/labels/parentId. For a subtask, omitted dueAt/priority/projectId inherit the parent; ownerId remains required and UI copies the parent owner. parentId is immutable, always same workspace; subtasks are ordinary tasks, independently assigned/completed. A parent completes only when all children are done; reopening a child conflicts until its parent is reopened first.
- `listTasks(principal,workspaceId,filter?:TaskFilter):Promise<Task[]>` / GET `/api/tasks?workspaceId=…`: optional status/projectId/parentId/ownerId/workerId/priority/label; sort `created|updated|due|priority|title`. Null projectId/parentId/workerId means unassigned/root; REST can map literal `null` to null before shared validation.
- `getTask(principal,id):Promise<Task>` remains.
- `updateTask(principal,id,input:UpdateTask):Promise<Task>` / PATCH `/api/tasks/:id`: required version plus one or more title/description/ownerId/dueAt/priority/projectId/labels/status. Shared `updateTaskSchema`. No parentId/workerId patch; assignment uses existing assign endpoint. Every task mutation including run transitions increments task version. Existing assign/status/schedule schemas accept optional version for old callers.
- `listTaskComments(principal,taskId):Promise<TaskComment[]>` / GET `/api/tasks/:id/comments`; `addTaskComment(principal,taskId,{body}):Promise<TaskComment>` / POST same; `taskCommentInputSchema`. DTO id/workspaceId/taskId/authorId/body/createdAt.

Owner/admin may edit, assigned agent may edit its own task with tasks:write capability; only people owner/admin change owner. DueAt uses calendar:write for agent. Active/pending-review runs block title/description/owner changes and all legacy status/assignment bypasses. Human done with an agent worker still requires actual review. No generated agent split or fake output. Guests are read-only. `getTaskAccess(principal,id)` / GET `/api/tasks/:id/access` returns shared `taskAccessSchema {canEdit,canEditMetadata,canComment,canAssign,allowedStatuses:TaskStatus[]}` from core permissions. Active run blocks context editing; metadata updates remain authorized. Date-only due controls use the user zone end-of-day deadline; dueAt is not a calendar duration/schedule.

## Projects

`listProjects(principal,workspaceId):Promise<Project[]>`; `createProject(principal,workspaceId,input:ProjectInput):Promise<Project>`; `updateProject(principal,id,input:ProjectUpdate):Promise<Project>`.

GET/POST `/api/projects?workspaceId=…`; PATCH `/api/projects/:id`. Shared `projectInputSchema {name}` and `projectUpdateSchema {version,name?,archived?}`. DTO `{id,workspaceId,name,archived,version,createdAt,updatedAt}`. Workspace human admins manage projects; all authorized members read. Archiving preserves existing tasks, prevents new assignment to archived project. Board columns use existing statuses and versioned task patch; review rules still apply.

## Organizations and invitations

`createWorkspace(principal,input:WorkspaceCreate):Promise<Workspace>` / POST `/api/workspaces` shared `workspaceCreateSchema {name,agentIds?:UUID[]}`. Creator becomes admin atomically. Optional selected agents must belong to a workspace the creator administers; new agent members are copied with fresh IDs and default policy, no tokens/grants/history copied. Returned `{id,name,memberId}`. Org switch is client-selected workspaceId; no server active-workspace mutation.

`listWorkspaceInvites(principal,workspaceId):Promise<WorkspaceInvite[]>` / GET `/api/workspaces/:id/invites`.
`createWorkspaceInvite(principal,workspaceId,input:WorkspaceInviteInput):Promise<IssuedWorkspaceInvite>` / POST same shared `workspaceInviteInputSchema {email,role}`; role admin/member/guest defaults member.
`revokeWorkspaceInvite(principal,inviteId):Promise<WorkspaceInvite>` / DELETE `/api/workspace-invites/:id` (revocation, no data deletion).
`acceptWorkspaceInvite(principal,input:WorkspaceInviteAccept):Promise<Workspace>` / POST `/api/workspace-invites/accept` shared `workspaceInviteAcceptSchema {token}`. Requires signed-in person whose normalized email matches invite. Token possession required; no email sending or email-sent claim. Default expiry7days. Accepted/revoked/expired token cannot be reused. Existing member acceptance conflicts instead of modifying its role. Invite DTO `{id,workspaceId,email,role,status:pending|accepted|revoked|expired,expiresAt,createdAt}`. Issued DTO adds raw `token` once. UI builds same-origin `/#invite=…` copyable link and clears it after use; list never returns token/hash. Resend = revoke then issue fresh invite.

`updateMemberRole(principal,workspaceId,memberId,input:MemberRoleInput):Promise<Member>` / PATCH `/api/workspaces/:id/members/:memberId` shared `memberRoleInputSchema {role}`. Only person admins manage invitations/roles; only human memberships can change role. Workspace lock preserves at least one human admin under races. Guest reads tasks/projects/search/profile/inbox, no task/comment/review/admin mutation.

## Search and quick add

`search(principal,workspaceId,input:SearchInput):Promise<SearchResult[]>` / POST `/api/search?workspaceId=…`; `searchInputSchema {query,scope:workspace|all(defaultworkspace),types?:[task|comment],filters?:TaskFilter,limit:1..100(default50)}`. All scope is only the signed-in person's memberships; an agent remains limited to token workspace even for all. Search covers task title/description, task comments, review comments. Result `{id,type:task|comment,workspaceId,workspaceName,taskId,title,snippet,match:title|description|comment,task:Task}`. Title matches rank ahead of description/comments. Query supports literal text and is:todo|doing|working|review|done|mine|agent|today and agent:NAME. Settings results remain localized web registry merged with authorized core hits. No server English settings strings.

`parseQuickAdd(principal,workspaceId,input:QuickAddInput):Promise<QuickAddResult>` / POST `/api/quick-add/parse?workspaceId=…`; `quickAddInputSchema {text}`. Result `{title,ownerId:null|UUID,workerId:null|UUID,priority,projectId:null|UUID,labels:[],dueDate:null|YYYY-MM-DD,dueTime:null|HH:mm,dueAt:null|ISO,warnings:[],unresolved:[]}`. Warnings are stable keys unknown_member/ambiguous_member/unknown_project/ambiguous_project/invalid_time/invalid_date/empty_title, localized by UI. Uses current date in user's saved time zone, same-workspace names only, English/Chinese date/time/priority markers. Parsing creates nothing; all detected fields editable before create. No new parser dependency or model service. Prefer this core parser to duplicate local rules; local text preview may remain a UI convenience.

## MCP and realtime

Keep old tasks.update status/worker protocol. New `tasks.edit` uses `mcpTasksEditArgs` (versioned shared patch +taskId). `mcpTasksListArgs` now TaskFilter; create gains M5 fields. New args `mcpTaskCommentsListArgs`, `mcpTaskCommentsAddArgs`, `mcpProjectsListArgs`, `mcpSearchArgs`, `mcpQuickAddArgs`. Project writes still denied to agents. Workspace/invite/role management REST human only.

Every new table audited and NOTIFY transactionally. ChangeEvent action whitelist adds projects/task_comments/workspace_invites. Membership events include affected userId while retaining workspaceId: hub should deliver to matching workspace sockets OR matching affected user sockets, deduplicated; this refreshes Me for new workspace membership. Never broadcast membership events to unrelated users. Profile routing remains user-only, auth maintenance suppressed. All event payloads remain six safe identifier fields, no comments/email/invite secrets.

`getWorkspaceAccess(principal,workspaceId)` GET `/api/workspaces/:id/access` returns `workspaceAccessSchema {canCreateTasks,canManageProjects,canInvite,canManageRoles}`. Task access adds canEditMetadata independently of active-run context edit blocking.
