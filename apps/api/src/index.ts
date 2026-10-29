import { serve } from "@hono/node-server";
import {
  createAiProviderFromEnv,
  createCore,
  createEmailTransportFromEnv,
  createTencentSmsProviderFromEnv,
} from "@taff/core";
import { z } from "zod";
import { createApp } from "./app";
import { createLogger } from "./logger";
import { createRateLimiter } from "./rate-limit";
import { createRealtime } from "./realtime";

const env = z
  .object({
    DATABASE_URL: z.url(),
    AUTH_URL: z.url(),
    AUTH_SECRET: z.string().min(32),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    // Loopback by default; containers set 0.0.0.0 behind the reverse proxy.
    API_HOST: z.string().min(1).default("127.0.0.1"),
    TOKEN_PEPPER: z.string().min(16),
    REDIS_URL: z.url(),
    MCP_RATE_LIMIT: z.coerce.number().int().min(1).default(60),
    ASK_RATE_LIMIT: z.coerce.number().int().min(1).default(20),
  })
  .parse(process.env);
const logger = createLogger();
const core = createCore({
  trustedReview: process.env.TAFF_APPROVAL_KEY
    ? {
        key: z.string().min(32).parse(process.env.TAFF_APPROVAL_KEY),
        mappings: z
          .array(
            z
              .object({
                controllerId: z.string().min(1).max(200),
                workspaceId: z.string().uuid(),
                userId: z.string().min(1),
                verifiedByUserId: z.string().min(1),
              })
              .strict(),
          )
          .parse(JSON.parse(process.env.TAFF_WECHAT_CONTROLLERS ?? "[]")),
      }
    : undefined,
  databaseUrl: env.DATABASE_URL,
  authUrl: env.AUTH_URL,
  authSecret: env.AUTH_SECRET,
  tokenPepper: env.TOKEN_PEPPER,
  sms: createTencentSmsProviderFromEnv(process.env),
  email: createEmailTransportFromEnv(process.env),
  onEmailStatus: (status) => logger.info(status, "Email delivery status"),
  // Built only when AI_BASE_URL, AI_API_KEY and AI_MODEL are all set (ADR 0016).
  ai: createAiProviderFromEnv(process.env),
});
const rateLimiter = createRateLimiter(env.REDIS_URL, env.MCP_RATE_LIMIT);
const emailRateLimiter = createRateLimiter(env.REDIS_URL, 3);
const askRateLimiter = createRateLimiter(env.REDIS_URL, env.ASK_RATE_LIMIT);
// OAuth registration (global) and token exchanges (per client) per minute.
const oauthRateLimiter = createRateLimiter(env.REDIS_URL, 30);
const realtime = await createRealtime(core);
const app = createApp(
  core,
  env.AUTH_URL,
  logger,
  rateLimiter,
  realtime,
  emailRateLimiter,
  askRateLimiter,
  oauthRateLimiter,
);
const server = serve(
  {
    fetch: app.fetch,
    port: env.API_PORT,
    hostname: env.API_HOST,
    websocket: { server: realtime.server },
  },
  () => {
    logger.info({ port: env.API_PORT }, "API ready");
  },
);
const shutdown = async () => {
  await realtime.close();
  server.close(() => {
    void Promise.all([
      core.close(),
      rateLimiter.close(),
      emailRateLimiter.close(),
      askRateLimiter.close(),
      oauthRateLimiter.close(),
    ]).then(() => process.exit(0));
  });
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
