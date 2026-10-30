import { McpServer } from "@modelcontextprotocol/server";
import { CoreError, createCore } from "@taff/core";
import { afterEach, expect, it, vi } from "vitest";
import { createMcpServer } from "./mcp";

afterEach(() => vi.restoreAllMocks());
it("resolves concurrent workspace calls independently and defaults omitted selection", async () => {
  const handlers = new Map<string, (args: object) => Promise<unknown>>();
  vi.spyOn(McpServer.prototype, "registerTool").mockImplementation(
    (name, _config, callback) => {
      handlers.set(name, callback as (args: object) => Promise<unknown>);
      return {} as never;
    },
  );
  const core = createCore({
    databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
    authUrl: "http://localhost:3000",
    authSecret: "test-only-secret-with-at-least-32-characters",
    tokenPepper: "test-only-pepper-with-16-characters",
  });
  const principal = {
    kind: "agent" as const,
    tokenId: "token",
    memberId: "default-agent",
    workspaceId: "default",
    scopes: ["tasks:read" as const],
  };
  const resolve = vi
    .spyOn(core, "resolveAgentWorkspace")
    .mockImplementation(async (_actor, workspaceId = "default") => {
      if (workspaceId === "personal") throw new CoreError("forbidden", 403);
      await Promise.resolve();
      return { ...principal, workspaceId, memberId: `${workspaceId}-agent` };
    });
  const read = vi.spyOn(core, "listTasks").mockResolvedValue([]);
  const server = createMcpServer(core, principal, {});
  try {
    const call = handlers.get("tasks.list")!;
    await Promise.all([
      call({ workspaceId: "apuch" }),
      call({ workspaceId: "table" }),
      call({}),
    ]);
    expect(
      read.mock.calls.map(([actor, workspaceId]) => [
        actor.kind === "agent" && actor.memberId,
        workspaceId,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["apuch-agent", "apuch"],
        ["table-agent", "table"],
        ["default-agent", "default"],
      ]),
    );
    expect(resolve).toHaveBeenCalledWith(principal, undefined);
    const denied = await call({ workspaceId: "personal" });
    expect(denied).toMatchObject({ isError: true });
    expect(read).toHaveBeenCalledTimes(3);
    expect(principal.workspaceId).toBe("default");
  } finally {
    await server.close();
    await core.close();
  }
});
