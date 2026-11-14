import { getEventListeners } from "node:events";
import { readFileSync } from "node:fs";
import {
  McpServer,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import { afterEach, expect, it, vi } from "vitest";
import { graphImageFixture } from "../../../packages/schemas/src/graph-image.fixture";
import { createApp } from "./app";

/**
 * Abort listeners the adapter could leak. Node 26.13 also lists its own
 * `abortSignalFollowers` link from a cloned Request's signal to its parent;
 * Node owns and releases that one, so it is not an adapter leak.
 */
const abortListeners = (signal: AbortSignal) =>
  getEventListeners(signal, "abort").filter(
    (listener) => listener.name !== "abortSignalFollowers",
  );

type Core = Parameters<typeof createApp>[0];
type Entry = Parameters<Core["recordMcpCall"]>[0];
const id = "00000000-0000-4000-8000-000000000001";
const principal = {
  kind: "agent" as const,
  tokenId: id,
  memberId: id,
  workspaceId: id,
  scopes: ["tasks:read" as const, "summaries:read" as const],
};
const png = readFileSync(
  new URL(
    "../../../backend/crates/taff-render/tests/fixtures/graph-mind-en.png",
    import.meta.url,
  ),
);
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup() {
  const logs: Entry[] = [];
  const requests: Request[] = [];
  const authenticate = vi.fn(async () => principal);
  const entered = deferred<void>();
  const render = deferred<Response>();
  const core = {
    oauthMetadata: () => ({
      resourceMetadataUrl:
        "http://mock.test/.well-known/oauth-protected-resource",
      protectedResource: {},
      authorizationServer: {},
    }),
    authenticateAgentToken: authenticate,
    resolveAgentWorkspace: async () => principal,
    exportViewImageInput: async () => ({
      ...graphImageFixture("mind", "en"),
      fileName: "mock.png",
    }),
    recordMcpCall: async (entry: Entry) => {
      logs.push({ ...entry });
    },
  } as unknown as Core;
  const limiter = {
    limit: 10,
    hit: async () => ({ allowed: true, count: 1 }),
    close: async () => {},
  };
  const app = createApp(
    core,
    "http://mock.test",
    { error: vi.fn() } as unknown as Parameters<typeof createApp>[2],
    limiter,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      exportRateLimiter: limiter,
      renderUrl: "http://renderer.invalid",
      renderFetch: async () => {
        entered.resolve();
        return render.promise;
      },
    },
  );
  const close = vi.spyOn(McpServer.prototype, "close");
  const transportClose = vi.spyOn(
    WebStandardStreamableHTTPServerTransport.prototype,
    "close",
  );
  const handle = vi.spyOn(
    WebStandardStreamableHTTPServerTransport.prototype,
    "handleRequest",
  );
  const call = async (
    modern = false,
    signal?: AbortSignal,
    body: unknown = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "views.image",
        arguments: { view: "mind", locale: "en" },
      },
    },
  ) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: "Bearer mock-only",
      "MCP-Protocol-Version": modern ? "2026-07-28" : "2025-11-25",
    };
    if (modern) {
      headers["Mcp-Method"] = "tools/call";
      headers["Mcp-Name"] = "views.image";
      const request = body as { params: Record<string, unknown> };
      request.params._meta = {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientInfo": {
          name: "mock-test",
          version: "1",
        },
        "io.modelcontextprotocol/clientCapabilities": {},
      };
    }
    const request = new Request("http://mock.test/mcp", {
      method: "POST",
      headers,
      signal,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    requests.push(request);
    return app.request(request);
  };
  return {
    app,
    call,
    logs,
    entered,
    render,
    close,
    transportClose,
    handle,
    requests,
    authenticate,
  };
}

for (const modern of [false, true])
  for (const fails of [false, true])
    it(`logs delayed ${modern ? "modern" : "legacy"} renderer ${fails ? "failure" : "success"} after the terminal result`, async () => {
      const f = setup();
      let returned = false;
      const pending = f.call(modern).then((response) => {
        returned = true;
        return response;
      });
      await f.entered.promise;
      await tick();
      const premature = { returned, logs: [...f.logs] };
      if (fails) f.render.reject(new Error("controlled renderer failure"));
      else
        f.render.resolve(
          new Response(png, { headers: { "Content-Type": "image/png" } }),
        );
      const response = await pending;
      const text = await response.text();
      const result = JSON.parse(
        text.match(/^data: (.*)$/m)?.[1] ?? text,
      ).result;
      expect(premature).toEqual({ returned: false, logs: [] });
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      if (fails)
        expect(result).toMatchObject({
          isError: true,
          content: [{ type: "text", text: "render_failed" }],
        });
      else expect(Buffer.from(result.content[1].data, "base64")).toEqual(png);
      expect(f.logs).toHaveLength(1);
      expect(f.logs[0]).toMatchObject({
        tokenId: id,
        workspaceId: id,
        tool: "views.image",
        status: fails ? "error" : "ok",
      });
      if (!modern) {
        expect(f.close).toHaveBeenCalledTimes(1);
        expect(f.transportClose).toHaveBeenCalledTimes(1);
        expect(abortListeners(f.handle.mock.calls[0][0].signal)).toEqual([]);
      }
    });

