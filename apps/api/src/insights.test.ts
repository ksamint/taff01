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
const app = createApp(core, "http://localhost:3000", pino({ enabled: false }), {
  limit: 60,
  hit: async () => ({ allowed: true, count: 1 }),
  close: async () => {},
});
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const person = { kind: "user", userId: id };
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
    systemAdmin: false,
    name: "Person",
    createdAt: now,
    updatedAt: now,
    image: null,
    locale: "en",
    tz: "UTC",
  },
};
const signedIn = () =>
  vi
    .spyOn(core, "getSession")
    .mockResolvedValue({ response: session, headers: new Headers() });
const graph = {
  workspaceId: id,
  projectId: null,
  layers: ["people", "dependencies", "org", "crm"],
  crmVisible: false,
  nodes: [],
  edges: [],
};
afterEach(() => vi.restoreAllMocks());
afterAll(() => core.close());

describe("relations REST", () => {
  it("requires a session", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: null,
      headers: new Headers(),
    });
    const read = vi.spyOn(core, "relationGraph");
    expect((await app.request(`/api/workspaces/${id}/graph`)).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it("parses the scope and comma-separated layers", async () => {
    signedIn();
    const read = vi
      .spyOn(core, "relationGraph")
      .mockResolvedValue(graph as never);
    const response = await app.request(
      `/api/workspaces/${id}/graph?projectId=${other}&layers=people,crm`,
    );
    expect(response.status).toBe(200);
    expect(read).toHaveBeenCalledWith(person, id, {
      projectId: other,
      layers: ["people", "crm"],
    });
    await app.request(`/api/workspaces/${id}/graph`);
    expect(read).toHaveBeenLastCalledWith(person, id, {});
    for (const query of [
      "layers=chain",
      "layers=people,people",
      "projectId=nope",
      "extra=1",
    ])
      expect(
        (await app.request(`/api/workspaces/${id}/graph?${query}`)).status,
      ).toBe(400);
    expect((await app.request("/api/workspaces/bad/graph")).status).toBe(400);
    expect(read).toHaveBeenCalledTimes(2);
    read.mockRejectedValueOnce(new CoreError("forbidden", 403));
    expect((await app.request(`/api/workspaces/${id}/graph`)).status).toBe(403);
  });
});

describe("insight MCP tools", () => {
  const principal = {
    kind: "agent" as const,
    tokenId: id,
    memberId: id,
    workspaceId: id,
    scopes: ["tasks:read" as const, "tasks:write" as const],
  };
  const call = async (method: string, params: unknown) => {
    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer redacted-test-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const text = await response.text();
    const raw = response.headers.get("content-type")?.includes("event-stream")
      ? text
          .split("\n")
          .find((line) => line.startsWith("data:"))
          ?.slice(5)
      : text;
    return JSON.parse(raw ?? "{}") as {
      result?: { isError?: boolean; tools?: { name: string }[] };
      error?: unknown;
    };
  };
  it("reads relations in the token workspace with validated arguments", async () => {
    vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
    vi.spyOn(core, "recordMcpCall").mockResolvedValue();
    const listed = await call("tools/list", {});
    expect(listed.result?.tools?.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["relations.get"]),
    );
    const read = vi
      .spyOn(core, "relationGraph")
      .mockResolvedValue(graph as never);
    const bad = await call("tools/call", {
      name: "relations.get",
      arguments: { layers: ["chain"] },
    });
    expect(bad.result?.isError || !!bad.error).toBe(true);
    expect(read).not.toHaveBeenCalled();
    await call("tools/call", {
      name: "relations.get",
      arguments: { projectId: other, layers: ["dependencies"] },
    });
    expect(read).toHaveBeenCalledWith(principal, id, {
      projectId: other,
      layers: ["dependencies"],
    });
  });
});
