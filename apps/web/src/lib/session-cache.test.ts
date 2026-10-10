import type { Me } from "@taff/schemas";
import type { TodayBootstrap } from "@taff/schemas/today-bootstrap";
import { QueryClient } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "./query-snapshot";
import {
  bootstrapSession,
  currentSession,
  synchronizeSession,
  workspaceFingerprint,
} from "./session-cache";

const initialMe: Me = {
  user: {
    id: "alice",
    name: "Alice",
    email: "alice@example.test",
    locale: "en",
    tz: "UTC",
  },
  workspaces: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      memberId: "22222222-2222-4222-8222-222222222222",
      role: "admin",
      key: "AL",
      name: "Alice workspace",
    },
  ],
};
const initialToday: NonNullable<TodayBootstrap["today"]> = {
  workspaceId: initialMe.workspaces[0].id,
  now: Date.parse("2026-10-11T12:00:00Z"),
  from: "2026-10-11T00:00:00.000Z",
  to: "2026-10-12T00:00:00.000Z",
  tasks: [],
  members: [],
  runs: [],
  calendar: { occurrences: [], unscheduled: [], truncated: false },
};

it("retains only authenticated server reads on matching confirmation, reconciles them and still gates writes", async () => {
  const client = new QueryClient();
  bootstrapSession(client, initialMe, initialToday);
  const taskKey = ["tasks", initialToday.workspaceId];
  client.setQueryData(
    ["inbox", initialToday.workspaceId],
    "untrusted provisional data",
  );
  const removed: string[] = [];
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type === "removed") removed.push(String(event.query.queryKey[0]));
  });
  expect(client.getQueryData(taskKey)).toEqual([]);
  await expect(snapshotQueries(client, [taskKey])).rejects.toMatchObject({
    code: "unauthorized",
  });
  synchronizeSession(
    client,
    initialMe.user.id,
    workspaceFingerprint(initialMe),
  );
  expect(currentSession(client)?.confirmed).toBe(true);
  expect(removed).toEqual(["inbox"]);
  expect(client.getQueryData(taskKey)).toEqual([]);
  expect(client.getQueryState(taskKey)?.isInvalidated).toBe(true);
  const snapshot = await snapshotQueries(client, [taskKey]);
  expect(isCurrentSnapshot(client, snapshot)).toBe(true);
  synchronizeSession(client, null);
  expect(client.getQueryData(taskKey)).toBeUndefined();
  restoreQueries(client, snapshot);
  expect(client.getQueryData(taskKey)).toBeUndefined();
  unsubscribe();
  client.clear();
});

it.each([
  { userId: "bob", scope: workspaceFingerprint(initialMe) },
  { userId: "alice", scope: "membership-revoked" },
  { userId: null, scope: "" },
])(
  "purges server reads when browser confirmation changes identity or access: $userId $scope",
  ({ userId, scope }) => {
    const client = new QueryClient();
    bootstrapSession(client, initialMe, initialToday);
    synchronizeSession(client, userId, scope);
    expect(client.getQueryCache().findAll()).toHaveLength(0);
    client.clear();
  },
);

it("does not seed a workspace outside the server identity", () => {
  const client = new QueryClient();
  bootstrapSession(client, initialMe, {
    ...initialToday,
    workspaceId: "foreign",
  });
  expect(client.getQueryCache().findAll()).toHaveLength(0);
  client.clear();
});

it("keeps server bootstrap read-only until the browser confirms and purges provisional data on promotion", async () => {
  const client = new QueryClient();
  bootstrapSession(client, null);
  const cancel = vi.spyOn(client, "cancelQueries");
  await expect(snapshotQueries(client, [["me"]])).rejects.toMatchObject({
    code: "unauthorized",
  });
  expect(cancel).not.toHaveBeenCalled();
  expect(() => bootstrapSession(client, null)).toThrow("already initialized");
  client.setQueryData(["inbox", "provisional"], "unconfirmed recipient data");
  synchronizeSession(client, null);
  expect(currentSession(client)?.confirmed).toBe(true);
  expect(client.getQueryData(["inbox", "provisional"])).toBeUndefined();
  const snapshot = await snapshotQueries(client, [["task", "confirmed"]]);
  expect(isCurrentSnapshot(client, snapshot)).toBe(true);
  client.clear();
});

it("clears private data and rejects an old principal's late rollback after account switching", async () => {
  const client = new QueryClient();
  synchronizeSession(client, "alice");
  client.setQueryData(["me"], { user: { id: "alice" } });
  for (const family of [
    "tasks",
    "task",
    "runs",
    "run",
    "review",
    "inbox",
    "agent",
    "agent-tokens",
    "mcp-calls",
    "members",
  ])
    client.setQueryData([family, "alice-private"], "private data");
  const snapshot = await snapshotQueries(client, [["task", "alice-private"]]);
  client.setQueryData(["task", "alice-private"], "optimistic data");
  synchronizeSession(client, null);
  expect(
    client
      .getQueryCache()
      .findAll()
      .map(({ queryKey }) => queryKey),
  ).toEqual([["me"]]);
  synchronizeSession(client, "bob");
  client.setQueryData(["task", "bob-private"], "Bob's data");
  expect(isCurrentSnapshot(client, snapshot)).toBe(false);
  restoreQueries(client, snapshot);
  expect(client.getQueryData(["task", "alice-private"])).toBeUndefined();
  expect(client.getQueryData(["task", "bob-private"])).toBe("Bob's data");
  const current = await snapshotQueries(client, [["task", "bob-private"]]);
  synchronizeSession(client, "bob");
  expect(isCurrentSnapshot(client, current)).toBe(true);
  client.clear();
});

it("revokes cached access when the authorized workspace set changes", async () => {
  const client = new QueryClient();
  synchronizeSession(client, "person", "workspace-a,workspace-b");
  client.setQueryData(["task", "private-a"], "private task");
  const snapshot = await snapshotQueries(client, [["task", "private-a"]]);
  synchronizeSession(client, "person", "workspace-b");
  restoreQueries(client, snapshot);
  expect(client.getQueryData(["task", "private-a"])).toBeUndefined();
  expect(isCurrentSnapshot(client, snapshot)).toBe(false);
  client.clear();
});
