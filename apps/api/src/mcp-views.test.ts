import { McpServer } from "@modelcontextprotocol/server";
import { CoreError, createCore } from "@taff/core";
import { mcpViewsImageArgs } from "@taff/schemas";
import { afterEach, expect, it, vi } from "vitest";
import { type CallState, createMcpServer } from "./mcp";

afterEach(() => vi.restoreAllMocks());
it("accepts optional export arguments and refuses unknown authority fields", () => {
  expect(mcpViewsImageArgs.parse({})).toEqual({});
  expect(mcpViewsImageArgs.safeParse({ locale: "zh-HK" }).success).toBe(true);
  expect(mcpViewsImageArgs.safeParse({ channel: "web" }).success).toBe(false);
  expect(mcpViewsImageArgs.safeParse({ locale: "invalid" }).success).toBe(
    false,
  );
});
it("resolves each image call, shares member quota across tokens and reports renderer errors", async () => {
  const handlers = new Map<
    string,
    (args: object) => Promise<{ isError?: boolean; content: unknown[] }>
  >();
  vi.spyOn(McpServer.prototype, "registerTool").mockImplementation(
    (name, _config, callback) => {
      handlers.set(name, callback as never);
      return {} as never;
    },
  );
  const core = createCore({
    databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
    authUrl: "http://localhost:3000",
    authSecret: "test-only-secret-with-at-least-32-characters",
    tokenPepper: "test-only-pepper-with-16-characters",
  });
  const p = {
    kind: "agent" as const,
    tokenId: "one",
    memberId: "agent",
    workspaceId: "home",
    scopes: ["tasks:read" as const, "summaries:read" as const],
  };
  const resolve = vi.spyOn(core, "resolveAgentWorkspace").mockResolvedValue(p);
  const input = vi.spyOn(core, "exportViewImageInput").mockResolvedValue({
    fileName: "taff-测试.png",
    contentHash: "hash",
    layout: {},
    watermark: {},
  } as never);
  const hit = vi.fn(async () => ({ allowed: true, count: 1 }));
  const renderFetch = vi.fn<typeof fetch>().mockImplementation(
    async () =>
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "Content-Type": "image/png" },
      }),
  );
  const state: CallState = {};
  const options = {
    exportRateLimiter: { limit: 10, hit, close: async () => {} },
    renderUrl: "http://render.test",
    renderFetch,
  };
  const server = createMcpServer(core, p, state, undefined, options);
  try {
    const call = handlers.get("views.image")!;
    expect(await call({})).toMatchObject({
      content: [
        { type: "text", text: expect.stringContaining("测试") },
        { type: "image", mimeType: "image/png" },
      ],
    });
    expect(input).toHaveBeenCalledWith(p, "home", {}, "mcp");
    resolve.mockResolvedValue({ ...p, tokenId: "two" });
    await call({});
    expect(hit.mock.calls[0]).toEqual(hit.mock.calls[1]);
    expect(resolve).toHaveBeenCalledTimes(2);
    await call({
      view: "timeline",
      projectId: "00000000-0000-4000-8000-000000000001",
      criticalPath: "hide",
    });
    expect(String(renderFetch.mock.calls[2][0])).toBe(
      "http://render.test/render/timeline",
    );
    expect(input).toHaveBeenLastCalledWith(
      { ...p, tokenId: "two" },
      "home",
      {
        view: "timeline",
        projectId: "00000000-0000-4000-8000-000000000001",
        criticalPath: "hide",
      },
      "mcp",
    );
    expect(hit.mock.calls[2]).toEqual(hit.mock.calls[0]);
    await call({
      view: "calendar",
      calendarMode: "week",
      visibleDate: "2026-03-08",
    });
    expect(String(renderFetch.mock.calls[3][0])).toBe(
      "http://render.test/render/calendar",
    );
    expect(input).toHaveBeenLastCalledWith(
      { ...p, tokenId: "two" },
      "home",
      { view: "calendar", calendarMode: "week", visibleDate: "2026-03-08" },
      "mcp",
    );
    expect(hit.mock.calls[3]).toEqual(hit.mock.calls[0]);
    for (const query of [
      { view: "mind", archived: "include" },
      {
        view: "relations",
        scope: "workspace",
        layout: "force",
        layers: ["org"],
        forceSeed: 7,
      },
    ]) {
      await call(query);
      expect(String(renderFetch.mock.lastCall?.[0])).toBe(
        "http://render.test/render/graph",
      );
      expect(input).toHaveBeenLastCalledWith(
        { ...p, tokenId: "two" },
        "home",
        query,
        "mcp",
      );
      expect(hit.mock.lastCall).toEqual(hit.mock.calls[0]);
    }
    renderFetch.mockRejectedValue(new Error("renderer down"));
    expect(await call({})).toMatchObject({
      isError: true,
      content: [{ text: "render_failed" }],
    });
    expect(state.failed).toBe("error");
    hit.mockRejectedValue(new Error("Valkey down"));
    expect(await call({})).toMatchObject({
      isError: true,
      content: [{ text: "internal_error" }],
    });
    resolve.mockRejectedValue(new CoreError("forbidden", 403));
    expect(await call({})).toMatchObject({
      isError: true,
      content: [{ text: "forbidden" }],
    });
    expect(state.failed).toBe("denied");
  } finally {
    await server.close();
    await core.close();
  }
});
