import type { Core } from "@taff/core";
import type { ChangeEvent } from "@taff/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGraphRefresh } from "./graph";

afterEach(() => vi.useRealTimers());
describe("graph refresh recovery", () => {
  it("coalesces notifications, retains changes during rebuild and sweeps on reconnect", async () => {
    vi.useFakeTimers();
    let notify!: (event: ChangeEvent) => void | Promise<void>;
    let reconnect!: () => void | Promise<void>;
    let release!: () => void;
    const unsubscribe = vi.fn(async () => {});
    const core = {
      subscribeChanges: vi.fn<Core["subscribeChanges"]>(
        async (listener, recovery) => {
          notify = listener;
          reconnect = recovery!;
          return unsubscribe;
        },
      ),
      rebuildWorkspaceGraph: vi.fn(async (_id: string) => {}),
      rebuildWorkspaceGraphs: vi.fn(async () => {}),
    };
    const error = vi.fn();
    const refresh = await createGraphRefresh(core, error);
    const event = { workspaceId: "workspace" } as ChangeEvent;
    notify(event);
    notify(event);
    await vi.advanceTimersByTimeAsync(100);
    expect(core.rebuildWorkspaceGraph).toHaveBeenCalledExactlyOnceWith(
      "workspace",
    );
    core.rebuildWorkspaceGraph.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    notify(event);
    await vi.advanceTimersByTimeAsync(100);
    notify(event);
    release();
    await vi.advanceTimersByTimeAsync(100);
    expect(core.rebuildWorkspaceGraph).toHaveBeenCalledTimes(3);
    reconnect();
    await vi.advanceTimersByTimeAsync(100);
    expect(core.rebuildWorkspaceGraphs).toHaveBeenCalledTimes(1);
    core.rebuildWorkspaceGraphs.mockRejectedValueOnce(new Error("offline"));
    await refresh.rebuildAll();
    expect(error).toHaveBeenCalledTimes(1);
    await refresh.rebuildAll();
    expect(core.rebuildWorkspaceGraphs).toHaveBeenCalledTimes(3);
    notify(event);
    await refresh.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(core.rebuildWorkspaceGraph).toHaveBeenCalledTimes(3);
  });
});
