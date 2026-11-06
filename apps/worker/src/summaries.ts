import { createHash } from "node:crypto";
import {
  type createCore,
  renderSummaryText,
  summaryTranslate,
} from "@taff/core";
import {
  idSchema,
  summaryJobSchema,
  summaryRenderFormatSchema,
} from "@taff/schemas";
import type { Job, Queue } from "bullmq";
import { z } from "zod";

/** Job names this processor owns on the shared "taff" queue (ADR 0027). */
export const SUMMARY_JOB_NAMES = new Set([
  "summary-scan",
  "daily-summary",
  "summary-render",
]);

/**
 * A minute scan pages due recipients and enqueues one job each under a
 * stable id, so a retried or overlapping scan adds nothing. A failed enqueue
 * leaves the recipient's marker due for the next scan.
 */
export function createSummaryProcessor(
  core: Pick<
    ReturnType<typeof createCore>,
    | "listDueSummaryJobs"
    | "generateDailySummary"
    | "getSummaryForRender"
    | "storeSummaryRender"
    | "listMissingSummaryRenders"
    | "recordSummaryRenderFailure"
  >,
  queue: Pick<Queue, "add">,
  renderUrl = process.env.SUMMARY_RENDER_URL,
) {
  async function enqueueRender(summaryId: string, format: "txt" | "png") {
    if (format === "png" && !renderUrl) return;
    await queue.add(
      "summary-render",
      { summaryId, format },
      {
        jobId: createHash("sha256")
          .update(`${summaryId}\0${format}`)
          .digest("hex"),
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: true,
      },
    );
  }
  return async (job: Pick<Job, "name" | "data">) => {
    if (job.name === "summary-render") {
      const data = z
        .strictObject({
          summaryId: idSchema,
          format: summaryRenderFormatSchema,
        })
        .parse(job.data);
      if (data.format === "png" && !renderUrl) return;
      try {
        const summary = await core.getSummaryForRender(data.summaryId);
        const text = renderSummaryText(
          summary.snapshot,
          summary.watermark,
          summary.contentHash,
          summary.createdAt,
          summary.locale,
          summaryTranslate(summary.locale),
        );
        if (data.format === "txt")
          return await core.storeSummaryRender({
            ...data,
            body: text,
            rendererVersion: "text-1",
          });
        const formattedCreatedAt = new Intl.DateTimeFormat(summary.locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: summary.timeZone,
        }).format(new Date(summary.createdAt));
        const response = await fetch(new URL("/render/summary", renderUrl), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            snapshot: summary.snapshot,
            watermark: summary.watermark,
            contentHash: summary.contentHash,
            createdAt: summary.createdAt,
            locale: summary.locale,
            text,
            formattedCreatedAt,
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.startsWith("image/png")
        )
          throw new Error("Summary renderer failed");
        // Bound memory even if an internal renderer returns an invalid/oversized stream.
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Empty summary image");
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 400 * 1024)
              throw new Error("Summary image exceeds size cap");
            chunks.push(chunk.value);
          }
        } finally {
          await reader.cancel();
        }
        return await core.storeSummaryRender({
          ...data,
          data: Buffer.concat(chunks).toString("base64"),
          rendererVersion: "png-1",
        });
      } catch (error) {
        await core.recordSummaryRenderFailure(data.summaryId, data.format);
        throw error;
      }
    }
    if (job.name === "daily-summary") {
      const data = summaryJobSchema.parse(job.data);
      const result = await core.generateDailySummary(
        data.recipientId,
        data.scheduledAt,
        data.version,
      );
      if (result.summaryId) {
        await enqueueRender(result.summaryId, "txt");
        await enqueueRender(result.summaryId, "png");
      }
      return result;
    }
    if (job.name !== "summary-scan") throw new Error("Unsupported job");
    z.strictObject({}).parse(job.data);
    const now = new Date().toISOString();
    for (const missing of await core.listMissingSummaryRenders(
      now,
      renderUrl ? ["txt", "png"] : ["txt"],
    ))
      await enqueueRender(missing.summaryId, missing.format);
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
