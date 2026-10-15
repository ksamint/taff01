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
const askLimit = { hits: 0, limit: 2, down: false, keys: [] as string[] };
const app = createApp(
  core,
  "http://localhost:3000",
  pino({ enabled: false }),
  {
    limit: 60,
    hit: async () => ({ allowed: true, count: 1 }),
    close: async () => {},
  },
  undefined,
  undefined,
  {
    limit: 2,
    hit: async (key) => {
      if (askLimit.down) throw new Error("valkey down");
      askLimit.keys.push(key);
      askLimit.hits++;
      return { allowed: askLimit.hits <= askLimit.limit, count: askLimit.hits };
    },
    close: async () => {},
  },
);
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
  it("reads the brief of the token workspace and offers no ask tool", async () => {
    vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
    vi.spyOn(core, "recordMcpCall").mockResolvedValue();
    const listed = await call("tools/list", {});
    const names = listed.result?.tools?.map((tool) => tool.name) ?? [];
    expect(names).toEqual(
      expect.arrayContaining(["brief.get", "suggestions.create"]),
    );
    expect(names.some((name) => name.startsWith("ask"))).toBe(false);
    const read = vi.spyOn(core, "getBrief").mockResolvedValue({} as never);
    const extra = await call("tools/call", {
      name: "brief.get",
      arguments: { workspaceId: other },
    });
    expect(extra.result?.isError || !!extra.error).toBe(true);
    expect(read).not.toHaveBeenCalled();
    await call("tools/call", { name: "brief.get", arguments: {} });
    expect(read).toHaveBeenCalledWith(principal, {
      scope: "workspace",
      workspaceId: id,
    });
  });
  it("forwards only well-formed proposals", async () => {
    vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
    vi.spyOn(core, "recordMcpCall").mockResolvedValue();
    const create = vi
      .spyOn(core, "createSuggestion")
      .mockResolvedValue({} as never);
    for (const args of [
      { taskId: other, kind: "split", payload: { subtasks: [] } },
      {
        taskId: other,
        kind: "split",
        payload: { startDate: "2026-10-20", durationDays: 2 },
      },
      {
        taskId: other,
        kind: "merge",
        payload: { startDate: "2026-10-20", durationDays: 2 },
      },
      {
        taskId: other,
        kind: "split",
        payload: {
          subtasks: Array.from({ length: 11 }, (_, i) => ({ title: `${i}` })),
        },
      },
    ]) {
      const bad = await call("tools/call", {
        name: "suggestions.create",
        arguments: args,
      });
      expect(bad.result?.isError || !!bad.error).toBe(true);
    }
    expect(create).not.toHaveBeenCalled();
    const good = {
      taskId: other,
      kind: "reschedule",
      payload: { startDate: "2026-10-20", durationDays: 2 },
    };
    await call("tools/call", { name: "suggestions.create", arguments: good });
    expect(create).toHaveBeenCalledWith(principal, good);
  });
});

