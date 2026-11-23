import { once } from "node:events";
import { createServer } from "node:http";
import { expect, test } from "vitest";
import { createApp } from "../../apps/api/src/app";
import { createObserver, type Observation } from "./capture.mts";
import { differences, normalize, replay } from "./compare.mts";
import { mcpProtocol, mcpTools, modernCatalogRequest } from "./wire.mts";

test("compares sorted keys and precise offset instants while keeping array order", () => {
  expect(normalize({ x: 2, a: "2026-11-24T09:00:00.0001230+08:00" })).toEqual({
    a: "2026-11-24T01:00:00.000123Z",
    x: 2,
  });
  expect(
    differences(
      { data: [{ updatedAt: "2026-11-24T01:00:00.000123Z" }] },
      { data: [{ updatedAt: "2026-11-24T09:00:00.000124+08:00" }] },
    ),
  ).toEqual(["/data/0/updatedAt"]);
  expect(differences({ a: [1, 2] }, { a: [2, 1] })).toEqual(["/a/0", "/a/1"]);
});

test("records metadata for credential and stateful traffic without retaining any raw inputs", async () => {
  const observed: Observation[] = [];
  const capture = createObserver((entry) => observed.push(entry));
  const marker = "synthetic-value-which-cannot-be-recorded";
  const response = Response.json(
    { token: marker },
    { headers: { "Set-Cookie": `cookie=${marker}` } },
  );
  await capture(
    new Request("http://localhost/api/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `better-auth.session_token=${marker}`,
      },
      body: JSON.stringify({ password: marker }),
    }),
  )!("/api/oauth/token", response);
  await capture(new Request(`http://localhost/api/health?token=${marker}`))!(
    "/api/health",
    response,
  );
  const tool = [...mcpTools][0]!;
  await capture(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${marker}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: marker,
        method: "tools/call",
        params: { name: tool, arguments: { secret: marker } },
      }),
    }),
  )!(undefined, response);
  expect(observed).toMatchObject([
    {
      route: "POST /api/oauth/token",
      skip: "unmapped REST fixture or request",
    },
    { route: "GET /api/health", skip: "unmapped REST fixture or request" },
    {
      route: "POST /mcp",
      mcp: { method: "tools/call", tool },
      skip: "unmapped MCP fixture or protocol",
    },
  ]);
  expect(JSON.stringify(observed)).not.toContain(marker);
  expect(
    capture(new Request("https://taff.example/api/health")),
  ).toBeUndefined();
});

test("captures only allowed catalog fields and normalizes the RPC request ID", async () => {
  const observed: Observation[] = [];
  const capture = createObserver((entry) => observed.push(entry));
  const tool = [...mcpTools][0]!;
  await capture(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer synthetic-agent-token",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": mcpProtocol,
        "Mcp-Method": "tools/list",
      },
      body: JSON.stringify({ id: "synthetic-id", method: "tools/list" }),
    }),
  )!(
    undefined,
    Response.json({
      jsonrpc: "2.0",
      id: "synthetic-id",
      result: {
        tools: [
          {
            name: tool,
            description: "not retained",
            annotations: { readOnlyHint: true },
          },
        ],
      },
    }),
  );
  expect(observed).toEqual([
    {
      version: 1,
      route: "POST /mcp",
      mcp: { method: "tools/list" },
      status: 200,
      recipe: "mcpCatalog",
      body: {
        jsonrpc: "2.0",
        id: "{rpc-id}",
        result: {
          tools: [{ name: tool, annotations: { readOnlyHint: true } }],
        },
      },
    },
  ]);
});

test("replays real Node Hono routes with no diff, then reports exactly the planted field", async () => {
  const observed: Observation[] = [];
  const server = createServer(async (req, res) => {
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers)) {
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      }
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const response = await app.request(new URL(req.url!, base), {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks).toString() : undefined,
      });
      res.statusCode = response.status;
      for (const [name, value] of response.headers) res.setHeader(name, value);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      res.writeHead(500).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("loopback address expected");
  const base = `http://127.0.0.1:${address.port}`;
  const resourceMetadataUrl = `${base}/.well-known/oauth-protected-resource/mcp`;
  let smsEnabled = false;
  const id = "00000000-0000-4000-8000-000000000001";
  const actor = {
    kind: "agent",
    tokenId: id,
    memberId: id,
    workspaceId: id,
    scopes: [],
  };
  const core = {
    getAuthMethods: () => ({ smsEnabled }),
    authenticateAgentToken: async () => actor,
    recordMcpCall: async () => {},
    oauthMetadata: () => ({
      resourceMetadataUrl,
      authorizationServer: {
        issuer: base,
        code_challenge_methods_supported: ["S256"],
      },
      protectedResource: {
        resource: `${base}/mcp`,
        authorization_servers: [base],
      },
    }),
  } as unknown as Parameters<typeof createApp>[0];
  const limiter = {
    limit: 10,
    hit: async () => ({ allowed: true, count: 1 }),
    close: async () => {},
  } satisfies Parameters<typeof createApp>[3];
  const runtime = globalThis as typeof globalThis & {
    taffReplayObserve?: ReturnType<typeof createObserver>;
  };
  const previous = runtime.taffReplayObserve;
  runtime.taffReplayObserve = createObserver((entry) => observed.push(entry));
  const app = createApp(
    core,
    base,
    {} as Parameters<typeof createApp>[2],
    limiter,
  );
  try {
    for (const path of [
      "/api/health",
      "/api/auth/methods",
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource",
    ]) {
      const result = await fetch(base + path);
      expect(result.status).toBe(200);
      await result.arrayBuffer();
    }
    const discovery = await fetch(base + "/mcp", {
      method: "POST",
      headers: {
        Authorization: "Bearer fixture-only-token",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": mcpProtocol,
        "Mcp-Method": "tools/list",
      },
      body: JSON.stringify({ ...modernCatalogRequest(), id: 92 }),
    });
    expect(discovery.status).toBe(200);
    await discovery.arrayBuffer();
    const baseline = observed.slice();
    expect(baseline).toHaveLength(5);
    const credentials = { bearer: "different-fixture-only-token" };
    const equal = await replay(baseline, base, credentials);
    expect(equal.compared).toBe(5);
    expect(equal.coverage.routes.replayed).toBe(4);
    expect(equal.coverage.mcpCatalog).toBe(1);
    expect(equal.mismatches).toEqual([]);
    smsEnabled = true;
    const changed = await replay(baseline, base, credentials);
    expect(changed.mismatches).toEqual([
      {
        route: "GET /api/auth/methods",
        recipe: "authMethods",
        differences: ["/body/smsEnabled"],
      },
    ]);
  } finally {
    if (previous) runtime.taffReplayObserve = previous;
    else delete runtime.taffReplayObserve;
    await new Promise<void>((done) => server.close(() => done()));
  }
});
