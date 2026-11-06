import { McpServer } from "@modelcontextprotocol/server";
import { CoreError, createCore } from "@taff/core";
import { afterEach, expect, it, vi } from "vitest";
import { createMcpServer } from "./mcp";

afterEach(() => vi.restoreAllMocks());
it("summary tools resolve current workspace grants and emit native text/image blocks", async () => {
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
    tokenId: "token",
    memberId: "home-agent",
    workspaceId: "home",
    scopes: ["summaries:read" as const],
  };
  const resolve = vi
    .spyOn(core, "resolveAgentWorkspace")
    .mockImplementation(async (_p, id = "home") => {
      if (id === "revoked") throw new CoreError("forbidden", 403);
      return { ...p, workspaceId: id, memberId: `${id}-agent` };
    });
  const list = vi
    .spyOn(core, "listDailySummaries")
    .mockResolvedValue({ items: [], truncated: false });
  vi.spyOn(core, "getSummaryRender").mockImplementation(
    async (_p, _id, format) =>
      ({
        format,
        body: format === "txt" ? "Watermarked report" : null,
        data: format === "png" ? "cG5n" : null,
      }) as never,
  );
  vi.spyOn(core, "getDailySummary").mockResolvedValue({
    id: "summary",
  } as never);
  const server = createMcpServer(core, p, {});
  try {
    await handlers.get("summaries.list")!({ workspaceId: "org" });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "org", memberId: "org-agent" }),
      "org",
      {},
    );
    expect(
      await handlers.get("summaries.get")!({
        summaryId: "summary",
        format: "txt",
      }),
    ).toEqual({ content: [{ type: "text", text: "Watermarked report" }] });
    expect(
      await handlers.get("summaries.image")!({ summaryId: "summary" }),
    ).toEqual({
      content: [{ type: "image", mimeType: "image/png", data: "cG5n" }],
    });
    expect(
      await handlers.get("summaries.image")!({
        summaryId: "summary",
        workspaceId: "revoked",
      }),
    ).toMatchObject({
      isError: true,
      content: [{ type: "text", text: "forbidden" }],
    });
    expect(resolve).toHaveBeenCalledWith(p, undefined);
  } finally {
    await server.close();
    await core.close();
  }
});
