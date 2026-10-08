import { QueryClient } from "@tanstack/react-query";
import { expect, it } from "vitest";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "./query-snapshot";
import { synchronizeSession } from "./session-cache";

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