for (const when of ["already", "connecting", "rendering"] as const)
  it(`settles a legacy abort while ${when}, closes once and observes later rejection`, async () => {
    const f = setup();
    const controller = new AbortController();
    const connected = deferred<void>();
    const releaseConnect = deferred<void>();
    if (when === "already") controller.abort();
    if (when === "connecting") {
      const connect = McpServer.prototype.connect;
      vi.spyOn(McpServer.prototype, "connect").mockImplementationOnce(
        async function (this: McpServer, transport) {
          await connect.call(this, transport);
          connected.resolve();
          await releaseConnect.promise;
        },
      );
    }
    const pending = f.call(false, controller.signal);
    if (when === "connecting") {
      await connected.promise;
      controller.abort();
    }
    if (when === "rendering") {
      await f.entered.promise;
      controller.abort();
    }
    const response = await pending;
    expect(response.status).toBe(499);
    expect(f.logs).toHaveLength(1);
    expect(f.logs[0].status).toBe("error");
    expect(abortListeners(f.requests[0].signal)).toEqual([]);
    expect(f.close).toHaveBeenCalledTimes(when === "already" ? 0 : 1);
    expect(f.transportClose).toHaveBeenCalledTimes(when === "already" ? 0 : 1);
    if (when !== "rendering") expect(f.handle).not.toHaveBeenCalled();
    else {
      expect(abortListeners(f.handle.mock.calls[0][0].signal)).toEqual([]);
      f.render.reject(new Error("late renderer failure after cancellation"));
    }
    releaseConnect.resolve();
    await tick();
    expect(f.logs).toHaveLength(1);
    expect(f.close).toHaveBeenCalledTimes(when === "already" ? 0 : 1);
    expect(f.transportClose).toHaveBeenCalledTimes(when === "already" ? 0 : 1);
  });

it("cleans up both resources if legacy connection fails before attaching the transport", async () => {
  const f = setup();
  const removed = vi.spyOn(AbortSignal.prototype, "removeEventListener");
  vi.spyOn(McpServer.prototype, "connect").mockRejectedValueOnce(
    new Error("connect failed"),
  );
  const response = await f.call();
  expect(response.status).toBe(500);
  expect(await response.json()).toMatchObject({
    id: 1,
    error: { code: -32603 },
  });
  expect(f.logs).toHaveLength(1);
  expect(f.logs[0].status).toBe("error");
  // Hono clones the input Request; inspect the signal whose bridge listener
  // was removed, rather than its parent signal retained by the native clone.
  const cleanup = removed.mock.calls.findIndex(([event]) => event === "abort");
  expect(cleanup).toBeGreaterThanOrEqual(0);
  const signal = removed.mock.contexts[cleanup];
  if (!(signal instanceof AbortSignal))
    throw new Error("missing bridge signal");
  expect(abortListeners(signal)).toEqual([]);
  expect(f.close).toHaveBeenCalledTimes(1);
  expect(f.transportClose).toHaveBeenCalledTimes(1);
  expect(f.handle).not.toHaveBeenCalled();
});

it.each([
  [
    "initialize",
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "legacy", version: "1" },
      },
    },
    200,
    "ok",
  ],
  [
    "initialized notification",
    { jsonrpc: "2.0", method: "notifications/initialized" },
    202,
    "ok",
  ],
  ["malformed body", "{", 400, "error"],
  [
    "unknown method",
    { jsonrpc: "2.0", id: 1, method: "missing/method" },
    200,
    "error",
  ],
  [
    "unknown tool",
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "missing.tool", arguments: {} },
    },
    200,
    "error",
  ],
  [
    "invalid tool arguments",
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "views.image",
        arguments: { view: "mind", channel: "web" },
      },
    },
    200,
    "error",
  ],
] as const)(
  "preserves legacy %s and its final log status",
  async (_label, body, http, status) => {
    const f = setup();
    const response = await f.call(false, undefined, body);
    expect(response.status).toBe(http);
    if (http === 200)
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
    expect(f.logs).toHaveLength(1);
    expect(f.logs[0].status).toBe(status);
    expect(f.close).toHaveBeenCalledTimes(1);
    expect(f.transportClose).toHaveBeenCalledTimes(1);
  },
);

it("enforces the app's one MiB body limit before authentication, parsing or legacy dispatch", async () => {
  const f = setup();
  const response = await f.call(false, undefined, {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "views.image",
      arguments: { padding: "x".repeat(1_048_576) },
    },
  });
  expect(response.status).toBe(413);
  expect(f.authenticate).not.toHaveBeenCalled();
  expect(f.logs).toEqual([]);
  expect(f.handle).not.toHaveBeenCalled();
  expect(f.close).not.toHaveBeenCalled();
});
