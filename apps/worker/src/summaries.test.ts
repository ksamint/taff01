import { describe, expect, it, vi } from "vitest";
import { createSummaryProcessor, SUMMARY_JOB_NAMES } from "./summaries";

const job = {
  recipientId: "00000000-0000-4000-8000-000000000001",
  scheduledAt: "2026-11-05T01:00:00.000Z",
  version: 1,
};

describe("shareholder summary queue boundaries", () => {
  it("scans every page and gives each due recipient one stable job id", async () => {
    const cursor = {
      scheduledAt: job.scheduledAt,
      recipientId: job.recipientId,
    };
    const second = {
      ...job,
      recipientId: "00000000-0000-4000-8000-000000000002",
    };
    const core = {
      listMissingSummaryRenders: vi.fn().mockResolvedValue([]),
      getSummaryForRender: vi.fn(),
      storeSummaryRender: vi.fn(),
      recordSummaryRenderFailure: vi.fn(),
      listDueSummaryJobs: vi
        .fn()
        .mockResolvedValueOnce({ jobs: [job], nextCursor: cursor })
        .mockResolvedValueOnce({ jobs: [second], nextCursor: null })
        .mockResolvedValueOnce({ jobs: [job], nextCursor: null }),
      generateDailySummary: vi.fn(),
    };
    const queue = { add: vi.fn() };
    const process = createSummaryProcessor(core, queue);
    await process({ name: "summary-scan", data: {} });
    expect(core.listDueSummaryJobs.mock.calls[1]).toEqual([
      core.listDueSummaryJobs.mock.calls[0][0],
      100,
      cursor,
    ]);
    expect(queue.add.mock.calls.map((call) => call[1].recipientId)).toEqual([
      job.recipientId,
      second.recipientId,
    ]);
    await process({ name: "summary-scan", data: {} });
    expect(queue.add.mock.calls[2][2].jobId).toBe(
      queue.add.mock.calls[0][2].jobId,
    );
    expect(queue.add.mock.calls[0][2].jobId).not.toBe(
      queue.add.mock.calls[1][2].jobId,
    );
    expect(queue.add.mock.calls[0][2]).toMatchObject({
      attempts: 3,
      removeOnFail: true,
    });
    expect(queue.add.mock.calls[0][2].jobId).toMatch(/^[a-f0-9]{64}$/);
    expect(core.generateDailySummary).not.toHaveBeenCalled();
  });

  it("leaves markers due on enqueue failure and rejects untrusted payloads", async () => {
    const core = {
      listMissingSummaryRenders: vi.fn().mockResolvedValue([]),
      getSummaryForRender: vi.fn(),
      storeSummaryRender: vi.fn(),
      recordSummaryRenderFailure: vi.fn(),
      listDueSummaryJobs: vi
        .fn()
        .mockResolvedValue({ jobs: [job], nextCursor: null }),
      generateDailySummary: vi
        .fn()
        .mockResolvedValue({ status: "generated", summaryId: job.recipientId }),
    };
    const queue = {
      add: vi.fn().mockRejectedValue(new Error("Queue unavailable")),
    };
    const process = createSummaryProcessor(core, queue);
    await expect(process({ name: "summary-scan", data: {} })).rejects.toThrow(
      "Queue unavailable",
    );
    await expect(
      process({ name: "summary-scan", data: { extra: true } }),
    ).rejects.toThrow();
    for (const data of [
      { ...job, scheduledAt: "yesterday" },
      { ...job, version: 0 },
      { ...job, recipientId: "not-a-uuid" },
      { ...job, snapshot: { injected: true } },
    ])
      await expect(process({ name: "daily-summary", data })).rejects.toThrow();
    await expect(process({ name: "digest-scan", data: {} })).rejects.toThrow(
      "Unsupported job",
    );
    expect(core.generateDailySummary).not.toHaveBeenCalled();
    queue.add.mockResolvedValue(undefined);
    expect(await process({ name: "daily-summary", data: job })).toEqual({
      status: "generated",
      summaryId: job.recipientId,
    });
    expect(core.generateDailySummary).toHaveBeenCalledExactlyOnceWith(
      job.recipientId,
      job.scheduledAt,
      job.version,
    );
    expect([...SUMMARY_JOB_NAMES].sort()).toEqual([
      "daily-summary",
      "summary-render",
      "summary-scan",
    ]);
  });
});

