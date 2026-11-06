import { createServer } from "node:http";
import { connect, type Socket } from "node:net";
import type { Page, Route } from "@playwright/test";

/** A real loopback upgrade stays pending until the test releases its gate. */
export async function createRealtimeHandshakeGate(
  apiUrl: string,
  pageOrigin: string,
  workspaceId: string,
) {
  const api = new URL(apiUrl);
  const page = new URL(pageOrigin);
  for (const url of [api, page]) {
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
      throw new Error("Realtime fixture requires loopback HTTP origins");
  }
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const requested = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  const sockets = new Set<Socket>();
  let closed = false;
  let closing: Promise<void> | undefined;
  const track = (socket: Socket) => {
    sockets.add(socket);
    socket.setTimeout(30_000, () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
  };
  const server = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  server.maxConnections = 8;
  server.headersTimeout = 5000;
  server.on("connection", track);
  server.on("upgrade", async (request, client, head) => {
    const url = new URL(request.url ?? "/", page);
    if (
      closed ||
      request.method !== "GET" ||
      url.origin !== page.origin ||
      url.pathname !== "/api/realtime" ||
      request.headers.origin !== page.origin
    ) {
      client.destroy();
      return;
    }
    if (url.searchParams.get("workspaceId") === workspaceId) arrived();
    await gate;
    if (closed || client.destroyed) return;
    const upstream = connect({
      host: api.hostname.replace(/^\[|\]$/g, ""),
      port: Number(api.port || 80),
    });
    track(upstream);
    client.once("error", () => upstream.destroy());
    upstream.once("error", () => client.destroy());
    client.once("close", () => upstream.destroy());
    upstream.once("close", () => client.destroy());
    upstream.once("connect", () => {
      // Raw headers preserve the browser's Cookie, Origin and WebSocket key.
      let headers = "";
      for (let index = 0; index < request.rawHeaders.length; index += 2)
        headers += `${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}\r\n`;
      upstream.write(
        `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers}\r\n`,
      );
      if (head.length) upstream.write(head);
      client.pipe(upstream).pipe(client);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, page.hostname === "[::1]" ? "::1" : "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Realtime fixture did not bind a port");
  return {
    host: `${page.hostname}:${address.port}`,
    port: address.port,
    requested,
    release,
    close() {
      return (closing ??= new Promise<void>((resolve, reject) => {
        closed = true;
        release();
        for (const socket of sockets) socket.destroy();
        server.close((error) => (error ? reject(error) : resolve()));
      }));
    },
  };
}

export async function delayRealtimeHandshake(page: Page, workspaceId: string) {
  const gate = await createRealtimeHandshakeGate(
    process.env.API_INTERNAL_URL!,
    process.env.AUTH_URL!,
    workspaceId,
  );
  const origin = new URL(process.env.AUTH_URL!).origin;
  const documentRoute = async (route: Route) => {
    const request = route.request();
    if (
      !request.isNavigationRequest() ||
      request.resourceType() !== "document" ||
      new URL(request.url()).origin !== origin
    ) {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    const headers = response.headers();
    const csp = headers["content-security-policy"];
    if (!csp?.includes("connect-src 'self'"))
      throw new Error("Expected the app's same-origin connection policy");
    // Allow only this test's loopback tunnel; preserve every other CSP directive.
    headers["content-security-policy"] = csp.replace(
      "connect-src 'self'",
      `connect-src 'self' ws://${gate.host}`,
    );
    await route.fulfill({ response, headers });
  };
  let script: Awaited<ReturnType<Page["addInitScript"]>> | undefined;
  const close = async () => {
    try {
      await script?.dispose();
      if (!page.isClosed()) await page.unroute("**/*", documentRoute);
    } finally {
      await gate.close();
    }
  };
  try {
    await page.context().grantPermissions(["local-network-access"], { origin });
    await page.route("**/*", documentRoute);
    script = await page.addInitScript(
      ({ host }) => {
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = class extends NativeWebSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            const destination = new URL(url, window.location.href);
            if (
              destination.pathname === "/api/realtime" &&
              destination.host === window.location.host
            ) {
              destination.host = host;
              super(destination.href, protocols);
            } else super(url, protocols);
          }
        };
      },
      { host: gate.host },
    );
    return { ...gate, close };
  } catch (error) {
    await close();
    throw error;
  }
}
