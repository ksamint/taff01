import { createHash } from "node:crypto";
import type { createCore } from "@taff/core";
import { digestJobSchema } from "@taff/schemas";
import type { Job, Queue } from "bullmq";
import { z } from "zod";

export function createDigestProcessor(
  core: Pick<
    ReturnType<typeof createCore>,
    "listDueDigestJobs" | "generateDailyDigest"
  >,
  queue: Pick<Queue, "add">,
) {
  return async (job: Pick<Job, "name" | "data">) => {
    if (job.name === "daily-digest") {
      const data = digestJobSchema.parse(job.data);
      return core.generateDailyDigest(
        data.userId,
        data.scheduledAt,
        data.preferenceVersion,
      );
    }
    if (job.name !== "digest-scan") throw new Error("Unsupported job");
    z.strictObject({}).parse(job.data);
    const now = new Date().toISOString();
    let cursor: Parameters<typeof core.listDueDigestJobs>[2];
    do {
      const page = await core.listDueDigestJobs(now, 100, cursor);
      for (const data of page.jobs) {
        const jobId = createHash("sha256")
          .update(
            `${data.userId}\0${data.scheduledAt}\0${data.preferenceVersion}`,
          )
          .digest("hex");
        await queue.add("daily-digest", data, {
          jobId,
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: 1000,
          // A later scan can retry an exhausted job while its DB marker is due.
          removeOnFail: true,
        });
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  };
}