describe("brief, Ask taff, suggestions and AI settings REST", () => {
  const send = (path: string, method: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  it("requires a session everywhere", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: null,
      headers: new Headers(),
    });
    for (const [path, method] of [
      ["/api/brief", "GET"],
      ["/api/ask", "POST"],
      [`/api/workspaces/${id}/suggestions`, "GET"],
      [`/api/suggestions/${id}/apply`, "POST"],
      [`/api/suggestions/${id}/undo`, "POST"],
      [`/api/workspaces/${id}/ai`, "PATCH"],
    ])
      expect(
        (await send(path, method, method === "GET" ? undefined : {})).status,
      ).toBe(401);
  });
  it("validates the brief scope", async () => {
    signedIn();
    const brief = vi.spyOn(core, "getBrief").mockResolvedValue({} as never);
    expect((await app.request("/api/brief")).status).toBe(200);
    expect(brief).toHaveBeenLastCalledWith(person, {}, { labels: true });
    expect(
      (await app.request(`/api/brief?scope=workspace&workspaceId=${other}`))
        .status,
    ).toBe(200);
    expect(brief).toHaveBeenLastCalledWith(
      person,
      { scope: "workspace", workspaceId: other },
      { labels: true },
    );
    for (const query of ["scope=workspace", "scope=team", "workspaceId=x"])
      expect((await app.request(`/api/brief?${query}`)).status).toBe(400);
    expect(brief).toHaveBeenCalledTimes(2);
  });
  it("rate-limits Ask per person and fails closed", async () => {
    signedIn();
    askLimit.hits = 0;
    askLimit.keys = [];
    askLimit.down = false;
    const ask = vi.spyOn(core, "ask").mockResolvedValue({
      intent: "unknown",
      items: [],
      text: null,
      source: "rules",
    });
    expect((await send("/api/ask", "POST", { question: "" })).status).toBe(400);
    expect(askLimit.hits).toBe(0);
    const body = { question: "What's at risk?", workspaceId: other };
    const first = await send("/api/ask", "POST", body);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("private, no-store");
    expect(ask).toHaveBeenCalledWith(person, body, { labels: true });
    expect((await send("/api/ask", "POST", body)).status).toBe(200);
    const limited = await send("/api/ask", "POST", body);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(ask).toHaveBeenCalledTimes(2);
    // The key is a hash of the user id, never the id itself.
    expect(askLimit.keys[0]).toMatch(/^ask:[0-9a-f]{64}$/);
    expect(askLimit.keys[0]).not.toContain(id);
    askLimit.down = true;
    expect((await send("/api/ask", "POST", body)).status).toBe(503);
    askLimit.down = false;
  });
  it("lists, applies and dismisses suggestions with versions", async () => {
    signedIn();
    const list = vi.spyOn(core, "listSuggestions").mockResolvedValue([]);
    await app.request(
      `/api/workspaces/${id}/suggestions?status=pending&taskId=${other}`,
    );
    expect(list).toHaveBeenCalledWith(person, id, {
      status: "pending",
      taskId: other,
    });
    expect(
      (await app.request(`/api/workspaces/${id}/suggestions?status=open`))
        .status,
    ).toBe(400);
    const apply = vi
      .spyOn(core, "applySuggestion")
      .mockRejectedValue(new CoreError("conflict", 409));
    expect(
      (await send(`/api/suggestions/${id}/apply`, "POST", {})).status,
    ).toBe(400);
    expect(
      (await send(`/api/suggestions/${id}/apply`, "POST", { version: 2 }))
        .status,
    ).toBe(409);
    expect(apply).toHaveBeenCalledWith(person, id, { version: 2 });
    const dismiss = vi
      .spyOn(core, "dismissSuggestion")
      .mockRejectedValue(new CoreError("forbidden", 403));
    expect(
      (await send(`/api/suggestions/${id}/dismiss`, "POST", { version: 1 }))
        .status,
    ).toBe(403);
    expect(dismiss).toHaveBeenCalledWith(person, id, { version: 1 });
    const undo = vi
      .spyOn(core, "undoSuggestion")
      .mockRejectedValue(new CoreError("conflict", 409));
    expect((await send(`/api/suggestions/${id}/undo`, "POST", {})).status).toBe(
      400,
    );
    expect(
      (await send(`/api/suggestions/${id}/undo`, "POST", { version: 2 }))
        .status,
    ).toBe(409);
    expect(undo).toHaveBeenCalledWith(person, id, { version: 2 });
    // Agents propose over MCP only; there is no REST create.
    expect((await send("/api/suggestions", "POST", {})).status).toBe(404);
  });
  it("reads and toggles the model path", async () => {
    signedIn();
    const read = vi
      .spyOn(core, "getAiSettings")
      .mockResolvedValue({ enabled: false, available: false });
    expect(
      await (await app.request(`/api/workspaces/${id}/ai`)).json(),
    ).toEqual({ enabled: false, available: false });
    expect(read).toHaveBeenCalledWith(person, id);
    const set = vi
      .spyOn(core, "setAiSettings")
      .mockRejectedValue(new CoreError("forbidden", 403));
    expect(
      (await send(`/api/workspaces/${id}/ai`, "PATCH", { enabled: "yes" }))
        .status,
    ).toBe(400);
    expect(
      (await send(`/api/workspaces/${id}/ai`, "PATCH", { enabled: true }))
        .status,
    ).toBe(403);
    expect(set).toHaveBeenCalledWith(person, id, { enabled: true });
  });
});

