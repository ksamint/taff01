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

it.each([false, true])(
  "A fails without erasing B; both failures restore the baseline (reverse=%s)",
  async (reverse) => {
    const client = new QueryClient();
    const key = ["tasks", "workspace"];
    const tasks = [
      { id: "a", title: "before", status: "todo" },
      { id: "b", title: "before" },
    ];
    client.setQueryData(key, tasks);
    const a = await snapshotM3(client);
    patchTask(client, "a", { title: "A" });
    a.capture();
    const b = await snapshotM3(client);
    patchTask(client, "a", { status: "done" });
    patchTask(client, "b", { title: "B" });
    b.capture();
    if (reverse) {
      restoreQueries(client, b);
      expect(client.getQueryData<Task[]>(key)?.[0].title).toBe("A");
      restoreQueries(client, a);
    } else {
      restoreQueries(client, a);
      expect(client.getQueryData(key)).toEqual([
        { ...tasks[0], status: "done" },
        { ...tasks[1], title: "B" },
      ]);
      restoreQueries(client, b);
    }
    expect(client.getQueryData(key)).toEqual(tasks);
    client.clear();
  },
);

it.each([false, true])(
  "overlapping writes to one field never resurrect a failed layer (reverse=%s)",
  async (reverse) => {
    const client = new QueryClient();
    const key = ["task", "a"];
    client.setQueryData(key, { id: "a", title: "before" });
    const a = await snapshotM3(client);
    patchTask(client, "a", { title: "A" });
    a.capture();
    const b = await snapshotM3(client);
    patchTask(client, "a", { title: "B" });
    b.capture();
    restoreQueries(client, reverse ? b : a);
    expect(client.getQueryData<Task>(key)?.title).toBe(reverse ? "A" : "B");
    restoreQueries(client, reverse ? a : b);
    expect(client.getQueryData<Task>(key)?.title).toBe("before");
    client.clear();
  },
);

it("rolls back only its inserted/deleted rows while preserving concurrent row edits", async () => {
  const client = new QueryClient();
  const key = ["tasks", "workspace"];
  const before = [
    { id: "a", title: "a" },
    { id: "b", title: "b" },
  ];
  client.setQueryData(key, before);
  const a = await snapshotM3(client);
  client.setQueryData(key, [before[1], { id: "new-a", title: "A" }]);
  a.capture();
  const b = await snapshotM3(client);
  client.setQueryData(key, [
    { ...before[1], title: "B" },
    { id: "new-a", title: "A" },
    { id: "new-b", title: "B" },
  ]);
  b.capture();
  restoreQueries(client, a);
  expect(client.getQueryData(key)).toEqual([
    before[0],
    { ...before[1], title: "B" },
    { id: "new-b", title: "B" },
  ]);
  restoreQueries(client, b);
  expect(client.getQueryData(key)).toEqual(before);
  client.clear();
});

it("takes ownership after concurrent cancellation promises resolve, preserving a successful A when B fails", async () => {
  const client = new QueryClient();
  const key = ["task", "a"];
  client.setQueryData(key, { id: "a", title: "before", status: "todo" });
  const [a, b] = await Promise.all([snapshotM3(client), snapshotM3(client)]);
  a.start();
  patchTask(client, "a", { title: "A" });
  a.capture();
  b.start();
  patchTask(client, "a", { status: "done" });
  b.capture();
  restoreQueries(client, b);
  expect(client.getQueryData(key)).toEqual({
    id: "a",
    title: "A",
    status: "todo",
  });
  client.clear();
});
