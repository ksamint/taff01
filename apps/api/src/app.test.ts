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
afterEach(() => vi.restoreAllMocks());
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
        dueAt: null,
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
});
