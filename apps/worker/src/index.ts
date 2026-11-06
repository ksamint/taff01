import { createCore } from "@taff/core";
import { Queue, Worker } from "bullmq";
import pino from "pino";
import { z } from "zod";
import { createDigestProcessor } from "./digests";
import { createSummaryProcessor, SUMMARY_JOB_NAMES } from "./summaries";

const redisUrl = new URL(z.url().parse(process.env.REDIS_URL));
if (!["redis:", "rediss:"].includes(redisUrl.protocol))
  throw new Error("REDIS_URL must use redis or rediss");
const logger = pino();
const env = z
  .object({
    DATABASE_URL: z.url(),
    AUTH_URL: z.url(),
    AUTH_SECRET: z.string().min(32),
    TOKEN_PEPPER: z.string().min(16),
    SUMMARY_RENDER_URL: z.url().optional(),
  })
  .parse(process.env);
const core = createCore({
  databaseUrl: env.DATABASE_URL,
  authUrl: env.AUTH_URL,
  authSecret: env.AUTH_SECRET,
  tokenPepper: env.TOKEN_PEPPER,
});
const connection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username
    ? decodeURIComponent(redisUrl.username)
    : undefined,
  password: redisUrl.password
    ? decodeURIComponent(redisUrl.password)
    : undefined,
  db: Number(redisUrl.pathname.slice(1) || 0),
  tls: redisUrl.protocol === "rediss:" ? {} : undefined,
  maxRetriesPerRequest: null,
};
const queue = new Queue("taff", { connection });
queue.on("error", (error) =>
  logger.error({ errorName: error.name }, "Queue connection error"),
);
const digests = createDigestProcessor(core, queue);
const summaries = createSummaryProcessor(core, queue, env.SUMMARY_RENDER_URL);
const worker = new Worker(
  "taff",
  (job) => (SUMMARY_JOB_NAMES.has(job.name) ? summaries(job) : digests(job)),
  { connection },
);
worker.on("error", (error) =>
  logger.error({ errorName: error.name }, "Worker connection error"),
);
worker.on("failed", (job) => logger.warn({ jobId: job?.id }, "Job failed"));
await worker.waitUntilReady();
await queue.upsertJobScheduler(
  "daily-digest-scan",
  { every: 60_000 },
  {
    name: "digest-scan",
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: true,
    },
  },
);
await queue.upsertJobScheduler(
  "daily-summary-scan",
  { every: 60_000 },
  {
    name: "summary-scan",
    data: {},
    opts: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: true,
    },
  },
);
logger.info("Worker ready");
const shutdown = () => {
  void worker
    .close()
    .then(() => Promise.all([queue.close(), core.close()]))
    .then(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
