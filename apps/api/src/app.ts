import { CoreError, type createCore, userPrincipal } from "@taff/core";
import {
  assignTaskSchema,
  createAgentTokenSchema,
  createTaskSchema,
  idSchema,
  profileSchema,
  SchemaError,
  scheduleTaskSchema,
  signInSchema,
  signOutSchema,
  signUpSchema,
  updateTaskStatusSchema,
  workspaceQuerySchema,
} from "@taff/schemas";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { Logger } from "pino";
import { createMcpHttpHandler, describeCall } from "./mcp";
import type { RateLimiter } from "./rate-limit";

type Core = ReturnType<typeof createCore>;

export function createApp(
  core: Core,
  authUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter,
) {
  const origin = new URL(authUrl).origin;
  const app = new Hono<{ Variables: { userId: string } }>();
  const mcp = createMcpHttpHandler(core);
  // Agents reach core only through this adapter, with the same core as people.
  app.all("/mcp", async (c) => {
    const requestOrigin = c.req.header("origin");
    if (requestOrigin && requestOrigin !== origin)
      return c.json({ error: "forbidden" }, 403);
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const principal = token ? await core.authenticateAgentToken(token) : null;
    if (!principal || principal.kind !== "agent") {
      c.header("WWW-Authenticate", 'Bearer realm="taff"');
      return c.json({ error: "unauthorized" }, 401);
    }
    const started = Date.now();
    const body =
      c.req.method === "POST"
        ? await c.req.raw
            .clone()
            .json()
            .catch(() => null)
        : null;
    const { method, tool } = describeCall(body);
    const record = (status: "ok" | "error" | "denied" | "rate_limited") =>
      core
        .recordMcpCall({
          tokenId: principal.tokenId,
          workspaceId: principal.workspaceId,
          method,
          tool,
          status,
          durationMs: Date.now() - started,
        })
        .catch((error: Error) =>
          logger.error({ errorName: error.name }, "MCP call log failed"),
        );
    if (!(await rateLimiter.hit(principal.tokenId).catch(() => false))) {
      await record("rate_limited");
      return c.json({ error: "rate_limited" }, 429);
    }
    const state: { failed?: "error" | "denied" } = {};
    const response = await mcp.fetch(c.req.raw, {
      authInfo: {
        token: "redacted",
        clientId: principal.memberId,
        scopes: principal.scopes,
        extra: { principal, state },
      },
      parsedBody: body ?? undefined,
    });
    await record(state.failed ?? (response.ok ? "ok" : "error"));
    return response;
  });
  app.use("/api/*", cors({ origin, credentials: true }));
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 16_384,
      onError: (c) => c.json({ error: "invalid_input" }, 413),
    }),
  );
  app.use("/api/*", async (c, next) => {
    const requestOrigin = c.req.header("origin");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(c.req.method) &&
      requestOrigin &&
      requestOrigin !== origin
    ) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  });
  app.get("/api/health", (c) => c.json({ status: "ok" }));
  app.post("/api/auth/sign-in/email", async (c) => {
    signInSchema.parse(await c.req.raw.clone().json());
    return core.auth.handler(c.req.raw);
  });
  app.post("/api/auth/sign-up/email", async (c) => {
    signUpSchema.parse(await c.req.raw.clone().json());
    return core.auth.handler(c.req.raw);
  });
  app.post("/api/auth/sign-out", async (c) => {
    signOutSchema.parse(await c.req.raw.clone().json());
    return core.auth.handler(c.req.raw);
  });
  app.use("/api/*", async (c, next) => {
    const { response: session, headers } = await core.getSession(
      c.req.raw.headers,
    );
    for (const cookie of headers.getSetCookie()) {
      c.header("Set-Cookie", cookie, { append: true });
    }
    if (!session) return c.json({ error: "unauthorized" }, 401);
    c.set("userId", session.user.id);
    await next();
  });
  app.get("/api/me", async (c) => c.json(await core.getMe(c.get("userId"))));
  app.get("/api/members", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.listMembers(userPrincipal(c.get("userId")), workspaceId),
    );
  });
  app.get("/api/tasks", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.listTasks(userPrincipal(c.get("userId")), workspaceId),
    );
  });
  app.post("/api/tasks", async (c) => {
    const input = createTaskSchema.parse(await c.req.json());
    return c.json(
      await core.createTask(userPrincipal(c.get("userId")), input),
      201,
    );
  });
  app.patch("/api/tasks/:id/assignment", async (c) => {
    const id = idSchema.parse(c.req.param("id"));
    const input = assignTaskSchema.parse(await c.req.json());
    return c.json(
      await core.assignTask(userPrincipal(c.get("userId")), id, input),
    );
  });
  app.patch("/api/tasks/:id/status", async (c) => {
    const id = idSchema.parse(c.req.param("id"));
    const input = updateTaskStatusSchema.parse(await c.req.json());
    return c.json(
      await core.updateTaskStatus(userPrincipal(c.get("userId")), id, input),
    );
  });
  app.patch("/api/tasks/:id/schedule", async (c) => {
    const id = idSchema.parse(c.req.param("id"));
    const input = scheduleTaskSchema.parse(await c.req.json());
    return c.json(
      await core.scheduleTask(userPrincipal(c.get("userId")), id, input),
    );
  });
  app.get("/api/agent-tokens", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.listAgentTokens(userPrincipal(c.get("userId")), workspaceId),
    );
  });
  app.post("/api/agent-tokens", async (c) => {
    const input = createAgentTokenSchema.parse(await c.req.json());
    return c.json(
      await core.createAgentToken(userPrincipal(c.get("userId")), input),
      201,
    );
  });
  app.delete("/api/agent-tokens/:id", async (c) => {
    const id = idSchema.parse(c.req.param("id"));
    return c.json(
      await core.revokeAgentToken(userPrincipal(c.get("userId")), id),
    );
  });
  app.get("/api/mcp-calls", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.listMcpCalls(userPrincipal(c.get("userId")), workspaceId),
    );
  });
  app.patch("/api/profile", async (c) => {
    await core.updateProfile(
      c.get("userId"),
      profileSchema.parse(await c.req.json()),
    );
    return c.json({ success: true });
  });
  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((error, c) => {
    if (error instanceof SchemaError || error instanceof SyntaxError)
      return c.json({ error: "invalid_input" }, 400);
    if (error instanceof CoreError) {
      const status = error.status;
      if (
        status === 401 ||
        status === 403 ||
        status === 404 ||
        status === 409 ||
        status === 400
      ) {
        return c.json({ error: error.code }, status);
      }
    }
    // Request bodies, authorization headers and database error details may contain secrets.
    logger.error(
      { errorName: error.name, path: new URL(c.req.url).pathname },
      "Request failed",
    );
    return c.json({ error: "internal_error" }, 500);
  });
  return app;
}
