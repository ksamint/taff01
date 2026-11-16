import type { Run, RunDetail } from "@taff/schemas";
import { QueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { runKey, runsKey } from "../m3-queries";
import type { snapshotM3 } from "../optimistic-m3";
import { synchronizeSession } from "../session-cache";
import { optimisticRun, useStartRun } from "./tasks";

type Context = { snapshot: Awaited<ReturnType<typeof snapshotM3>>; id: string };
let client: QueryClient;
let callbacks: UseMutationOptions<Run, Error, void, Context>;
vi.mock("@tanstack/react-query", async (original) => ({
  ...(await original<typeof import("@tanstack/react-query")>()),
  useQueryClient: () => client,
  useMutation: (options: typeof callbacks) => {
    callbacks = options;
    return {};
  },
}));
afterEach(() => client.clear());

async function start() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  synchronizeSession(client, "user", "scope");
  const task = { id: "task", workspaceId: "workspace", workerId: "agent" };
  useStartRun(task.id, task.workspaceId, task);
  const mutation = { client, mutationKey: undefined, meta: undefined };
  const context = await callbacks.onMutate?.(undefined, mutation);
  if (!context) throw new Error("Start requires an optimistic context");
  const run = optimisticRun(task, "real-run", "2026-11-16T00:00:00.000Z");
  return { context, run, mutation };
}

it("keeps running detail throughout the real-ID handoff while its read is deferred", async () => {
  const { context, run, mutation } = await start();
  expect(client.getQueryData<RunDetail>(runKey(context.id))?.run.status).toBe(
    "running",
  );
  let release!: (detail: RunDetail) => void;
  const pending = client.fetchQuery({
    queryKey: runKey(run.id),
    queryFn: () =>
      new Promise<RunDetail>((resolve) => {
        release = resolve;
      }),
  });
  const authoritative: RunDetail = {
    run,
    events: [],
    artifacts: [],
    canControl: true,
    canSubmit: false,
  };
  try {
    await callbacks.onSuccess?.(run, undefined, context, mutation);
    const listed = client.getQueryData<Run[]>(runsKey("workspace"))?.[0];
    expect(listed?.id).toBe(run.id);
    expect(client.getQueryData<RunDetail>(runKey(run.id))).toEqual({
      run,
      events: [],
      artifacts: [],
      canControl: false,
      canSubmit: false,
    });
    expect(client.getQueryState(runKey(run.id))?.fetchStatus).toBe("fetching");
  } finally {
    release(authoritative);
  }
  await pending;
  expect(client.getQueryData(runKey(run.id))).toEqual(authoritative);
});

it("preserves authoritative detail already fetched before the acknowledgement", async () => {
  const { context, run, mutation } = await start();
  const authoritative: RunDetail = {
    run,
    events: [],
    artifacts: [],
    canControl: true,
    canSubmit: true,
  };
  client.setQueryData(runKey(run.id), authoritative);
  await callbacks.onSuccess?.(run, undefined, context, mutation);
  expect(client.getQueryData(runKey(run.id))).toEqual(authoritative);
});

it("ignores a late acknowledgement after the session identity changes", async () => {
  const { context, run, mutation } = await start();
  synchronizeSession(client, "other-user", "other-scope");
  await callbacks.onSuccess?.(run, undefined, context, mutation);
  expect(client.getQueryData(runKey(run.id))).toBeUndefined();
  expect(client.getQueryData(runsKey("workspace"))).toBeUndefined();
});
