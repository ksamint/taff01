import type { AddressInfo } from "node:net";
import { type ServerType, serve } from "@hono/node-server";
import { CoreError, createCore } from "@taff/core";
import type { ChangeEvent } from "@taff/schemas";
import pino from "pino";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { WebSocket } from "ws";
import { createApp } from "./app";
import { createRealtime, type Realtime } from "./realtime";

const workspace = "00000000-0000-4000-8000-000000000001";
const otherWorkspace = "00000000-0000-4000-8000-000000000002";
const origin = "http://localhost:3000";
const core = createCore({
  databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
  authUrl: origin,
  authSecret: "test-only-secret-with-at-least-32-characters",
  tokenPepper: "test-only-pepper-with-16-characters",
});
let deliver: Parameters<typeof core.subscribeChanges>[0];
let reconnect: () => void | Promise<void>;
let realtime: Realtime;
let server: ServerType;
let url: string;
let expiresAt = Date.now() + 60_000;
const allowed = new Set([
  `alice:${workspace}`,
  `bob:${otherWorkspace}`,
  `charlie:${workspace}`,
]);
const unsubscribe = vi.fn(async () => {});
const sockets = new Set<WebSocket>();

beforeAll(async () => {
  vi.spyOn(core, "subscribeChanges").mockImplementation(
    async (listener, onReconnect) => {
      deliver = listener;
      reconnect = onReconnect ?? (() => {});
      return unsubscribe;
    },
  );
  vi.spyOn(core, "getSession").mockImplementation(async (headers) => {
    const id = headers.get("cookie");
    if (!id || expiresAt <= Date.now())
      return { response: null, headers: new Headers() };
    const now = new Date();
    return {
      response: {
        session: {
          id,
          userId: id,
          token: "redacted",
          createdAt: now,
          updatedAt: now,
          expiresAt: new Date(expiresAt),
          ipAddress: null,
          userAgent: null,
        },
        user: {
          id,
          name: id,
          email: `${id}@example.com`,
          emailVerified: false,
          systemAdmin: false,
          image: null,
          createdAt: now,
          updatedAt: now,
          locale: "en",
          tz: "UTC",
        },
      },
      headers: new Headers(),
    };
  });
  vi.spyOn(core, "listMembers").mockImplementation(
    async (principal, workspaceId) => {
      if (
        principal.kind !== "user" ||
        !allowed.has(`${principal.userId}:${workspaceId}`)
      )
        throw new CoreError("forbidden", 403);
      return [];
    },
  );
  realtime = await createRealtime(core);
  const app = createApp(
    core,
    origin,
    pino({ enabled: false }),
    {
      limit: 60,
      hit: async () => ({ allowed: true, count: 1 }),
      close: async () => {},
    },
    realtime,
  );
  server = serve({
    fetch: app.fetch,
    port: 0,
    hostname: "127.0.0.1",
    websocket: { server: realtime.server },
  });
  if (!server.listening)
    await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/realtime`;
});
afterEach(() => {
  for (const socket of sockets) socket.terminate();
  sockets.clear();
  expiresAt = Date.now() + 60_000;
});
afterAll(async () => {
  await realtime.close();
  expect(unsubscribe).toHaveBeenCalledOnce();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.restoreAllMocks();
  await core.close();
});
async function connect(
  userId: string | null,
  workspaceId = workspace,
  requestOrigin: string | null = origin,
) {
  const socket = new WebSocket(`${url}?workspaceId=${workspaceId}`, {
    headers: {
      ...(userId ? { cookie: userId } : {}),
      ...(requestOrigin ? { origin: requestOrigin } : {}),
    },
  });
  sockets.add(socket);
  return new Promise<WebSocket>((resolve, reject) => {
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
    socket.once("unexpected-response", (_request, response) => {
      response.resume();
      socket.terminate();
      reject(new Error(`HTTP ${response.statusCode}`));
    });
  });
}
function change(fields: Partial<ChangeEvent> = {}): ChangeEvent {
  return {
    activityId: workspace,
    workspaceId: workspace,
    resourceId: workspace,
    action: "tasks.update",
    actorId: "alice",
    userId: null,
    ...fields,
  };
}
function message(socket: WebSocket) {
  return new Promise<ChangeEvent>((resolve) =>
    socket.once("message", (data) => resolve(JSON.parse(data.toString()))),
  );
}
function closed(socket: WebSocket) {
  return new Promise<number>((resolve) => socket.once("close", resolve));
}

describe("authenticated realtime boundaries", () => {
  it("rejects anonymous, cross-origin, originless and nonmember upgrades", async () => {
    await expect(connect(null)).rejects.toThrow("HTTP 401");
    await expect(
      connect("alice", workspace, "https://other.example"),
    ).rejects.toThrow("HTTP 403");
    await expect(connect("alice", workspace, null)).rejects.toThrow("HTTP 403");
    await expect(connect("alice", otherWorkspace)).rejects.toThrow("HTTP 403");
  });
  it("fans out only safe metadata to the matching workspace or affected user", async () => {
    const alice = await connect("alice");
    const bob = await connect("bob", otherWorkspace);
    const bobMessages: unknown[] = [];
    bob.on("message", (data) => bobMessages.push(data.toString()));
    const first = message(alice);
    await deliver(change());
    expect(await first).toEqual(change());
    const profile = change({
      workspaceId: null,
      userId: "alice",
      action: "users.update",
    });
    const second = message(alice);
    await deliver(profile);
    expect(await second).toEqual(profile);
    await deliver(
      change({ workspaceId: null, userId: "alice", action: "sessions.update" }),
    );
    const third = message(alice);
    await deliver(change());
    expect(await third).toEqual(change());
    expect(bobMessages).toEqual([]);
  });
  it("closes sockets on membership removal, session deletion and listener reconnect", async () => {
    const alice = await connect("alice");
    const bob = await connect("bob", otherWorkspace);
    const aliceClosed = closed(alice);
    allowed.delete(`alice:${workspace}`);
    await deliver(change({ action: "members.delete" }));
    expect(await aliceClosed).toBe(1012);
    await expect(connect("alice")).rejects.toThrow("HTTP 403");
    allowed.add(`alice:${workspace}`);
    expect(bob.readyState).toBe(WebSocket.OPEN);
    const bobClosed = closed(bob);
    // Revoking another of Bob's sessions leaves this device connected.
    await deliver(
      change({
        workspaceId: null,
        userId: "bob",
        resourceId: "bob-phone",
        action: "sessions.delete",
      }),
    );
    expect(bob.readyState).toBe(WebSocket.OPEN);
    await deliver(
      change({
        workspaceId: null,
        userId: "bob",
        resourceId: "bob",
        action: "sessions.delete",
      }),
    );
    expect(await bobClosed).toBe(1012);
    const next = await connect("alice");
    const nextClosed = closed(next);
    await reconnect();
    expect(await nextClosed).toBe(1012);
  });
  it("delivers private digest, preference and Inbox metadata only to its recipient", async () => {
    const alice = await connect("alice");
    const charlie = await connect("charlie");
    const observed: ChangeEvent[] = [];
    charlie.on("message", (data) => observed.push(JSON.parse(data.toString())));
    for (const action of [
      "notification_preferences.update",
      "daily_digests.insert",
      "inbox_items.insert",
    ]) {
      const event = change({ action, userId: "alice", recipientOnly: true });
      const received = message(alice);
      await deliver(event);
      expect(await received).toEqual(event);
    }
    const publicEvent = message(charlie);
    await deliver(change());
    expect(await publicEvent).toEqual(change());
    expect(observed).toEqual([change()]);
  });
  it("routes new membership to its workspace and affected user without notifying unrelated users", async () => {
    const alice = await connect("alice");
    const bob = await connect("bob", otherWorkspace);
    const charlie = await connect("charlie");
    const unrelated: unknown[] = [];
    charlie.on("message", (data) => unrelated.push(data.toString()));
    const toUser = message(alice);
    const toWorkspace = message(bob);
    const membership = change({
      workspaceId: otherWorkspace,
      userId: "alice",
      action: "members.insert",
    });
    await deliver(membership);
    expect(await toUser).toEqual(membership);
    expect(await toWorkspace).toEqual(membership);
    expect(unrelated).toEqual([]);
  });
  it("expires authenticated connections and rejects client writes", async () => {
    expiresAt = Date.now() + 200;
    const expiring = await connect("alice");
    expect(await closed(expiring)).toBe(1012);
    expiresAt = Date.now() + 60_000;
    const writer = await connect("alice");
    const writerClosed = closed(writer);
    writer.send(JSON.stringify({ action: "tasks.delete" }));
    expect(await writerClosed).toBe(1008);
    const oversized = await connect("alice");
    const oversizedClosed = closed(oversized);
    oversized.send("x".repeat(1025));
    expect(await oversizedClosed).toBe(1009);
  });
  it("reauthorizes a session revoked between the HTTP check and socket registration", async () => {
    const authenticated = await core.getSession(
      new Headers({ cookie: "alice" }),
    );
    vi.spyOn(core, "getSession")
      .mockImplementationOnce(async () => {
        await deliver(
          change({
            workspaceId: null,
            userId: "alice",
            action: "sessions.delete",
          }),
        );
        return authenticated;
      })
      .mockResolvedValueOnce({ response: null, headers: new Headers() });
    const socket = await connect("alice");
    expect(await closed(socket)).toBe(1008);
  });
  it("flushes a matching change received during post-upgrade authorization", async () => {
    let authorize = () => {};
    vi.spyOn(core, "listMembers")
      .mockResolvedValueOnce([])
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            authorize = () => resolve([]);
          }),
      );
    const socket = await connect("alice");
    const received = message(socket);
    await deliver(change());
    authorize();
    expect(await received).toEqual(change());
  });
});
