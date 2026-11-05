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
      "summary-scan",
    ]);
  });
});
