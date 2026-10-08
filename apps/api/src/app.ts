import { CoreError, type createCore } from "@taff/core";
import {
  assignTaskSchema,
  createTaskSchema,
  idSchema,
  profileSchema,
  signInSchema,
  signOutSchema,
  signUpSchema,
  workspaceQuerySchema,
} from "@taff/schemas";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { Logger } from "pino";
import { ZodError } from "zod";

type Core = ReturnType<typeof createCore>;

export function createApp(core: Core, authUrl: string, logger: Logger) {
  const origin = new URL(authUrl).origin;
  const app = new Hono<{ Variables: { userId: string } }>();
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
    return c.json(await core.listMembers(c.get("userId"), workspaceId));
  });
  app.get("/api/tasks", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(await core.listTasks(c.get("userId"), workspaceId));
  });
  app.post("/api/tasks", async (c) => {
    const input = createTaskSchema.parse(await c.req.json());
    return c.json(await core.createTask(c.get("userId"), input), 201);
  });
  app.patch("/api/tasks/:id/assignment", async (c) => {
    const id = idSchema.parse(c.req.param("id"));
    const input = assignTaskSchema.parse(await c.req.json());
    return c.json(await core.assignTask(c.get("userId"), id, input));
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
    if (error instanceof ZodError || error instanceof SyntaxError)
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