describe("mind map REST", () => {
  const send = (path: string, method: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  it("requires a session", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: null,
      headers: new Headers(),
    });
    const read = vi.spyOn(core, "getMindMap");
    expect((await app.request(`/api/workspaces/${id}/mind`)).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });
  it("reads the map and validates node input before core", async () => {
    signedIn();
    const read = vi.spyOn(core, "getMindMap").mockResolvedValue({} as never);
    await app.request(`/api/workspaces/${id}/mind?archived=include`);
    expect(read).toHaveBeenCalledWith(person, id, { archived: "include" });
    expect(
      (await app.request(`/api/workspaces/${id}/mind?archived=all`)).status,
    ).toBe(400);
    const create = vi
      .spyOn(core, "createMindNode")
      .mockResolvedValue({} as never);
    for (const body of [
      { title: "x", layer: 0, angle: 400 },
      { title: "x", layer: -1, angle: 0 },
      { title: "x", layer: 0, angle: 0, strength: 6 },
      { title: "x", layer: 0, angle: 0, note: "a".repeat(4001) },
      { title: "x", layer: 0, angle: 0, ai: true },
    ])
      expect(
        (await send(`/api/workspaces/${id}/mind/nodes`, "POST", body)).status,
      ).toBe(400);
    expect(create).not.toHaveBeenCalled();
    const good = { title: "Belonging", layer: 0, angle: 315, momentum: 1 };
    expect(
      (await send(`/api/workspaces/${id}/mind/nodes`, "POST", good)).status,
    ).toBe(201);
    expect(create).toHaveBeenCalledWith(person, id, good);
    const update = vi
      .spyOn(core, "updateMindNode")
      .mockRejectedValue(new CoreError("forbidden", 403));
    expect(
      (await send(`/api/mind/nodes/${id}`, "PATCH", { version: 1 })).status,
    ).toBe(400);
    expect(
      (
        await send(`/api/mind/nodes/${id}`, "PATCH", {
          version: 1,
          archived: true,
        })
      ).status,
    ).toBe(403);
    expect(update).toHaveBeenCalledWith(person, id, {
      version: 1,
      archived: true,
    });
  });
  it("routes edges, sources, links and the validation task", async () => {
    signedIn();
    const edge = vi
      .spyOn(core, "createMindEdge")
      .mockResolvedValue({} as never);
    expect(
      (
        await send(`/api/workspaces/${id}/mind/edges`, "POST", {
          fromNodeId: id,
          toNodeId: id,
        })
      ).status,
    ).toBe(400);
    await send(`/api/workspaces/${id}/mind/edges`, "POST", {
      fromNodeId: id,
      toNodeId: other,
      kind: "supports",
    });
    expect(edge).toHaveBeenCalledWith(person, id, {
      fromNodeId: id,
      toNodeId: other,
      kind: "supports",
    });
    const editEdge = vi
      .spyOn(core, "updateMindEdge")
      .mockResolvedValue({} as never);
    expect(
      (await send(`/api/mind/edges/${other}`, "PATCH", { kind: "supports" }))
        .status,
    ).toBe(400);
    expect(
      (
        await send(`/api/mind/edges/${other}`, "PATCH", {
          version: 1,
          kind: "linked",
        })
      ).status,
    ).toBe(400);
    await send(`/api/mind/edges/${other}`, "PATCH", {
      version: 2,
      kind: "contradicts",
    });
    expect(editEdge).toHaveBeenCalledOnce();
    expect(editEdge).toHaveBeenCalledWith(person, other, {
      version: 2,
      kind: "contradicts",
    });
    const remove = vi
      .spyOn(core, "removeMindEdge")
      .mockResolvedValue({} as never);
    await send(`/api/mind/edges/${other}`, "DELETE");
    expect(remove).toHaveBeenCalledWith(person, other);
    const source = vi
      .spyOn(core, "createMindSource")
      .mockResolvedValue({} as never);
    expect(
      (
        await send(`/api/workspaces/${id}/mind/sources`, "POST", {
          title: "x",
          url: "javascript:alert(1)",
        })
      ).status,
    ).toBe(400);
    expect(source).not.toHaveBeenCalled();
    const link = vi
      .spyOn(core, "linkMindSource")
      .mockResolvedValue({} as never);
    const unlink = vi
      .spyOn(core, "unlinkMindSource")
      .mockResolvedValue({} as never);
    expect(
      (await send(`/api/mind/nodes/${id}/sources/${other}`, "PUT")).status,
    ).toBe(201);
    await send(`/api/mind/nodes/${id}/sources/${other}`, "DELETE");
    expect(link).toHaveBeenCalledWith(person, id, other);
    expect(unlink).toHaveBeenCalledWith(person, id, other);
    const task = vi
      .spyOn(core, "createValidationTask")
      .mockResolvedValue({} as never);
    expect(
      (
        await send(`/api/mind/nodes/${id}/task`, "POST", {
          version: 1,
          dueDate: "2026-02-30",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(`/api/mind/nodes/${id}/task`, "POST", {
          version: 1,
          dueDate: "2026-10-20",
        })
      ).status,
    ).toBe(201);
    expect(task).toHaveBeenCalledWith(person, id, {
      version: 1,
      dueDate: "2026-10-20",
    });
  });
});
