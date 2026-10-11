import type { Core } from "@taff/core";

export async function createGraphRefresh(
  core: Pick<
    Core,
    "rebuildWorkspaceGraph" | "rebuildWorkspaceGraphs" | "subscribeChanges"
  >,
  onError: () => void,
) {
  const pending = new Set<string>();
  let full = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  function drain(): Promise<void> {
    if (running) return running;
    running = (async () => {
      while (!stopped && (full || pending.size)) {
        const rebuildAll = full;
        full = false;
        const id = pending.values().next().value;
        if (rebuildAll) pending.clear();
        else if (id) pending.delete(id);
        try {
          if (rebuildAll) await core.rebuildWorkspaceGraphs();
          else if (id) await core.rebuildWorkspaceGraph(id);
        } catch {
          onError();
        }
      }
    })().finally(() => {
      running = undefined;
    });
    return running;
  }
  function schedule(workspaceId?: string) {
    if (stopped) return;
    if (workspaceId && !full) pending.add(workspaceId);
    else if (!workspaceId) full = true;
    // A burst is bounded in memory and coalesces into one recovery sweep.
    if (pending.size > 100) {
      pending.clear();
      full = true;
    }
    timer ??= setTimeout(() => {
      timer = undefined;
      void drain();
    }, 100);
  }
  const unsubscribe = await core.subscribeChanges(
    (event) => schedule(event.workspaceId ?? undefined),
    () => schedule(),
  );
  return {
    rebuildAll: async () => {
      full = true;
      await drain();
    },
    close: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await unsubscribe();
      await running;
    },
  };
}
