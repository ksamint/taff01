import { CoreError, type createCore, userPrincipal } from "@taff/core";
import {
  agentPermissionInputSchema,
  agentProfileInputSchema,
  appendRunEventSchema,
  assignTaskSchema,
  attachRunArtifactSchema,
  calendarRangeSchema,
  controlRunSchema,
  createAgentTokenSchema,
  createTaskSchema,
  decideGrantSchema,
  idSchema,
  inboxFilterSchema,
  inboxItemInputSchema,
  memberRoleInputSchema,
  profileSchema,
  projectInputSchema,
  projectUpdateSchema,
  quickAddInputSchema,
  requestGrantSchema,
  reviewCommentSchema,
  reviewRunSchema,
  SchemaError,
  scheduleTaskSchema,
  searchInputSchema,
  setTaskCalendarSchema,
  signInSchema,
  signOutSchema,
  signUpSchema,
  startRunSchema,
  submitRunSchema,
  taskCommentInputSchema,
  taskFilterSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  workspaceCreateSchema,
  workspaceInviteAcceptSchema,
  workspaceInviteInputSchema,
  workspaceQuerySchema,
} from "@taff/schemas";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { Logger } from "pino";
import { createMcpHttpHandler, describeCall } from "./mcp";
import type { RateLimiter } from "./rate-limit";
import type { Realtime } from "./realtime";

type Core = ReturnType<typeof createCore>;

