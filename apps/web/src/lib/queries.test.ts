import type { Inbox, InboxItem } from "@taff/schemas";
import {
  QueryClient,
  QueryObserver,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { invalidateM3 } from "./m3-queries";
import { inboxFromItems, m3MutationKey, snapshotM3 } from "./optimistic-m3";
import { inboxKey, useInbox } from "./queries";
import { restoreQueries } from "./query-snapshot";

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-query")>()),
  useQuery: vi.fn(),
  useQueryClient: vi.fn(),
}));

it("keeps a snooze optimistic when a late Inbox observer mounts, then reconciles its rollback", async () => {
  const client = new QueryClient();
  const key = inboxKey("workspace");
  const original = inboxFromItems([
    {
      id: "review",
      kind: "review",
      taskId: "task",
      readAt: null,
      resolvedAt: null,
      snoozedUntil: null,
    } as InboxItem,
  ]);
  client.setQueryData(key, original);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const mutation = client.getMutationCache().build(client, {
    mutationKey: m3MutationKey,
    mutationFn: async () => {
      await held;
      throw new Error("forbidden");
    },
    onMutate: async () => {
      const snapshot = await snapshotM3(client);
      client.setQueryData(key, inboxFromItems([]));
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
  const rejected = mutation.execute(undefined).catch(() => {});
  await vi.waitFor(() => {
    expect(client.isMutating()).toBe(1);
    expect(client.getQueryData<Inbox>(key)?.items).toHaveLength(0);
  });
  vi.mocked(useQueryClient).mockReturnValue(client);
  useInbox("workspace");
  const read = vi.fn(async () => original);
  const observer = new QueryObserver(client, {
    ...vi.mocked(useQuery).mock.calls.at(-1)![0],
    queryFn: read,
  });
  const unsubscribe = observer.subscribe(() => {});
  try {
    expect(read).not.toHaveBeenCalled();
    expect(client.getQueryData<Inbox>(key)?.items).toHaveLength(0);
    release();
    await rejected;
    expect(read).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(key)).toEqual(original);
    expect(client.isMutating()).toBe(0);
  } finally {
    release();
    await rejected;
    unsubscribe();
    client.clear();
    vi.clearAllMocks();
  }
});
