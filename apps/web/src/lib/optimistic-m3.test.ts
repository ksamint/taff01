import type {
  CalendarViewData,
  InboxItem,
  Run,
  RunDetail,
  Task,
  TaskCalendar,
} from "@taff/schemas";
import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import {
  inboxFromItems,
  patchRun,
  patchTask,
  snapshotM3,
} from "./optimistic-m3";
import { restoreQueries, snapshotQueries } from "./query-snapshot";

it("updates calendar task metadata with detail/list writes and rolls it back together", async () => {
  const client = new QueryClient();
  const task = {
    id: "task",
    title: "Before",
    version: 3,
    dueAt: "2026-11-01T06:30:45.123Z",
  } as Task;
  const calendar = {
    task,
    schedule: null,
    canSchedule: true,
  } satisfies TaskCalendar;
  client.setQueryData(["task-calendar", task.id], calendar);
  client.setQueryData(["calendar", "workspace", "from", "to"], {
    occurrences: [],
    unscheduled: [calendar],
    truncated: false,
  } satisfies CalendarViewData);
  const snapshot = await snapshotM3(client);
  patchTask(client, task.id, { title: "Pending", version: 4 });
  expect(
    client.getQueryData<TaskCalendar>(["task-calendar", task.id])?.task.title,
  ).toBe("Pending");
  expect(
    client.getQueryData<CalendarViewData>([
      "calendar",
      "workspace",
      "from",
      "to",
    ])?.unscheduled[0].task.version,
  ).toBe(4);
  restoreQueries(client, snapshot);
  expect(
    client.getQueryData<TaskCalendar>(["task-calendar", task.id])?.task,
  ).toEqual(task);
  expect(
    client.getQueryData<CalendarViewData>([
      "calendar",
      "workspace",
      "from",
      "to",
    ])?.unscheduled[0].task.dueAt,
  ).toBe("2026-11-01T06:30:45.123Z");
  client.clear();
});

it("restores related detail/list snapshots after a rejected transition", async () => {
  const client = new QueryClient();
  const task = { id: "task", status: "todo" } as Task;
  const run = { id: "run", status: "running" } as Run;
  client.setQueryData(["tasks", "workspace"], [task]);
  client.setQueryData(["task", "task"], task);
  client.setQueryData(["runs", "workspace"], [run]);
  client.setQueryData(["run", "run"], {
    run,
    events: [],
    artifacts: [],
  } as unknown as RunDetail);
  const snapshot = await snapshotM3(client);
  patchRun(client, "run", { status: "canceled" });
  patchTask(client, "task", { status: "done" });
  expect(client.getQueryData<RunDetail>(["run", "run"])?.run.status).toBe(
    "canceled",
  );
  restoreQueries(client, snapshot);
  expect(client.getQueryData<RunDetail>(["run", "run"])?.run.status).toBe(
    "running",
  );
  expect(client.getQueryData<Task[]>(["tasks", "workspace"])?.[0].status).toBe(
    "todo",
  );
  const missing = await snapshotQueries(client, [["missing"]]);
  client.setQueryData(["missing"], "pending");
  restoreQueries(client, missing);
  expect(client.getQueryData(["missing"])).toBeUndefined();
  client.clear();
});
it("keeps Inbox counts, groups and unread state consistent during snooze/read updates", () => {
  const item = (
    id: string,
    kind: InboxItem["kind"],
    patch: Partial<InboxItem> = {},
  ): InboxItem =>
    ({
      id,
      kind,
      taskId: "task",
      readAt: null,
      resolvedAt: null,
      snoozedUntil: null,
      ...patch,
    }) as InboxItem;
  const inbox = inboxFromItems([
    item("review", "review"),
    item("read", "review", { readAt: new Date().toISOString() }),
    item("blocker", "blocker"),
    item("snoozed", "blocker", {
      snoozedUntil: new Date(Date.now() + 100000).toISOString(),
    }),
    item("resolved", "review", { resolvedAt: new Date().toISOString() }),
  ]);
  expect(inbox.items.map(({ id }) => id)).toEqual([
    "review",
    "read",
    "blocker",
  ]);
  expect(inbox.groups).toHaveLength(1);
  expect(inbox.unreadCount).toBe(2);
  expect(inbox.reviewCount).toBe(1);
  expect(inbox.blockerCount).toBe(1);
});
