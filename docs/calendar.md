# Calendar contract

M6 stores one calendar schedule per task, separately from its deadline. A task's `dueAt` stays unchanged; a task with a deadline and no calendar schedule belongs in the unscheduled tray. Completion belongs to the task and applies to its whole series. No per-occurrence completion or recurrence exceptions.

## Shared bodies and DTOs

`calendarScheduleInputSchema` / `CalendarScheduleInput`: `{startAt:string,endAt:string,timeZone:string,rrule:string|null}`. Start/end are offset ISO instants, normalized to UTC in returned DTOs. Valid Intl zones include IANA zones and fixed offsets; offsets `+08`, `+0800` and `+08:00` canonicalize to `+08:00`. Duration must be positive and at most seven days. Supported timestamps are 1970–2200 inclusive. The saved zone belongs to the schedule, independent of later profile timezone changes. RRULE is a bare canonical uppercase rule or null.

`setTaskCalendarSchema` / `SetTaskCalendar`: `{version:number,schedule:CalendarScheduleInput|null}`. Version is the current **Task.version**, not a separate schedule version. Clearing even an absent schedule advances task version after authorization/version checks. Every write preserves dueAt and runs in the same transaction as task-version update, audit and NOTIFY.

`calendarRangeSchema` / `CalendarRange`: `{from:string,to:string}` offset ISO instants, exclusive range `[from,to)`, `from < to`, span at most 62 days, timestamps 1970–2200. Range matching uses occurrence overlap (`startAt < to && endAt > from`), including overnight events beginning before from.

`CalendarSchedule`: `{taskId,workspaceId,startAt,endAt,timeZone,rrule}`.
`TaskCalendar`: `{task:Task,schedule:CalendarSchedule|null,canSchedule:boolean}`.
`CalendarOccurrence`: `{id:string,task:Task,schedule:CalendarSchedule,startAt:string,endAt:string,canSchedule:boolean,isAgent:boolean}`. ID is deterministic taskId+occurrence start. Each occurrence carries the **base schedule** for editing later occurrences without replacing DTSTART with the dragged date. isAgent means assigned worker.kind=agent and lets UI render a background lane, without inventing process timing.
`CalendarViewData`: `{occurrences:CalendarOccurrence[],unscheduled:TaskCalendar[],truncated:boolean}`. Done tasks are omitted; no shared Task DTO changes. Output caps are explicit via truncated; UI must show that more data exists rather than claiming a complete list.

Functions:

- `getTaskCalendar(principal,taskId):Promise<TaskCalendar>` — GET `/api/tasks/:id/calendar`.
- `setTaskCalendar(principal,taskId,input:SetTaskCalendar):Promise<TaskCalendar>` — PATCH same.
- `listCalendar(principal,workspaceId,input:CalendarRange):Promise<CalendarViewData>` — GET `/api/calendar?workspaceId=…&from=…&to=…`.

CreateTask gains optional `calendar:CalendarScheduleInput`. Existing `createTask` creates task+calendar in one transaction and checks task:schedule for the new task. A denied schedule rolls back task/audit/notification too. No new create endpoint. MCP create args gain the same optional field. MCP adds `mcpCalendarListArgs = calendarRangeSchema` and `mcpCalendarSetArgs = setTaskCalendarSchema +taskId`. Existing calendar.schedule retains its deadline-compatible behavior.

## Recurrence and whole-series edits

Presets: daily (`FREQ=DAILY`), weekdays (`FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`), weekly (`FREQ=WEEKLY`, derives anchor weekday), monthly (`FREQ=MONTHLY`, derives anchor day). UI may add COUNT or UNTIL to any preset.

Bounded raw rule subset: FREQ DAILY/WEEKLY/MONTHLY/YEARLY; INTERVAL1–366; COUNT1–1000 **or** UNTIL UTC basic `YYYYMMDDTHHMMSSZ`; simple nonordinal BYDAY only for WEEKLY (unique weekdays max7); one BYMONTHDAY1–31 or -1 only for MONTHLY/YEARLY; one BYMONTH1–12 only for YEARLY; WKST weekday only for WEEKLY. No SECONDLY/MINUTELY/HOURLY, multiline DTSTART/TZID/RDATE/EXDATE, ordinal BYDAY/BYSETPOS, BYHOUR/BYMINUTE/BYSECOND. Anchor must match explicit BYDAY/BYMONTHDAY/BYMONTH. Unsupported/impossible rules reject invalid_input, never silently coerce. Rules canonicalize in returned DTOs.

Series use the anchor's wall-clock time in schedule.timeZone. End is a fixed elapsed duration (`base endAt-startAt`, at most 168 hours) after each occurrence start. DST folds choose the first matching instant, while an explicitly saved second-fold anchor retains its exact instant. DST gaps use the offset before the gap (RFC 5545 verified errata 4271), including non-hour gaps; invalid monthly dates are skipped by RRULE. This differs from quick-add's explicit invalid-wall-time rejection. COUNT and inclusive UNTIL apply to actual generated dates; recurrence parsing/expansion stays core-only using rrule (BSD-3-Clause).

Shared lightweight helper `shiftCalendarSeries(schedule,previousOccurrenceStart,newOccurrenceStart,newOccurrenceEnd?)` returns a CalendarScheduleInput for a **whole-series** drag/resize. It derives the move in wall-calendar days/time in the saved zone, shifts the original base DTSTART by that civil delta, preserves elapsed duration unless a new end is supplied, shifts UNTIL likewise, and transforms explicit weekly BYDAY **and WKST** by moved days. Monthly/yearly explicit day/month follows the new base anchor. No partial occurrence mutation. UI uses the helper before the setter; core revalidates the result. Shared `calendarWallToInstant(localISO,timeZone)` resolves RFC gap/fold policy for schedule editor conversion. Neither helper imports rrule in the browser. Editing the form directly edits the base schedule and raw/preset recurrence.

Expansion is bounded in three ways: supported rule density and count, a62-day requested range, and hard candidate/output caps. Unbounded rules seek analytically to an aligned nearby recurrence period before asking rrule for dates, avoiding a scan from an ancient DTSTART. Finite count rules have at most1000 instances and bounded year range. A workspace response reads at most200 schedules and200 unscheduled tasks, emits at most2000 overlapping occurrences, and flags truncated if data exceeds any bound. Expansion includes a duration/zone margin before range start, then tests exact UTC overlap. No unbounded `.all()` and no client recurrence expansion.

## Permissions and realtime

All reads use workspace:read. Writes and canSchedule use the existing task:schedule rule with actual taskId/current active runId and live token scopes/capability grants. Owners/admins schedule; assigned agents need calendar:write and matching calendar.schedule permission/grant. Guests and outsiders cannot mutate. Active/review runs permit scheduling metadata; their task context/review protections stay unchanged.

The `task_calendar` table has taskId primary ID and composite workspace/task FK, guarded times/duration. Audit triggers emit safe ChangeEvent `task_calendar.insert|update|delete` plus the task update event, in the same transaction. ChangeEvent whitelist includes this table. Browser invalidation adds the calendar family; incoming own notifications still wait for pending optimistic writes. Undo uses the latest returned Task.version and the prior schedule; a newer intervening write conflicts safely.
