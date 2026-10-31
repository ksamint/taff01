import { CoreError, createCore } from "@taff/core";
import pino from "pino";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import apiPackage from "../package.json";
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
it("advertises read-only context and binds it to the authenticated token; rejects unauthorized workspaces", async () => {
  vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
  vi.spyOn(core, "resolveAgentWorkspace").mockImplementation(
    async (_actor, target) => {
      if (target && target !== id) throw new CoreError("forbidden", 403);
      return principal;
    },
  );
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
    arguments: { workspaceId: "00000000-0000-4000-8000-000000000002" },
  });
  expect(rejected.error || rejected.result?.isError).toBeTruthy();
  expect(read).toHaveBeenCalledTimes(1);
});

it("advertises the API package version during MCP initialization", async () => {
  vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
  vi.spyOn(core, "resolveAgentWorkspace").mockResolvedValue(principal);
  vi.spyOn(core, "recordMcpCall").mockResolvedValue();
  const response = await call("initialize", {
    protocolVersion: "2026-07-28",
    capabilities: {},
    clientInfo: { name: "version-regression", version: "0.0.0" },
  });
  expect(response.result.serverInfo).toMatchObject({
    name: "taff",
    version: apiPackage.version,
  });
});

it("annotates every tool: reads are read-only, additions and updates are marked", async () => {
  vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
  vi.spyOn(core, "resolveAgentWorkspace").mockResolvedValue(principal);
  vi.spyOn(core, "recordMcpCall").mockResolvedValue();
  const additive = [
    "dependencies.add",
    "files.attach",
    "grants.request",
    "runs.event",
    "runs.start",
    "suggestions.create",
    "tasks.comments.add",
    "tasks.create",
  ];
  const update = [
    "calendar.schedule",
    "calendar.set",
    "dependencies.remove",
    "inbox.request_review",
    "runs.control",
    "runs.submit",
    "tasks.edit",
    "tasks.plan",
    "tasks.update",
  ];
  const listed: {
    name: string;
    annotations?: Record<string, boolean>;
  }[] = (await call("tools/list", {})).result.tools;
  expect(listed).toHaveLength(34);
  for (const tool of listed) {
    const expected = additive.includes(tool.name)
      ? { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
      : update.includes(tool.name)
        ? { readOnlyHint: false, destructiveHint: true, idempotentHint: true }
        : { readOnlyHint: true, destructiveHint: false, idempotentHint: true };
    expect(tool.annotations, tool.name).toEqual({
      ...expected,
      openWorldHint: false,
    });
  }
  expect(listed.filter((tool) => tool.annotations?.readOnlyHint).length).toBe(
    34 - additive.length - update.length,
  );
});

it("project MCP changes only prepare validated proposals; they never call native project mutations", async () => {
  vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
  vi.spyOn(core, "resolveAgentWorkspace").mockResolvedValue(principal);
  vi.spyOn(core, "recordMcpCall").mockResolvedValue();
  const prepare = vi.spyOn(core, "prepareProjectOperation").mockResolvedValue({
    requires_confirmation: true,
    tool: "projects.create",
    arguments: { name: "Confirmed" },
    expected_version: null,
  });
  const create = vi.spyOn(core, "createProject");
  const edit = vi.spyOn(core, "updateProject");
  const result = await call("tools/call", {
    name: "projects.create",
    arguments: { name: "Confirmed" },
  });
  expect(result.result.structuredContent.result).toMatchObject({
    requires_confirmation: true,
    expected_version: null,
  });
  expect(prepare).toHaveBeenCalledExactlyOnceWith(
    principal,
    "projects.create",
    { name: "Confirmed" },
  );
  expect(create).not.toHaveBeenCalled();
  expect(edit).not.toHaveBeenCalled();
  const invalid = await call("tools/call", {
    name: "projects.edit",
    arguments: { projectId: id, version: 1, deliveryProgress: 101 },
  });
  expect(invalid.error || invalid.result?.isError).toBeTruthy();
  expect(prepare).toHaveBeenCalledTimes(1);
});
