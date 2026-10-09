import { DEFAULT_NOTIFICATION_PREFERENCES } from "@taff/schemas";
import { describe, expect, it, vi } from "vitest";
import { createDigestProcessor } from "./digests";

const job = {
  userId: "recipient",
  scheduledAt: "2026-10-09T01:00:00.000Z",
  preferenceVersion: DEFAULT_NOTIFICATION_PREFERENCES.version,
};

describe("digest queue boundaries", () => {
  it("scans beyond the first page and deduplicates retry job identities", async () => {
    const cursor = { scheduledAt: job.scheduledAt, userId: job.userId };
    const core = {
      listDueDigestJobs: vi
        .fn()
        .mockResolvedValueOnce({ jobs: [job], nextCursor: cursor })
        .mockResolvedValueOnce({
          jobs: [{ ...job, userId: "second-recipient" }],
          nextCursor: null,
        })
        .mockResolvedValueOnce({ jobs: [job], nextCursor: null }),
      generateDailyDigest: vi.fn(),
    };
    const queue = { add: vi.fn() };
    const process = createDigestProcessor(core, queue);
    await process({ name: "digest-scan", data: {} });
    expect(core.listDueDigestJobs.mock.calls[1]).toEqual([
      core.listDueDigestJobs.mock.calls[0][0],
      100,
      cursor,
    ]);
    expect(queue.add.mock.calls.map((call) => call[1].userId)).toEqual([
      "recipient",
      "second-recipient",
    ]);
    await process({ name: "digest-scan", data: {} });
    expect(queue.add.mock.calls[2][2].jobId).toBe(
      queue.add.mock.calls[0][2].jobId,
    );
    expect(queue.add.mock.calls[0][2].jobId).toMatch(/^[a-f0-9]{64}$/);
    expect(queue.add.mock.calls[0][2].removeOnFail).toBe(true);
  });

  it("leaves database markers due on enqueue failure and rejects untrusted payloads", async () => {
    const core = {
      listDueDigestJobs: vi
        .fn()
        .mockResolvedValue({ jobs: [job], nextCursor: null }),
      generateDailyDigest: vi
        .fn()
        .mockResolvedValue({ status: "skipped", digestIds: [] }),
    };
    const queue = {
      add: vi.fn().mockRejectedValue(new Error("Queue unavailable")),
    };
    const process = createDigestProcessor(core, queue);
    await expect(process({ name: "digest-scan", data: {} })).rejects.toThrow(
      "Queue unavailable",
    );
    expect(core.generateDailyDigest).not.toHaveBeenCalled();
    for (const data of [
      { ...job, scheduledAt: "yesterday" },
      { ...job, preferenceVersion: 0 },
      { ...job, snapshot: { title: "untrusted" } },
    ]) {
      await expect(process({ name: "daily-digest", data })).rejects.toThrow();
    }
    await expect(process({ name: "other", data: job })).rejects.toThrow(
      "Unsupported job",
    );
    expect(core.generateDailyDigest).not.toHaveBeenCalled();
    await process({ name: "daily-digest", data: job });
    expect(core.generateDailyDigest).toHaveBeenCalledWith(
      job.userId,
      job.scheduledAt,
      job.preferenceVersion,
    );
  });
});
