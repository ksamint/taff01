import { describe, expect, it, vi } from "vitest";
import { createLatestWriter } from "./notification-queries";

type Doc = { version: number; digestAt: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness() {
  const requests: { body: Doc; reply: ReturnType<typeof deferred<Doc>> }[] = [];
  const saved = vi.fn<(value: Doc, next: Doc | undefined) => void>();
  const failed = vi.fn<(error: unknown) => void>();
  const writer = createLatestWriter<Doc>({
    send: (body) => {
      const reply = deferred<Doc>();
      requests.push({ body, reply });
      return reply.promise;
    },
    saved,
    failed,
  });
  return { writer, requests, saved, failed };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createLatestWriter", () => {
  it("queues choices made during a save and sends only the latest with the returned version", async () => {
    const { writer, requests, saved, failed } = harness();
    writer.write({ version: 1, digestAt: "08:00" });
    expect(writer.busy).toBe(true);
    // Two more clicks while the first PATCH is in flight: neither is lost to a
    // disabled control or sent concurrently with a stale version.
    writer.write({ version: 1, digestAt: "09:00" });
    writer.write({ version: 1, digestAt: "18:00" });
    expect(requests.map((item) => item.body)).toEqual([
      { version: 1, digestAt: "08:00" },
    ]);
    requests[0].reply.resolve({ version: 2, digestAt: "08:00" });
    await settle();
    expect(saved).toHaveBeenNthCalledWith(
      1,
      { version: 2, digestAt: "08:00" },
      { version: 2, digestAt: "18:00" },
    );
    expect(requests.map((item) => item.body)).toEqual([
      { version: 1, digestAt: "08:00" },
      { version: 2, digestAt: "18:00" },
    ]);
    expect(writer.busy).toBe(true);
    requests[1].reply.resolve({ version: 3, digestAt: "18:00" });
    await settle();
    expect(saved).toHaveBeenNthCalledWith(
      2,
      { version: 3, digestAt: "18:00" },
      undefined,
    );
    expect(writer.busy).toBe(false);
    expect(failed).not.toHaveBeenCalled();
  });

  it("reports a failed save once, drops the queued value and accepts the next write", async () => {
    const { writer, requests, saved, failed } = harness();
    writer.write({ version: 4, digestAt: "08:00" });
    writer.write({ version: 4, digestAt: "18:00" });
    const error = new Error("forbidden");
    requests[0].reply.reject(error);
    await settle();
    expect(failed).toHaveBeenCalledExactlyOnceWith(error);
    expect(saved).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    expect(writer.busy).toBe(false);
    writer.write({ version: 4, digestAt: "09:00" });
    expect(requests.map((item) => item.body)).toEqual([
      { version: 4, digestAt: "08:00" },
      { version: 4, digestAt: "09:00" },
    ]);
    requests[1].reply.resolve({ version: 5, digestAt: "09:00" });
    await settle();
    expect(saved).toHaveBeenCalledExactlyOnceWith(
      { version: 5, digestAt: "09:00" },
      undefined,
    );
  });
});
