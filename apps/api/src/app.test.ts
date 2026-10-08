import { CoreError, createCore } from "@taff/core";
import pino from "pino";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const core = createCore({
  databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
  authUrl: "http://localhost:3000",
  authSecret: "test-only-secret-with-at-least-32-characters",
  tokenPepper: "test-only-pepper-with-16-characters",
});
const rateLimiter = { hits: 0, limit: 2 };
const app = createApp(core, "http://localhost:3000", pino({ enabled: false }), {
  hit: async () => ++rateLimiter.hits <= rateLimiter.limit,
  close: async () => {},
});
const id = "00000000-0000-4000-8000-000000000001";
const now = new Date();
const session = {
  session: {
    id,
    userId: id,
    token: "test-token",
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    ipAddress: null,
    userAgent: null,
  },
  user: {
    id,
    email: "person@example.com",
    emailVerified: false,
    name: "Person",
    createdAt: now,
    updatedAt: now,
    image: null,
    locale: "en",
    tz: "UTC",
  },
};
afterEach(() => {
  vi.restoreAllMocks();
  rateLimiter.hits = 0;
  rateLimiter.limit = 2;
});
afterAll(() => core.close());
describe("REST adapter boundaries", () => {
  it("requires a session before core task reads", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: null,
      headers: new Headers(),
    });
    const read = vi.spyOn(core, "listTasks");
    const response = await app.request(`/api/tasks?workspaceId=${id}`);
    expect(response.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutations", async () => {
    const write = vi.spyOn(core, "createTask");
    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: {
        origin: "https://other.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(response.status).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });
  it("validates before calling core and does not expose input", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: session,
      headers: new Headers(),
    });
    const write = vi.spyOn(core, "createTask");
    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Task",
        ownerId: "bad",
        password: "never echo",
      }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_input" });
    expect(write).not.toHaveBeenCalled();
  });
  it("passes only validated fields with the authenticated actor", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: session,
      headers: new Headers(),
    });
    const task = {
      description: "",
      priority: 3,
      projectId: null,
      labels: [],
      parentId: null,
      version: 1,
      id,
      workspaceId: id,
      ownerId: id,
      workerId: null,
      title: "Task",
      dueAt: null,
      status: "todo" as const,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    const write = vi.spyOn(core, "createTask").mockResolvedValue(task);
    const response = await app.request("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: id, ownerId: id, title: " Task " }),
    });
    expect(response.status).toBe(201);
    expect(write).toHaveBeenCalledWith(
      { kind: "user", userId: id },
      {
        workspaceId: id,
        ownerId: id,
        title: "Task",
        workerId: null,
      },
    );
  });
  it("rejects MCP requests without a valid agent token and never reaches core", async () => {
    const authenticate = vi
      .spyOn(core, "authenticateAgentToken")
      .mockResolvedValue(null);
    const read = vi.spyOn(core, "listTasks");
    const anonymous = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("www-authenticate")).toContain("Bearer");
    expect(authenticate).not.toHaveBeenCalled();
    const bad = await app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer taff_not-a-real-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(bad.status).toBe(401);
    expect(authenticate).toHaveBeenCalledWith("taff_not-a-real-token");
    expect(read).not.toHaveBeenCalled();
  });
  it("rate-limits MCP calls per token and logs every call", async () => {
    const principal = {
      kind: "agent" as const,
      tokenId: id,
      memberId: id,
      workspaceId: id,
      scopes: ["tasks:read" as const],
    };
    vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
    const log = vi.spyOn(core, "recordMcpCall").mockResolvedValue();
    vi.spyOn(core, "listTasks").mockResolvedValue([]);
    rateLimiter.hits = 0;
    const call = () =>
      app.request("/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer taff_token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "tasks.list", arguments: {} },
        }),
      });
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(log.mock.calls.map(([entry]) => entry.status)).toEqual([
      "ok",
      "ok",
      "rate_limited",
    ]);
    expect(log.mock.calls[0][0]).toMatchObject({
      tokenId: id,
      method: "tools/call",
      tool: "tasks.list",
    });
  });
  it("forwards every refreshed session cookie to the browser", async () => {
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      "test.session=renewed; HttpOnly; SameSite=Lax; Path=/",
    );
    headers.append(
      "Set-Cookie",
      "test.cache=renewed; HttpOnly; SameSite=Lax; Path=/",
    );
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: session,
      headers,
    });
    vi.spyOn(core, "listTasks").mockResolvedValue([]);
    const response = await app.request(`/api/tasks?workspaceId=${id}`);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toEqual(headers.getSetCookie());
  });
  it("preserves the auth request body after shared validation", async () => {
    const credentials = {
      email: "person@example.com",
      password: "password123",
    };
    vi.spyOn(core.auth, "handler").mockImplementation(async (request) =>
      Response.json(await request.json()),
    );
    const response = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(credentials);
  });
  it("maps permission failures without leaking internals", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: session,
      headers: new Headers(),
    });
    vi.spyOn(core, "listTasks").mockRejectedValue(
      new CoreError("forbidden", 403),
    );
    const response = await app.request(`/api/tasks?workspaceId=${id}`);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });
  it("normalizes typed task filters while rejecting unknown or malformed query fields", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: session,
      headers: new Headers(),
    });
    const read = vi.spyOn(core, "listTasks").mockResolvedValue([]);
    const response = await app.request(
      `/api/tasks?workspaceId=${id}&projectId=null&parentId=null&workerId=null&priority=1&sort=due`,
    );
    expect(response.status).toBe(200);
    expect(read).toHaveBeenCalledWith({ kind: "user", userId: id }, id, {
      projectId: null,
      parentId: null,
      workerId: null,
      priority: 1,
      sort: "due",
    });
    read.mockClear();
    for (const extra of ["priority=urgent", "unknown=secret", "ownerId=null"]) {
      const invalid = await app.request(
        `/api/tasks?workspaceId=${id}&${extra}`,
      );
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toEqual({ error: "invalid_input" });
    }
    expect(read).not.toHaveBeenCalled();
  });
  it("preserves full CJK task descriptions within a bounded task-only request limit", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: session,
      headers: new Headers(),
    });
    const input = { version: 1, description: "說".repeat(20_000) };
    const result = {
      id,
      workspaceId: id,
      title: "Task",
      ownerId: id,
      workerId: null,
      dueAt: null,
      status: "todo" as const,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      description: input.description,
      priority: 3,
      projectId: null,
      labels: [],
      parentId: null,
      version: 2,
    };
    const update = vi.spyOn(core, "updateTask").mockResolvedValue(result);
    const response = await app.request(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      { kind: "user", userId: id },
      id,
      input,
    );
    const escapedInput = { version: 1, description: "\u0001".repeat(20_000) };
    const escaped = await app.request(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(escapedInput),
    });
    expect(escaped.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      { kind: "user", userId: id },
      id,
      escapedInput,
    );
    update.mockClear();
    const oversized = await app.request(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: 1, description: "說".repeat(44_000) }),
    });
    expect(oversized.status).toBe(413);
    expect(update).not.toHaveBeenCalled();
  });
  it("accepts the full shared comment limit even when JSON escaping expands it", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: session,
      headers: new Headers(),
    });
    const input = { body: "\u0001".repeat(5000) };
    const write = vi.spyOn(core, "addTaskComment").mockResolvedValue({
      id,
      workspaceId: id,
      taskId: id,
      authorId: id,
      body: input.body,
      createdAt: now.toISOString(),
    });
    const response = await app.request(`/api/tasks/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(201);
    expect(write).toHaveBeenCalledWith({ kind: "user", userId: id }, id, input);
  });
  it("limits auth request size and CORS to AUTH_URL", async () => {
    const response = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: "x".repeat(17_000) }),
    });
    expect(response.status).toBe(413);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    const foreign = await app.request("/api/health", {
      headers: { origin: "https://other.example" },
    });
    expect(foreign.headers.get("access-control-allow-origin")).not.toBe(
      "https://other.example",
    );
  });
  it.each([
    ["POST", "/api/tasks/:id/runs", "startRun", { unexpected: true }],
    [
      "POST",
      "/api/runs/:id/control",
      "controlRun",
      { version: 0, action: "pause" },
    ],
    [
      "POST",
      "/api/runs/:id/events",
      "appendRunEvent",
      { version: 1, kind: "test", title: "test", costMicros: -1 },
    ],
    [
      "POST",
      "/api/runs/:id/artifacts",
      "attachRunArtifact",
      {
        version: 1,
        name: "file",
        mimeType: "text/plain",
        content: "",
        sourceUrl: "javascript:alert(1)",
      },
    ],
    ["POST", "/api/runs/:id/submit", "submitRun", { version: 1, summary: "" }],
    [
      "POST",
      "/api/runs/:id/review",
      "reviewRun",
      { version: 1, decision: "approve", checks: {} },
    ],
    [
      "POST",
      "/api/runs/:id/comments",
      "addReviewComment",
      { version: 1, body: "comment", line: 0 },
    ],
    [
      "PATCH",
      "/api/agents/:id",
      "updateAgentProfile",
      { supervisorId: id, reviewPolicy: "auto" },
    ],
    [
      "PUT",
      "/api/agents/:id/permissions",
      "setAgentPermission",
      { capability: "deploy.prod", decision: "sometimes" },
    ],
    [
      "POST",
      "/api/agents/:id/grants",
      "requestGrant",
      { capability: "repo.read", reason: "" },
    ],
    [
      "POST",
      "/api/grants/:id/decision",
      "decideGrant",
      { decision: "allow", expiresAt: "tomorrow" },
    ],
    ["PATCH", "/api/inbox/:id", "updateInboxItem", {}],
    ["PATCH", "/api/tasks/:id", "updateTask", { version: 0, title: "Task" }],
    [
      "PATCH",
      "/api/tasks/:id/calendar",
      "setTaskCalendar",
      { version: 0, schedule: null },
    ],
    [
      "PATCH",
      "/api/tasks/:id/calendar",
      "setTaskCalendar",
      {
        version: 1,
        schedule: {
          startAt: "2026-10-09T09:00:00Z",
          endAt: "2026-10-09T09:00:00Z",
          timeZone: "UTC",
          rrule: null,
        },
      },
    ],
    [
      "PATCH",
      "/api/tasks/:id/calendar",
      "setTaskCalendar",
      {
        version: 1,
        schedule: {
          startAt: "2026-10-09T09:00:00Z",
          endAt: "2026-10-09T10:00:00Z",
          timeZone: "Moon/Sea",
          rrule: null,
        },
      },
    ],
    ["POST", "/api/tasks/:id/comments", "addTaskComment", { body: "" }],
    ["POST", `/api/projects?workspaceId=${id}`, "createProject", { name: "" }],
    [
      "PATCH",
      "/api/projects/:id",
      "updateProject",
      { version: 1, archived: "true" },
    ],
    [
      "POST",
      "/api/workspaces",
      "createWorkspace",
      { name: "Organization", agentIds: ["bad"] },
    ],
    [
      "POST",
      "/api/workspaces/:id/invites",
      "createWorkspaceInvite",
      { email: "invalid", role: "admin" },
    ],
    [
      "POST",
      "/api/workspace-invites/accept",
      "acceptWorkspaceInvite",
      { token: "short" },
    ],
    [
      "PATCH",
      "/api/workspaces/:id/members/:id",
      "updateMemberRole",
      { role: "owner" },
    ],
    [
      "POST",
      `/api/search?workspaceId=${id}`,
      "search",
      { query: "task", scope: "public" },
    ],
    [
      "POST",
      `/api/quick-add/parse?workspaceId=${id}`,
      "parseQuickAdd",
      { text: "" },
    ],
  ] as const)(
    "validates %s %s before core",
    async (method, path, operation, input) => {
      vi.spyOn(core, "getSession").mockResolvedValue({
        response: session,
        headers: new Headers(),
      });
      const write = vi.spyOn(core, operation);
      const response = await app.request(path.replaceAll(":id", id), {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_input" });
      expect(write).not.toHaveBeenCalled();
    },
  );
  it("validates the calendar range before forwarding the authenticated workspace", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: session,
      headers: new Headers(),
    });
    const list = vi.spyOn(core, "listCalendar").mockResolvedValue({
      occurrences: [],
      unscheduled: [],
      truncated: false,
    });
    const range = { from: "2026-10-09T00:00:00Z", to: "2026-10-16T00:00:00Z" };
    const query = new URLSearchParams({ workspaceId: id, ...range });
    const response = await app.request(`/api/calendar?${query}`);
    expect(response.status).toBe(200);
    expect(list).toHaveBeenCalledWith({ kind: "user", userId: id }, id, range);
    list.mockClear();
    for (const invalid of [
      { ...range, unknown: "field" },
      { ...range, to: range.from },
      { ...range, to: "2027-01-01T00:00:00Z" },
    ]) {
      const result = await app.request(
        `/api/calendar?${new URLSearchParams({ workspaceId: id, ...invalid })}`,
      );
      expect(result.status).toBe(400);
    }
    expect(list).not.toHaveBeenCalled();
  });
  it("forwards a versioned schedule to core and retains its conflict response", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: session,
      headers: new Headers(),
    });
    const body = {
      version: 2,
      schedule: {
        startAt: "2026-10-09T09:00:00Z",
        endAt: "2026-10-09T10:00:00Z",
        timeZone: "Asia/Singapore",
        rrule: "FREQ=DAILY;COUNT=3",
      },
    };
    const write = vi
      .spyOn(core, "setTaskCalendar")
      .mockRejectedValue(new CoreError("conflict", 409));
    const response = await app.request(`/api/tasks/${id}/calendar`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "conflict" });
    expect(write).toHaveBeenCalledWith({ kind: "user", userId: id }, id, body);
  });
  it("accepts bounded artifact content above the ordinary body limit and preserves the actor", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: session,
      headers: new Headers(),
    });
    const input = {
      version: 2,
      name: "report.txt",
      mimeType: "text/plain",
      content: "x".repeat(20000),
      diff: null,
      sourceUrl: null,
    };
    const artifact = {
      ...input,
      id,
      workspaceId: id,
      runId: id,
      createdAt: now.toISOString(),
    };
    const attach = vi
      .spyOn(core, "attachRunArtifact")
      .mockResolvedValue(artifact);
    const response = await app.request(`/api/runs/${id}/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(201);
    expect(attach).toHaveBeenCalledWith(
      { kind: "user", userId: id },
      id,
      input,
    );
    const oversized = await app.request(`/api/runs/${id}/artifacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, content: "x".repeat(1_048_576) }),
    });
    expect(oversized.status).toBe(413);
  });
  it("validates MCP run arguments and forwards a valid artifact with token identity", async () => {
    const principal = {
      kind: "agent" as const,
      tokenId: id,
      memberId: id,
      workspaceId: id,
      scopes: ["tasks:write" as const, "files:write" as const],
    };
    vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
    vi.spyOn(core, "recordMcpCall").mockResolvedValue();
    const artifact = {
      id,
      workspaceId: id,
      runId: id,
      name: "file.txt",
      mimeType: "text/plain",
      content: "Real output",
      diff: null,
      sourceUrl: null,
      createdAt: now.toISOString(),
    };
    const attach = vi
      .spyOn(core, "attachRunArtifact")
      .mockResolvedValue(artifact);
    const call = (args: unknown) =>
      app.request("/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer redacted-test-token",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "files.attach", arguments: args },
        }),
      });
    const invalid = await call({ runId: id, version: -1 });
    const invalidBody = await invalid.text();
    const raw = invalid.headers.get("content-type")?.includes("event-stream")
      ? invalidBody
          .split("\n")
          .find((line) => line.startsWith("data:"))
          ?.slice(5)
      : invalidBody;
    const invalidResult = JSON.parse(raw ?? "{}") as {
      result?: { isError: boolean };
      error?: unknown;
    };
    expect(invalidResult.result?.isError || !!invalidResult.error).toBe(true);
    expect(attach).not.toHaveBeenCalled();
    const args = {
      runId: id,
      version: 3,
      name: "file.txt",
      mimeType: "text/plain",
      content: "Real output",
    };
    const valid = await call(args);
    expect(valid.status).toBe(200);
    expect(attach).toHaveBeenCalledWith(principal, id, {
      version: 3,
      name: "file.txt",
      mimeType: "text/plain",
      content: "Real output",
      diff: null,
      sourceUrl: null,
    });
  });
});
