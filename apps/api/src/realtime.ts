import { upgradeWebSocket, type WebSocketLike } from "@hono/node-server";
import { type createCore, userPrincipal } from "@taff/core";
import type { ChangeEvent } from "@taff/schemas";
import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import type { WebSocket } from "ws";
import { WebSocketServer } from "ws";

type Client = {
  socket: WSContext<WebSocketLike>;
  raw: WebSocket | undefined;
  workspaceId: string;
  userId: string;
  sessionId: string;
  admin: boolean;
  ready: boolean;
  alive: boolean;
  pending?: ChangeEvent;
  expiry: ReturnType<typeof setTimeout>;
};

/** Sockets one user may hold at once; the oldest closes when exceeded. */
const MAX_SOCKETS_PER_USER = 10;
/** A client that cannot drain this much is gone; keep memory for the rest. */
const MAX_BUFFERED_BYTES = 1_048_576;
const HEARTBEAT_MS = 30_000;
const MAX_TIMER_MS = 2_147_483_647;

export async function createRealtime(core: ReturnType<typeof createCore>) {
  const server = new WebSocketServer({
    noServer: true,
    maxPayload: 1024,
    perMessageDeflate: false,
  });
  const clients = new Set<Client>();
  function closeAll() {
    for (const client of clients) client.socket.close(1012);
  }
  const unsubscribe = await core.subscribeChanges((event: ChangeEvent) => {
    const authEvent = /^(sessions|accounts|verifications)\./.test(event.action);
    const membershipChange = /^(members|workspaces)\.(update|delete)$/.test(
      event.action,
    );
    const adminOnly = /^(agent_tokens|mcp_calls)\./.test(event.action);
    for (const client of clients) {
      if (
        event.recipientOnly
          ? event.userId !== client.userId
          : event.workspaceId !== client.workspaceId &&
            event.userId !== client.userId
      )
        continue;
      if (membershipChange) {
        // A member row names its user; only that person's view changed.
        if (!event.userId || event.userId === client.userId)
          client.socket.close(1012);
        else if (client.ready && client.socket.readyState === 1)
          send(client, event);
        continue;
      }
      if (event.action === "sessions.delete") {
        if (event.resourceId === client.sessionId) client.socket.close(1012);
        continue;
      }
      if (event.action === "users.delete") {
        client.socket.close(1012);
        continue;
      }
      if (authEvent || (adminOnly && !client.admin)) continue;
      if (client.socket.readyState !== 1) continue;
      if (client.ready) send(client, event);
      else client.pending = event;
    }
  }, closeAll);
  function send(client: Client, event: ChangeEvent) {
    if ((client.raw?.bufferedAmount ?? 0) > MAX_BUFFERED_BYTES) {
      client.raw?.terminate();
      return;
    }
    client.socket.send(JSON.stringify(event));
  }
  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.raw) continue;
      if (!client.alive) {
        client.raw.terminate();
        continue;
      }
      client.alive = false;
      client.raw.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();
  return {
    server,
    upgrade(
      c: Context,
      userId: string,
      workspaceId: string,
      sessionId: string,
      expiresAt: number,
    ) {
      let client: Client | undefined;
      const remove = () => {
        if (!client) return;
        clearTimeout(client.expiry);
        clients.delete(client);
      };
      // Re-checks the session and membership; resolves with the next expiry.
      const authorize = async () => {
        const { response } = await core.getSession(c.req.raw.headers);
        if (
          !response ||
          response.user.id !== userId ||
          response.session.id !== sessionId ||
          response.session.expiresAt.getTime() <= Date.now()
        )
          throw new Error("unauthorized");
        // listMembers already rejects non-members; the role decides admin-only events.
        const members = await core.listMembers(
          userPrincipal(userId),
          workspaceId,
        );
        return {
          admin:
            members.find((member) => member.userId === userId)?.role ===
            "admin",
          expiresAt: response.session.expiresAt.getTime(),
        };
      };
      const scheduleExpiry = (socket: WSContext<WebSocketLike>, at: number) =>
        setTimeout(
          () => {
            // A refreshed session keeps its socket; a lapsed one closes.
            void authorize().then(
              ({ admin, expiresAt: next }) => {
                if (!client) return;
                client.admin = admin;
                client.expiry = scheduleExpiry(socket, next);
              },
              () => socket.close(1012),
            );
          },
          Math.max(0, Math.min(at - Date.now(), MAX_TIMER_MS)),
        );
      return upgradeWebSocket(c, {
        onOpen(_event, socket) {
          const raw = socket.raw as WebSocket | undefined;
          const mine = [...clients].filter((item) => item.userId === userId);
          if (mine.length >= MAX_SOCKETS_PER_USER) mine[0].socket.close(1008);
          client = {
            socket,
            raw,
            userId,
            workspaceId,
            sessionId,
            admin: false,
            ready: false,
            alive: true,
            expiry: scheduleExpiry(socket, expiresAt),
          };
          clients.add(client);
          raw?.on("pong", () => {
            if (client) client.alive = true;
          });
          // Register first, then reauthorize to cover revocation during the handshake.
          void authorize().then(
            ({ admin }) => {
              if (client && socket.readyState === 1) {
                client.admin = admin;
                client.ready = true;
                // One change invalidates every cache family, including changes while authorizing.
                if (client.pending) send(client, client.pending);
                client.pending = undefined;
              }
            },
            () => socket.close(1008),
          );
        },
        onMessage(_event, socket) {
          socket.close(1008);
        },
        onClose: remove,
        onError: remove,
      });
    },
    async close() {
      clearInterval(heartbeat);
      await unsubscribe();
      for (const client of clients) clearTimeout(client.expiry);
      clients.clear();
      for (const socket of server.clients) socket.terminate();
      server.close();
    },
  };
}

export type Realtime = Awaited<ReturnType<typeof createRealtime>>;
