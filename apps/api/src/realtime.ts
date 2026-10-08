import { upgradeWebSocket, type WebSocketLike } from "@hono/node-server";
import { type createCore, userPrincipal } from "@taff/core";
import type { ChangeEvent } from "@taff/schemas";
import type { Context } from "hono";
import type { WSContext } from "hono/ws";
import { WebSocketServer } from "ws";

type Client = {
  socket: WSContext<WebSocketLike>;
  workspaceId: string;
  userId: string;
  ready: boolean;
  pending?: ChangeEvent;
  expiry: ReturnType<typeof setTimeout>;
};

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
    for (const client of clients) {
      if (
        event.workspaceId
          ? event.workspaceId !== client.workspaceId
          : event.userId !== client.userId
      )
        continue;
      if (
        membershipChange ||
        event.action === "sessions.delete" ||
        event.action === "users.delete"
      ) {
        client.socket.close(1012);
      } else if (!authEvent && client.socket.readyState === 1) {
        if (client.ready) client.socket.send(JSON.stringify(event));
        else client.pending = event;
      }
    }
  }, closeAll);
  return {
    server,
    upgrade(
      c: Context,
      userId: string,
      workspaceId: string,
      expiresAt: number,
    ) {
      let client: Client | undefined;
      const remove = () => {
        if (!client) return;
        clearTimeout(client.expiry);
        clients.delete(client);
      };
      return upgradeWebSocket(c, {
        onOpen(_event, socket) {
          client = {
            socket,
            userId,
            workspaceId,
            ready: false,
            expiry: setTimeout(
              () => socket.close(1012),
              Math.max(0, Math.min(expiresAt - Date.now(), 2_147_483_647)),
            ),
          };
          clients.add(client);
          // Register first, then reauthorize to cover revocation during the handshake.
          const authorize = async () => {
            const { response } = await core.getSession(c.req.raw.headers);
            if (
              !response ||
              response.user.id !== userId ||
              response.session.expiresAt.getTime() <= Date.now()
            )
              throw new Error("unauthorized");
            await core.listMembers(userPrincipal(userId), workspaceId);
          };
          void authorize().then(
            () => {
              if (client && socket.readyState === 1) {
                client.ready = true;
                // One change invalidates every cache family, including changes while authorizing.
                if (client.pending) socket.send(JSON.stringify(client.pending));
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
      await unsubscribe();
      for (const client of clients) clearTimeout(client.expiry);
      clients.clear();
      for (const socket of server.clients) socket.terminate();
      server.close();
    },
  };
}

export type Realtime = Awaited<ReturnType<typeof createRealtime>>;