export function createApp(
  core: Core,
  authUrl: string,
  logger: Logger,
  rateLimiter: RateLimiter,
  realtime?: Realtime,
) {
  const origin = new URL(authUrl).origin;
  const app = new Hono<{
    Variables: { userId: string; sessionExpiresAt: number };
  }>();
  const mcp = createMcpHttpHandler(core);
  app.use(
    "/mcp",
    bodyLimit({
      maxSize: 1_048_576,
      onError: (c) => c.json({ error: "invalid_input" }, 413),
    }),
  );
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
  app.use("/api/*", (c, next) =>
    bodyLimit({
      maxSize: /^\/api\/runs\/[^/]+\/artifacts$/.test(c.req.path)
        ? 1_048_576
        : /^\/api\/tasks(?:\/[^/]+(?:\/comments)?)?$/.test(c.req.path)
          ? 131_072
          : 16_384,
      onError: (ctx) => ctx.json({ error: "invalid_input" }, 413),
    })(c, next),
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
    c.set("sessionExpiresAt", session.session.expiresAt.getTime());
    await next();
  });
  app.get("/api/realtime", async (c) => {
    if (c.req.header("origin") !== origin)
      return c.json({ error: "forbidden" }, 403);
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    const userId = c.get("userId");
    await core.listMembers(userPrincipal(userId), workspaceId);
    if (!realtime) return c.json({ error: "unavailable" }, 503);
    return realtime.upgrade(c, userId, workspaceId, c.get("sessionExpiresAt"));
  });
  app.get("/api/me", async (c) => c.json(await core.getMe(c.get("userId"))));
  app.get("/api/members", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.listMembers(userPrincipal(c.get("userId")), workspaceId),
    );
  });
  app.get("/api/tasks", async (c) => {
    const { workspaceId, ...query } = c.req.query();
    const workspace = workspaceQuerySchema.parse({ workspaceId });
    const filter = taskFilterSchema.parse({
      ...query,
      ...(query.priority !== undefined
        ? { priority: Number(query.priority) }
        : {}),
      ...Object.fromEntries(
        ["projectId", "parentId", "workerId"]
          .filter((key) => query[key] === "null")
          .map((key) => [key, null]),
      ),
    });
    return c.json(
      await core.listTasks(
        userPrincipal(c.get("userId")),
        workspace.workspaceId,
        filter,
      ),
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
  app.get("/api/tasks/:id", async (c) =>
    c.json(
      await core.getTask(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.patch("/api/tasks/:id", async (c) =>
    c.json(
      await core.updateTask(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        updateTaskSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.get("/api/tasks/:id/access", async (c) =>
    c.json(
      await core.getTaskAccess(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.get("/api/tasks/:id/calendar", async (c) =>
    c.json(
      await core.getTaskCalendar(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.patch("/api/tasks/:id/calendar", async (c) =>
    c.json(
      await core.setTaskCalendar(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        setTaskCalendarSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.get("/api/calendar", async (c) => {
    const { workspaceId, ...range } = c.req.query();
    const workspace = workspaceQuerySchema.parse({ workspaceId });
    return c.json(
      await core.listCalendar(
        userPrincipal(c.get("userId")),
        workspace.workspaceId,
        calendarRangeSchema.parse(range),
      ),
    );
  });
  app.get("/api/tasks/:id/comments", async (c) =>
    c.json(
      await core.listTaskComments(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.post("/api/tasks/:id/comments", async (c) =>
    c.json(
      await core.addTaskComment(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        taskCommentInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.get("/api/projects", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.listProjects(userPrincipal(c.get("userId")), workspaceId),
    );
  });
  app.post("/api/projects", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.createProject(
        userPrincipal(c.get("userId")),
        workspaceId,
        projectInputSchema.parse(await c.req.json()),
      ),
      201,
    );
  });
  app.patch("/api/projects/:id", async (c) =>
    c.json(
      await core.updateProject(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        projectUpdateSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.post("/api/workspaces", async (c) =>
    c.json(
      await core.createWorkspace(
        userPrincipal(c.get("userId")),
        workspaceCreateSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.get("/api/workspaces/:id/invites", async (c) =>
    c.json(
      await core.listWorkspaceInvites(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.get("/api/workspaces/:id/access", async (c) =>
    c.json(
      await core.getWorkspaceAccess(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.post("/api/workspaces/:id/invites", async (c) =>
    c.json(
      await core.createWorkspaceInvite(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        workspaceInviteInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.delete("/api/workspace-invites/:id", async (c) =>
    c.json(
      await core.revokeWorkspaceInvite(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.post("/api/workspace-invites/accept", async (c) =>
    c.json(
      await core.acceptWorkspaceInvite(
        userPrincipal(c.get("userId")),
        workspaceInviteAcceptSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.patch("/api/workspaces/:id/members/:memberId", async (c) =>
    c.json(
      await core.updateMemberRole(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        idSchema.parse(c.req.param("memberId")),
        memberRoleInputSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.post("/api/search", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.search(
        userPrincipal(c.get("userId")),
        workspaceId,
        searchInputSchema.parse(await c.req.json()),
      ),
    );
  });
  app.post("/api/quick-add/parse", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.parseQuickAdd(
        userPrincipal(c.get("userId")),
        workspaceId,
        quickAddInputSchema.parse(await c.req.json()),
      ),
    );
  });
  app.get("/api/runs", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.listRuns(userPrincipal(c.get("userId")), workspaceId),
    );
  });
  app.get("/api/runs/:id", async (c) =>
    c.json(
      await core.getRun(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.post("/api/tasks/:id/runs", async (c) =>
    c.json(
      await core.startRun(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        startRunSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.post("/api/runs/:id/control", async (c) =>
    c.json(
      await core.controlRun(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        controlRunSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.post("/api/runs/:id/events", async (c) =>
    c.json(
      await core.appendRunEvent(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        appendRunEventSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.post("/api/runs/:id/artifacts", async (c) =>
    c.json(
      await core.attachRunArtifact(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        attachRunArtifactSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.post("/api/runs/:id/submit", async (c) =>
    c.json(
      await core.submitRun(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        submitRunSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.get("/api/tasks/:id/review", async (c) =>
    c.json(
      await core.getReview(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.post("/api/runs/:id/review", async (c) =>
    c.json(
      await core.reviewRun(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        reviewRunSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.post("/api/runs/:id/comments", async (c) =>
    c.json(
      await core.addReviewComment(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        reviewCommentSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.get("/api/agents/:id", async (c) =>
    c.json(
      await core.getAgentProfile(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.patch("/api/agents/:id", async (c) =>
    c.json(
      await core.updateAgentProfile(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        agentProfileInputSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.put("/api/agents/:id/permissions", async (c) =>
    c.json(
      await core.setAgentPermission(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        agentPermissionInputSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.post("/api/agents/:id/grants", async (c) =>
    c.json(
      await core.requestGrant(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        requestGrantSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.post("/api/grants/:id/decision", async (c) =>
    c.json(
      await core.decideGrant(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        decideGrantSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.get("/api/inbox", async (c) => {
    const { workspaceId, ...filter } = c.req.query();
    const workspace = workspaceQuerySchema.parse({ workspaceId });
    return c.json(
      await core.listInbox(
        userPrincipal(c.get("userId")),
        workspace.workspaceId,
        inboxFilterSchema.parse(filter),
      ),
    );
  });
  app.patch("/api/inbox/:id", async (c) =>
    c.json(
      await core.updateInboxItem(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        inboxItemInputSchema.parse(await c.req.json()),
      ),
    ),
  );
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
