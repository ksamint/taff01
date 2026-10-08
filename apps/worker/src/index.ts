import { Worker } from "bullmq";
import pino from "pino";
import { z } from "zod";

const redisUrl = new URL(z.url().parse(process.env.REDIS_URL));
if (!["redis:", "rediss:"].includes(redisUrl.protocol))
  throw new Error("REDIS_URL must use redis or rediss");
const logger = pino();
// ponytail: phase 1 has no background jobs; reject unknown jobs until a validated handler is added.
const worker = new Worker(
  "taff",
  async () => {
    throw new Error("Unsupported job");
  },
  {
    connection: {
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
    },
  },
);
worker.on("error", (error) =>
  logger.error({ errorName: error.name }, "Worker connection error"),
);
worker.on("failed", (job) => logger.warn({ jobId: job?.id }, "Job failed"));
await worker.waitUntilReady();
logger.info("Worker ready");
const shutdown = () => {
  void worker.close().then(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
