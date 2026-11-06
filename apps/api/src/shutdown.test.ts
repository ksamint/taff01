import { afterEach, expect, it, vi } from "vitest";
import { createShutdown } from "../../shutdown";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each([false, true])(
  "handles real signals and cleanup failure=%s",
  async (fail) => {
    const module = pathToFileURL(resolve("apps/shutdown.ts")).href;
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `
    import { createShutdown } from ${JSON.stringify(module)};
    setInterval(() => {}, 1000);
    const shutdown = createShutdown(
      [() => new Promise(resolve => setTimeout(resolve, 50))],
      [async () => {
        console.log("cleanup");
        if (${fail}) throw new Error("fault");
      }],
      stage => console.log(stage),
    );
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
    console.log("ready");
  `,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    try {
      const exited = once(child, "exit");
      await once(child.stdout, "data");
      child.kill("SIGTERM");
      child.kill("SIGINT");
      expect(await exited).toEqual([fail ? 1 : 0, null]);
      expect(output.match(/^cleanup$/gm)).toHaveLength(fail ? 2 : 1);
    } finally {
      child.kill("SIGKILL");
    }
  },
);

it("drains once before releasing dependencies when both signals arrive", async () => {
  const exit = vi.spyOn(process, "exit").mockReturnValue(undefined as never);
  const order: string[] = [];
  let drained: (() => void) | undefined;
  const stop = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        drained = resolve;
      }),
  );
  const close = vi.fn(async () => {
    order.push("closed");
  });
  const shutdown = createShutdown([stop], [close], vi.fn());
  const first = shutdown();
  expect(shutdown()).toBe(first);
  expect(close).not.toHaveBeenCalled();
  await Promise.resolve();
  drained?.();
  await first;
  expect(stop).toHaveBeenCalledTimes(1);
  expect(order).toEqual(["closed"]);
  expect(exit).toHaveBeenCalledWith(0);
});

it("attempts every cleanup after drain or dependency failures and exits nonzero", async () => {
  const exit = vi.spyOn(process, "exit").mockReturnValue(undefined as never);
  const report = vi.fn();
  const close = vi.fn(async () => {});
  await createShutdown(
    [
      async () => {
        throw new Error("drain failed");
      },
    ],
    [
      () => {
        throw new Error("cleanup failed");
      },
      close,
    ],
    report,
  )();
  expect(close).toHaveBeenCalledOnce();
  expect(report.mock.calls).toEqual([["stop"], ["cleanup"]]);
  expect(exit).toHaveBeenCalledWith(1);
});

it("bounds a hung drain to 25s, before the container's stop deadline", async () => {
  vi.useFakeTimers();
  const exit = vi.spyOn(process, "exit").mockReturnValue(undefined as never);
  const report = vi.fn();
  const close = vi.fn();
  const shutdown = createShutdown(
    [() => new Promise(() => {})],
    [close],
    report,
  );
  void shutdown();
  await vi.advanceTimersByTimeAsync(24_999);
  expect(exit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(report).toHaveBeenCalledWith("timeout");
  expect(exit).toHaveBeenCalledWith(1);
  expect(close).not.toHaveBeenCalled();
});

it("also bounds a hung dependency cleanup", async () => {
  vi.useFakeTimers();
  const exit = vi.spyOn(process, "exit").mockReturnValue(undefined as never);
  const report = vi.fn();
  const close = vi.fn(() => new Promise<void>(() => {}));
  void createShutdown([async () => {}], [close], report)();
  await vi.advanceTimersByTimeAsync(25_000);
  expect(close).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledWith("timeout");
  expect(exit).toHaveBeenCalledWith(1);
});

it("keeps dependencies open until HTTP drains even if realtime close fails", async () => {
  const exit = vi.spyOn(process, "exit").mockReturnValue(undefined as never);
  let finishHttp: (() => void) | undefined;
  const close = vi.fn(async () => {});
  const report = vi.fn();
  const pending = createShutdown(
    [
      () =>
        new Promise<void>((resolve) => {
          finishHttp = resolve;
        }),
      async () => {
        throw new Error("realtime failed");
      },
    ],
    [close],
    report,
  )();
  await Promise.resolve();
  await Promise.resolve();
  expect(close).not.toHaveBeenCalled();
  expect(exit).not.toHaveBeenCalled();
  finishHttp?.();
  await pending;
  expect(close).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledWith("stop");
  expect(exit).toHaveBeenCalledWith(1);
});

import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
