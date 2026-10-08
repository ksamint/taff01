import { CoreError, createCore } from "@taff/core";
import pino from "pino";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const core = createCore({
  databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
  authUrl: "http://localhost:3000",
  authSecret: "test-only-secret-with-at-least-32-characters",
});
const app = createApp(core, "http://localhost:3000", pino({ enabled: false }));
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
    expect(write).toHaveBeenCalledWith(id, {
      workspaceId: id,
      ownerId: id,
      title: "Task",
      workerId: null,
      dueAt: null,
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
