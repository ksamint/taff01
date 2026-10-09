# Notifications and daily digest contract

M7 preserves every durable Inbox item regardless of foreground notification preferences. Notification delivery in this milestone is in-app. No email, remote device push, or simulated agent progress is sent or claimed. The four category settings govern foreground alerts; quiet hours are 22:00–08:00 in the user's saved zone, with blockers exempt. The browser still needs explicit platform permission for any local device notification.

## Preferences

`notificationPreferencesSchema` / `NotificationPreferences` is `{version:number,review:boolean,block:boolean,mention:boolean,done:boolean,digest:boolean,digestAt:'08:00'|'09:00'|'18:00',quiet:boolean}`. Defaults: version1, four categories true, digest true, digestAt09:00, quiet false. `updateNotificationPreferencesSchema` / `UpdateNotificationPreferences` is the same full strict shape, with the current version. Human users read/edit their own preferences, including guests; agents cannot. Profile timezone changes reschedule the next digest atomically.

Core methods:

- `getNotificationPreferences(principal):Promise<NotificationPreferences>` — GET `/api/me/notifications`.
- `updateNotificationPreferences(principal,input:UpdateNotificationPreferences):Promise<NotificationPreferences>` — PATCH same.

Shared `shouldShowForegroundNotification(preferences,kind,instant,timeZone):boolean` supports review/blocker/mention/done/digest. Categories do not suppress Inbox rows. Digest uses its own enabled toggle. Quiet hours suppress ordinary foreground alerts, with blockers exempt.

## Durable daily digests

`DailyDigest` is `{id,userId,workspaceId,memberId,localDate,timeZone,locale,snapshot,createdAt}`. localDate is YYYY-MM-DD. `DigestSnapshot` is `{reviews:{count,items},dueToday:{count,items},agents:{count,items},truncated}`. Each category has at most20 items and a true total count. Review items are `{taskId,title,runId}`. Due items are `{taskId,title,dueAt}`. Agent items are `{taskId,title,runId,agentId,status,lastEventAt,eventCount,durationMs,costMicros}`; all timing, events and metrics come from submitted run state. Snapshot includes no outputs, comments, secrets or auth data. It records pending recipient review requests, incomplete workspace tasks due on the user's local day, active runs and runs completed on that day. Counts and links are authorized within the workspace at generation and reauthorized on read.

Core methods:

- `listDailyDigests(principal,workspaceId):Promise<DailyDigestList>` where `DailyDigestList={items:DailyDigest[],truncated:boolean}`, newest31 maximum — GET `/api/digests?workspaceId=…`.
- `getDailyDigest(principal,digestId):Promise<DailyDigest>` — GET `/api/digests/:id`.

A digest is visible only to its own human recipient while they retain workspace membership; admin status does not grant access to another person's digest. Daily digest creation inserts an Inbox item with `kind:'digest'`, `digestId` and null task/run/grant. Inbox adds genuine `kind:'done'` for auto-approved agent completion. Existing tabs retain All / Reviews / Blockers; digests and done items appear in All. `InboxItem.digestId` is nullable. The UI links digest items to their persisted snapshot, without inventing mail delivery.

## Worker-only contract

No REST or MCP endpoint exposes these trusted background helpers:

- `listDueDigestJobs(now:string,limit?:number,cursor?:DigestJobCursor):Promise<DueDigestJobs>`; `DigestJob={userId:string,scheduledAt:string,preferenceVersion:number}`, `DigestJobCursor={scheduledAt:string,userId:string}`, `DueDigestJobs={jobs:DigestJob[],nextCursor:DigestJobCursor|null}`. Default100, maximum500, stable keyset pagination. now is offset ISO. Only enabled preferences due at/before now are selected.
- `generateDailyDigest(userId:string,scheduledAt:string,preferenceVersion:number):Promise<DigestJobResult>` where result is `{status:'generated'|'skipped',digestIds:string[]}`. Job execution uses the actual current clock; stale marker/version, disabled preference, or lost identity returns skipped. One user preference row is locked; current profile and memberships are rechecked; one immutable row per user/workspace/localDate is protected by a unique constraint. Snapshot, Inbox row, next due marker, audit and NOTIFY commit together. Duplicate/retried jobs are harmless.

Use one BullMQ periodic scanner (minute cadence), then one job per returned marker. Derive stable job IDs from user/marker/version without colon characters. Queue insertion failure leaves the DB marker due. Scanner must page without a starvation-prone permanent first-page limit. Generation advances to the next local digest time, choosing the first fold and pre-transition offset for a gap; missed jobs produce only the current local day, with no historical backlog. An early job after signup or a timezone reschedule advances to today's scheduled time without an early digest. Enabled defaults are initialized for existing and newly registered people; there are no new runtime dependencies.

## Privacy, realtime and cache

ChangeEvent gains optional `recipientOnly:boolean`. Preference and digest rows emit userId plus recipientOnly:true. Inbox item events also route to the affected member's userId with recipientOnly:true. The API hub must route these events to that authenticated user only, even when workspaceId is present. Extend strict action whitelist for `notification_preferences` and `daily_digests`. Audit details stay empty for private preference/digest rows; activity APIs must filter private rows by recipient, and must never expose snapshots.

Browser query families: notificationPreferences, dailyDigests, dailyDigest plus Inbox. Preferences update optimistically with version checks and rollback. Persist only explicitly approved safe read caches; isolate by user and current authorized workspace fingerprint, remove on logout/revocation, and never replay offline writes. A service worker must not cache authenticated API, MCP, auth or private document responses.
