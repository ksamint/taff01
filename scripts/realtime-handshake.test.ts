import { createHash } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { connect, type Socket } from "node:net";
import { expect, test } from "vitest";
import { createRealtimeHandshakeGate } from "../e2e/support/realtime-handshake";

const origin = "http://localhost:3000";
async function upstream() {
  const requests: IncomingMessage[] = [];
  const sockets = new Set<Socket>();
  const server = createServer();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket) => {
    requests.push(request);
    const accept = createHash("sha1")
      .update(
        `${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`,
      )
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Fixture not listening");
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
function requestUpgrade(port: number) {
  const socket = connect(port, "127.0.0.1");
  const response = new Promise<string>((resolve, reject) => {
    let body = "";
    socket.on("data", (data) => {
      body += data.toString();
      if (body.includes("\r\n\r\n")) resolve(body);
    });
    socket.on("error", reject);
  });
  socket.write(
    `GET /api/realtime?workspaceId=workspace HTTP/1.1\r\nHost: localhost:${port}\r\nOrigin: ${origin}\r\nCookie: fixture-cookie=local\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
  );
  return { socket, response };
}
test("realtime gate refuses non-loopback upstreams", async () => {
  await expect(
    createRealtimeHandshakeGate("http://example.com", origin, "workspace"),
  ).rejects.toThrow("loopback HTTP");
});
test("realtime gate delays the real upgrade and preserves authentication headers", async () => {
  const api = await upstream();
  const gate = await createRealtimeHandshakeGate(api.url, origin, "workspace");
  const request = requestUpgrade(gate.port);
  try {
    await gate.requested;
    expect(api.requests).toHaveLength(0);
    gate.release();
    expect(await request.response).toContain("101 Switching Protocols");
    expect(api.requests).toHaveLength(1);
    expect(api.requests[0].headers.origin).toBe(origin);
    expect(api.requests[0].headers.cookie).toBe("fixture-cookie=local");
    expect(api.requests[0].url).toBe("/api/realtime?workspaceId=workspace");
  } finally {
    request.socket.destroy();
    await gate.close();
    await api.close();
  }
});
test("closing a held gate destroys sockets without connecting upstream", async () => {
  const api = await upstream();
  const gate = await createRealtimeHandshakeGate(api.url, origin, "workspace");
  const request = requestUpgrade(gate.port);
  void request.response.catch(() => {});
  try {
    await gate.requested;
    const closed = new Promise<void>((resolve) =>
      request.socket.once("close", () => resolve()),
    );
    await gate.close();
    await closed;
    await gate.close();
    gate.release();
    expect(api.requests).toHaveLength(0);
    await expect(fetch(`http://127.0.0.1:${gate.port}`)).rejects.toThrow();
  } finally {
    request.socket.destroy();
    await gate.close();
    await api.close();
  }
});
