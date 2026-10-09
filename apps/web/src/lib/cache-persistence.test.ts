import type { Me, Task } from "@taff/schemas";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cacheBuster,
  installCachePersistence,
  type ReadSnapshot,
  type ReadStorage,
} from "./cache-persistence";
import { synchronizeSession, workspaceFingerprint } from "./session-cache";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";
const task: Task = {
  id: "33333333-3333-4333-8333-333333333333",
  workspaceId,
  ownerId: memberId,
  workerId: null,
  title: "Saved task",
  description: "",
  status: "todo",
  dueAt: null,
  priority: 3,
  projectId: null,
  parentId: null,
  labels: [],
  version: 1,
  createdAt: "2026-10-09T00:00:00Z",
  updatedAt: "2026-10-09T00:00:00Z",
};
function me(userId = "alice", role: "admin" | "guest" = "admin"): Me {
  return {
    user: {
      id: userId,
      name: userId,
      email: `${userId}@example.test`,
      locale: "en",
      tz: "UTC",
    },
    workspaces: [{ id: workspaceId, memberId, name: "Private", role }],
  };
}
function saved(identity = me()): ReadSnapshot {
  return {
    buster: cacheBuster,
    userId: identity.user.id,
    scope: workspaceFingerprint(identity),
    expiresAt: Date.now() + 3600000,
    queries: [
      {
        key: ["tasks", workspaceId],
        data: [task],
        updatedAt: Date.now() - 1000,
      },
    ],
  };
}
function memory(value?: ReadSnapshot) {
  const state = { value };
  const store = {
    get value() {
      return state.value;
    },
    set value(next: ReadSnapshot | undefined) {
      state.value = next;
    },
    read: vi.fn(async () => state.value),
    clear: vi.fn(async () => {
      state.value = undefined;
    }),
    write: vi.fn(async (snapshot: ReadSnapshot, valid: () => boolean) => {
      if (valid()) state.value = snapshot;
    }),
  } satisfies ReadStorage & { value?: ReadSnapshot };
  return store;
}
let client: QueryClient;
let dispose: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T12:00:00Z"));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  client.clear();
  vi.useRealTimers();
});
async function flush() {
  await vi.advanceTimersByTimeAsync(110);
}
function authenticate(identity = me()) {
  client.setQueryData(["me"], identity);
  synchronizeSession(client, identity.user.id, workspaceFingerprint(identity));
}

it("waits for live authenticated identity and restores only authorized reads, always stale", async () => {
  const store = memory(saved());
  store.value!.queries.push({
    key: [
      "calendar",
      workspaceId,
      "2026-10-09T00:00:00Z",
      "2026-10-10T00:00:00Z",
    ],
    updatedAt: Date.now() - 1000,
    data: {
      occurrences: [],
      unscheduled: [{ task, schedule: null, canSchedule: true }],
      truncated: false,
    },
  });
  dispose = installCachePersistence(client, store);
  await flush();
  expect(store.read).not.toHaveBeenCalled();
  expect(client.getQueryData(["tasks", workspaceId])).toBeUndefined();
  authenticate();
  await flush();
  expect(client.getQueryData(["tasks", workspaceId])).toEqual([task]);
  expect(client.getQueryState(["tasks", workspaceId])?.isInvalidated).toBe(
    true,
  );
  expect(
    client.getQueryData<{ unscheduled: { canSchedule: boolean }[] }>(
      store.value!.queries.find((query) => query.key[0] === "calendar")!.key,
    )?.unscheduled[0].canSchedule,
  ).toBe(false);
});

it.each([me("bob"), me("alice", "guest")])(
  "purges another account or changed membership role before hydration",
  async (identity) => {
    const store = memory(saved());
    dispose = installCachePersistence(client, store);
    authenticate(identity);
    await flush();
    expect(store.clear).toHaveBeenCalled();
    expect(client.getQueryData(["tasks", workspaceId])).toBeUndefined();
  },
);

it("rejects a late IDB read after revocation and purges both memory and durable cache", async () => {
  const store = memory(saved());
  let release: ((value: ReadSnapshot) => void) | undefined;
  store.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  dispose = installCachePersistence(client, store);
  authenticate();
  await flush();
  client.setQueryData(["tasks", workspaceId], [task]);
  synchronizeSession(client, null);
  release!(saved());
  await flush();
  expect(client.getQueryData(["tasks", workspaceId])).toBeUndefined();
  expect(store.value).toBeUndefined();
});

it("checks a queued commit again after identity changes", async () => {
  const store = memory();
  let commit: (() => void) | undefined;
  store.write.mockImplementationOnce(
    (value, valid) =>
      new Promise<void>((resolve) => {
        commit = () => {
          if (valid()) store.value = value;
          resolve();
        };
      }),
  );
  dispose = installCachePersistence(client, store);
  authenticate();
  await flush();
  expect(commit).toBeDefined();
  synchronizeSession(client, null);
  commit!();
  await flush();
  expect(store.value).toBeUndefined();
});

it("never saves pending optimistic data and persists the restored result after rollback", async () => {
  const store = memory();
  dispose = installCachePersistence(client, store);
  authenticate();
  await flush();
  client.setQueryData(["tasks", workspaceId], [task]);
  await flush();
  let reject: ((reason: Error) => void) | undefined;
  const mutation = client.getMutationCache().build(client, {
    mutationFn: () =>
      new Promise<void>((_, failure) => {
        reject = failure;
      }),
    onMutate: () => {
      client.setQueryData(
        ["tasks", workspaceId],
        [{ ...task, title: "Optimistic title" }],
      );
    },
    onError: () => {
      client.setQueryData(["tasks", workspaceId], [task]);
    },
  });
  const pending = mutation.execute(undefined).catch(() => undefined);
  await flush();
  expect(JSON.stringify(store.value)).not.toContain("Optimistic title");
  reject!(new Error("denied"));
  await pending;
  await flush();
  expect(store.value?.queries[0].data).toEqual([task]);
});

it("excludes credentials, evidence, permissions and temporary task IDs from durable snapshots", async () => {
  const store = memory();
  dispose = installCachePersistence(client, store);
  authenticate();
  await flush();
  for (const family of [
    "agent-tokens",
    "agent",
    "run",
    "review",
    "invites",
    "task-access",
    "members",
    "search",
    "task-comments",
  ])
    client.setQueryData([family, workspaceId], { secret: "private evidence" });
  client.setQueryData(
    ["tasks", workspaceId],
    [{ ...task, id: "optimistic:pending" }],
  );
  await flush();
  expect(store.value?.queries).toEqual([]);
  expect(JSON.stringify(store.value)).not.toContain("private evidence");
});

it.each(["expired", "obsolete"])("discards %s snapshots", async (kind) => {
  const snapshot = saved();
  if (kind === "expired") snapshot.expiresAt = Date.now() - 1;
  else snapshot.buster = "old-schema";
  const store = memory(snapshot);
  dispose = installCachePersistence(client, store);
  authenticate();
  await flush();
  expect(store.clear).toHaveBeenCalled();
  expect(client.getQueryData(["tasks", workspaceId])).toBeUndefined();
});
