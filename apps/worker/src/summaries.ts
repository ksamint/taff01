import { createHash } from "node:crypto";
import type { createCore } from "@taff/core";
import { summaryJobSchema } from "@taff/schemas";
import type { Job, Queue } from "bullmq";
import { z } from "zod";

/** Job names this processor owns on the shared "taff" queue (ADR 0027). */
export const SUMMARY_JOB_NAMES = new Set(["summary-scan", "daily-summary"]);

/**
 * A minute scan pages due recipients and enqueues one job each under a
 * stable id, so a retried or overlapping scan adds nothing. A failed enqueue
 * leaves the recipient's marker due for the next scan.
 */
export function createSummaryProcessor(
  core: Pick<
    ReturnType<typeof createCore>,
    "listDueSummaryJobs" | "generateDailySummary"
  >,
  queue: Pick<Queue, "add">,
) {
  return async (job: Pick<Job, "name" | "data">) => {
    if (job.name === "daily-summary") {
      const data = summaryJobSchema.parse(job.data);
      return core.generateDailySummary(
        data.recipientId,
        data.scheduledAt,
        data.version,
      );
    }
    if (job.name !== "summary-scan") throw new Error("Unsupported job");
    z.strictObject({}).parse(job.data);
    const now = new Date().toISOString();
    let cursor: Parameters<typeof core.listDueSummaryJobs>[2];
    do {
      const page = await core.listDueSummaryJobs(now, 100, cursor);
      for (const data of page.jobs) {
        const jobId = createHash("sha256")
          .update(
            `summary\0${data.recipientId}\0${data.scheduledAt}\0${data.version}`,
          )
          .digest("hex");
        await queue.add("daily-summary", data, {
          jobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 1000,
          // A later scan retries an exhausted job while its marker is due.
          removeOnFail: true,
        });
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  };
}
