import { createCore } from "@taff/core";
import pino from "pino";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { createApp } from "./app";

const core = createCore({
  databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
  authUrl: "http://localhost:3000",
  authSecret: "context-test-secret-at-least-thirty-two-characters",
  tokenPepper: "context-test-pepper-sixteen",
});
const app = createApp(core, "http://localhost:3000", pino({ enabled: false }), {
  limit: 60,
  hit: async () => ({ allowed: true, count: 1 }),
  close: async () => {},
});
const id = "00000000-0000-4000-8000-000000000001";
const principal = {
  kind: "agent" as const,
  tokenId: id,
  memberId: id,
  workspaceId: id,
  scopes: ["tasks:read" as const],
};
afterEach(() => vi.restoreAllMocks());
afterAll(() => core.close());
async function call(method: string, params: unknown) {
  const response = await app.request("/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer context-test-token",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const raw = await response.text();
  return JSON.parse(
    response.headers.get("content-type")?.includes("event-stream")
      ? raw
          .split("\n")
          .find((line) => line.startsWith("data:"))!
          .slice(5)
      : raw,
  );
}
it("advertises read-only context and binds it to the authenticated token; rejects workspace overrides", async () => {
  vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
  vi.spyOn(core, "recordMcpCall").mockResolvedValue();
  const read = vi.spyOn(core, "getContext").mockResolvedValue({
    now: "2026-10-16T08:00:00Z",
    workspace: {
      id,
      name: "Verification",
      key: "WS",
      timeZone: "Asia/Shanghai",
      timeZoneSource: "user_profile",
    },
    memberId: id,
    ownerId: id,
    members: [],
    projects: [],
  });
  const listed = await call("tools/list", {});
  expect(
    listed.result.tools.find(
      (tool: { name: string }) => tool.name === "context.get",
    ).annotations,
  ).toMatchObject({ readOnlyHint: true, destructiveHint: false });
  const result = await call("tools/call", {
    name: "context.get",
    arguments: {},
  });
  expect(result.result.structuredContent.result.workspace.timeZone).toBe(
    "Asia/Shanghai",
  );
  expect(read).toHaveBeenCalledExactlyOnceWith(principal, id);
  const rejected = await call("tools/call", {
    name: "context.get",
    arguments: { workspaceId: id },
  });
  expect(rejected.error || rejected.result?.isError).toBeTruthy();
  expect(read).toHaveBeenCalledTimes(1);
});
