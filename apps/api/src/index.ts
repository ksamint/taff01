import { serve } from "@hono/node-server";
import { createCore } from "@taff/core";
import pino from "pino";
import { z } from "zod";
import { createApp } from "./app";
import { createRateLimiter } from "./rate-limit";

const env = z
  .object({
    DATABASE_URL: z.url(),
    AUTH_URL: z.url(),
    AUTH_SECRET: z.string().min(32),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    TOKEN_PEPPER: z.string().min(16),
    REDIS_URL: z.url(),
    MCP_RATE_LIMIT: z.coerce.number().int().min(1).default(60),
  })
  .parse(process.env);
const logger = pino({
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "password",
    "token",
  ],
});
const core = createCore({
  databaseUrl: env.DATABASE_URL,
  authUrl: env.AUTH_URL,
  authSecret: env.AUTH_SECRET,
  tokenPepper: env.TOKEN_PEPPER,
});
const rateLimiter = createRateLimiter(env.REDIS_URL, env.MCP_RATE_LIMIT);
const app = createApp(core, env.AUTH_URL, logger, rateLimiter);
const server = serve(
  { fetch: app.fetch, port: env.API_PORT, hostname: "127.0.0.1" },
  () => {
    logger.info({ port: env.API_PORT }, "API ready");
  },
);
const shutdown = () => {
  server.close(() => {
    void Promise.all([core.close(), rateLimiter.close()]).then(() =>
      process.exit(0),
    );
  });
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
