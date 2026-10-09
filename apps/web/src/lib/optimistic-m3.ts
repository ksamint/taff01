import type {
  AgentProfile,
  CalendarViewData,
  Inbox,
  InboxItem,
  ReviewWorkspace,
  Run,
  RunDetail,
  Task,
  TaskCalendar,
} from "@taff/schemas";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { snapshotQueries } from "./query-snapshot";

const FAMILIES = [
  "tasks",
  "task",
  "runs",
  "run",
  "review",
  "agent",
  "inbox",
  "calendar",
  "task-calendar",
  "task-access",
  "task-comments",
  "projects",
  "search",
  "invites",
  "workspace-access",
  "members",
  "org-drafts",
  "notificationPreferences",
  "dailyDigests",
  "dailyDigest",
];
export const m3MutationKey = ["m3-write"] as const;
export function snapshotM3(client: QueryClient, extraKeys: QueryKey[] = []) {
  return snapshotQueries(client, [
    ...extraKeys,
    ...client
      .getQueryCache()
      .findAll()
      .filter(({ queryKey }) => FAMILIES.includes(String(queryKey[0])))
      .map(({ queryKey }) => queryKey),
  ]);
}
export function patchTask(
  client: QueryClient,
  id: string,
  patch: Partial<Task>,
) {
  client.setQueriesData<Task[]>({ queryKey: ["tasks"] }, (items) =>
    items?.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  );
  client.setQueriesData<Task>({ queryKey: ["task", id] }, (task) =>
    task ? { ...task, ...patch } : task,
  );
  client.setQueriesData<TaskCalendar>(
    { queryKey: ["task-calendar", id] },
    (data) => (data ? { ...data, task: { ...data.task, ...patch } } : data),
  );
  client.setQueriesData<CalendarViewData>({ queryKey: ["calendar"] }, (data) =>
    data
      ? {
          ...data,
          occurrences: data.occurrences.map((item) =>
            item.task.id === id
              ? { ...item, task: { ...item.task, ...patch } }
              : item,
          ),
          unscheduled: data.unscheduled.map((item) =>
            item.task.id === id
              ? { ...item, task: { ...item.task, ...patch } }
              : item,
          ),
        }
      : data,
  );
  client.setQueriesData<ReviewWorkspace>(
    { queryKey: ["review", id] },
    (data) => (data ? { ...data, task: { ...data.task, ...patch } } : data),
  );
}
export function patchRun(client: QueryClient, id: string, patch: Partial<Run>) {
  const update = (run: Run) => (run.id === id ? { ...run, ...patch } : run);
  client.setQueriesData<Run[]>({ queryKey: ["runs"] }, (runs) =>
    runs?.map(update),
  );
  client.setQueriesData<RunDetail>({ queryKey: ["run", id] }, (data) =>
    data ? { ...data, run: update(data.run) } : data,
  );
  client.setQueriesData<ReviewWorkspace>({ queryKey: ["review"] }, (data) =>
    data ? { ...data, run: update(data.run) } : data,
  );
  client.setQueriesData<AgentProfile>({ queryKey: ["agent"] }, (data) =>
    data ? { ...data, runs: data.runs.map(update) } : data,
  );
}
// Counts and grouping describe the same visible, unread items as the server.
export function inboxFromItems(items: InboxItem[]): Inbox {
  const visible = items.filter(
    (item) =>
      !item.resolvedAt &&
      (!item.snoozedUntil || Date.parse(item.snoozedUntil) <= Date.now()),
  );
  const groups: Inbox["groups"] = [];
  for (const item of visible) {
    let group = groups.find((entry) => entry.taskId === item.taskId);
    if (!group) {
      group = { taskId: item.taskId, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  const unread = visible.filter((item) => !item.readAt);
  return {
    items: visible,
    groups,
    unreadCount: unread.length,
    reviewCount: unread.filter((item) => item.kind === "review").length,
    blockerCount: unread.filter((item) => item.kind === "blocker").length,
  };
}
export function resolveInbox(
  client: QueryClient,
  predicate: (item: InboxItem) => boolean,
) {
  client.setQueriesData<Inbox>({ queryKey: ["inbox"] }, (data) =>
    data ? inboxFromItems(data.items.filter((item) => !predicate(item))) : data,
  );
}