describe("summary render jobs", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  function fixture() {
    const core = {
      listDueSummaryJobs: vi
        .fn()
        .mockResolvedValue({ jobs: [], nextCursor: null }),
      generateDailySummary: vi
        .fn()
        .mockResolvedValue({ status: "generated", summaryId: id }),
      listMissingSummaryRenders: vi.fn().mockResolvedValue([
        { summaryId: id, format: "txt" },
        { summaryId: id, format: "png" },
      ]),
      getSummaryForRender: vi.fn().mockResolvedValue({
        id,
        workspaceId: id,
        recipientId: id,
        tagId: id,
        localDate: "2026-11-05",
        timeZone: "Asia/Hong_Kong",
        locale: "en",
        createdAt: "2026-11-05T01:00:00.000Z",
        contentHash: "a".repeat(64),
        watermark: {
          text: "Pat · Northwind",
          recipientName: "Pat",
          org: "Northwind",
          localDate: "2026-11-05",
          summaryId: id,
          contentHash: "a".repeat(64),
        },
        snapshot: {
          version: 1,
          localDate: "2026-11-05",
          timeZone: "Asia/Hong_Kong",
          workspace: { name: "Northwind" },
          tag: { kind: "shareholder", org: "Northwind", label: "" },
          recipient: { name: "Pat" },
          projects: [],
          totals: {
            projects: 0,
            open: 0,
            inReview: 0,
            blocked: 0,
            dueToday: 0,
            overdue: 0,
            completedToday: 0,
            movedToday: 0,
          },
          truncated: false,
        },
      }),
      storeSummaryRender: vi.fn().mockResolvedValue({}),
      recordSummaryRenderFailure: vi.fn(),
    };
    const queue = { add: vi.fn() };
    return { core, queue };
  }
  it("enqueues both formats after generation with stable per-format ids and retries missing ones", async () => {
    const { core, queue } = fixture();
    const process = createSummaryProcessor(
      core,
      queue,
      "http://renderer.internal:3002",
    );
    await process({ name: "daily-summary", data: job });
    expect(queue.add.mock.calls.map((call) => call[1])).toEqual([
      { summaryId: id, format: "txt" },
      { summaryId: id, format: "png" },
    ]);
    const ids = queue.add.mock.calls.map((call) => call[2].jobId);
    expect(ids[0]).not.toBe(ids[1]);
    await process({ name: "summary-scan", data: {} });
    expect(queue.add.mock.calls.slice(2).map((call) => call[2].jobId)).toEqual(
      ids,
    );
  });
  it("stores text when PNG rendering is disabled", async () => {
    const { core, queue } = fixture();
    const process = createSummaryProcessor(core, queue, "");
    await process({ name: "summary-scan", data: {} });
    expect(queue.add).toHaveBeenCalledTimes(1);
    await process({
      name: "summary-render",
      data: { summaryId: id, format: "txt" },
    });
    expect(core.storeSummaryRender).toHaveBeenCalledWith(
      expect.objectContaining({
        summaryId: id,
        format: "txt",
        body: expect.stringContaining("Pat · Northwind"),
        rendererVersion: "text-1",
      }),
    );
  });
  it("posts snapshot metadata to the image service and stores only a bounded PNG response", async () => {
    const { createServer } = await import("node:http");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDioAAAAASUVORK5CYII=",
      "base64",
    );
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const data = JSON.parse(Buffer.concat(chunks).toString());
      expect(req.url).toBe("/render/summary");
      expect(data.snapshot.recipient.name).toBe("Pat");
      expect(data.formattedCreatedAt).toContain("9:00");
      expect(data.text).toContain("Pat · Northwind");
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(png);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Missing test server address");
      const { core, queue } = fixture();
      await createSummaryProcessor(
        core,
        queue,
        `http://127.0.0.1:${address.port}`,
      )({ name: "summary-render", data: { summaryId: id, format: "png" } });
      expect(core.storeSummaryRender).toHaveBeenCalledWith({
        summaryId: id,
        format: "png",
        data: png.toString("base64"),
        rendererVersion: "png-1",
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it("records a sanitized failure for renderer errors and immutable-store rejection", async () => {
    const { core, queue } = fixture();
    const process = createSummaryProcessor(core, queue, "http://127.0.0.1:1");
    await expect(
      process({
        name: "summary-render",
        data: { summaryId: id, format: "png" },
      }),
    ).rejects.toThrow();
    expect(core.recordSummaryRenderFailure).toHaveBeenCalledWith(id, "png");
    core.storeSummaryRender.mockRejectedValueOnce(new Error("Immutable store"));
    await expect(
      process({
        name: "summary-render",
        data: { summaryId: id, format: "txt" },
      }),
    ).rejects.toThrow("Immutable store");
    expect(core.recordSummaryRenderFailure).toHaveBeenCalledWith(id, "txt");
    await expect(
      process({
        name: "summary-render",
        data: { summaryId: "invalid", format: "svg" },
      }),
    ).rejects.toThrow();
  });
});
