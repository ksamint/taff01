import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectWorkspace } from "./realtime";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const userId = "person-1";
class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: Socket[] = [];
  readyState = 0;
  onopen?: () => void;
  onmessage?: (message: { data: string }) => void;
  onclose?: (event: { code: number }) => void;
  onerror?: () => void;
  constructor(public url: URL) {
    Socket.instances.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  close(code = 1000) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}
const event = {
  activityId: "22222222-2222-4222-8222-222222222222",
  workspaceId,
  action: "tasks.insert",
  resourceId: "task",
  actorId: userId,
  userId: null,
};
let client: QueryClient;
let cleanup: (() => void) | undefined;
let browser: EventTarget;
beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  browser = new EventTarget();
  Object.assign(browser, {
    location: { origin: "https://taff.example", protocol: "https:" },
  });
  vi.stubGlobal("window", browser);
  vi.stubGlobal("WebSocket", Socket);
  client = new QueryClient();
  for (const key of ["tasks", "me", "agent-tokens", "inbox", "unrelated"])
    client.setQueryData([key, workspaceId], []);
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  client.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("workspace realtime lifecycle", () => {
  it("uses same-origin WSS and validates workspace/user routing before invalidating", () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    cleanup = connectWorkspace(client, workspaceId, userId);
    const socket = Socket.instances[0];
    expect(socket.url.href).toBe(
      `wss://taff.example/api/realtime?workspaceId=${workspaceId}`,
    );
    socket.open();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(["tasks", workspaceId])?.isInvalidated).toBe(
      true,
    );
    expect(
      client.getQueryState(["unrelated", workspaceId])?.isInvalidated,
    ).toBe(false);
    socket.message({
      ...event,
      workspaceId: "33333333-3333-4333-8333-333333333333",
    });
    socket.message({ ...event, workspaceId: null, userId: "someone-else" });
    socket.message({ ...event, token: "extra fields are rejected" });
    socket.message("invalid json event");
    expect(invalidate).toHaveBeenCalledTimes(1);
    socket.message(event);
    socket.message({
      ...event,
      action: "users.update",
      workspaceId: null,
      userId,
    });
    socket.message({
      ...event,
      action: "members.insert",
      workspaceId: "33333333-3333-4333-8333-333333333333",
      userId,
    });
    expect(invalidate).toHaveBeenCalledTimes(4);
  });
  it("invalidates the planning families keyed by project on a planning change", () => {
    const project = "44444444-4444-4444-8444-444444444444";
    for (const key of ["timeline", "milestones", "payments"])
      client.setQueryData([key, project], {});
    cleanup = connectWorkspace(client, workspaceId, userId);
    const socket = Socket.instances[0];
    socket.open();
    for (const key of ["timeline", "milestones", "payments"])
      client.setQueryData([key, project], {});
    socket.message({ ...event, action: "task_plans.update" });
    for (const key of ["timeline", "milestones", "payments"])
      expect(client.getQueryState([key, project])?.isInvalidated).toBe(true);
  });
  it("invalidates the CRM families on a company, contact or link change", () => {
    const keys = [
      ["companies", workspaceId],
      ["company", "company-1"],
      ["contacts", workspaceId, { query: "lee" }],
      ["contact", "contact-1"],
      ["contact-links", "project", "project-1"],
      ["crm-search", workspaceId, "north"],
      ["crm-audit", workspaceId],
    ];
    for (const key of keys) client.setQueryData(key, []);
    cleanup = connectWorkspace(client, workspaceId, userId);
    const socket = Socket.instances[0];
    socket.open();
    for (const key of keys) client.setQueryData(key, []);
    for (const key of keys)
      expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    socket.message({ ...event, action: "contact_roles.insert" });
    for (const key of keys)
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(
      client.getQueryState(["unrelated", workspaceId])?.isInvalidated,
    ).toBe(false);
  });
  it("invalidates the relations graph on any task, member or CRM change", () => {
    const key = ["graph", workspaceId, { projectId: null }];
    client.setQueryData(key, {});
    cleanup = connectWorkspace(client, workspaceId, userId);
    const socket = Socket.instances[0];
    socket.open();
    client.setQueryData(key, {});
    for (const action of [
      "tasks.update",
      "task_dependencies.delete",
      "project_contacts.insert",
    ]) {
      client.setQueryData(key, {});
      socket.message({ ...event, action });
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
  it("invalidates the brief and suggestions on a proposal or plan change", () => {
    const keys = [
      ["brief", "all"],
      ["brief", "workspace", workspaceId],
      ["suggestions", workspaceId, { status: "pending" }],
      ["workspace-ai", workspaceId],
    ];
    cleanup = connectWorkspace(client, workspaceId, userId);
    const socket = Socket.instances[0];
    socket.open();
    for (const action of ["suggestions.insert", "task_plans.update"]) {
      for (const key of keys) client.setQueryData(key, {});
      socket.message({ ...event, action });
      for (const key of keys)
        expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
  it("invalidates the mind map on a node, edge or source change", () => {
    const key = ["mind-map", workspaceId, "exclude"];
    cleanup = connectWorkspace(client, workspaceId, userId);
    const socket = Socket.instances[0];
    socket.open();
    for (const action of [
      "mind_nodes.update",
      "mind_edges.delete",
      "mind_sources.insert",
      "mind_node_sources.delete",
    ]) {
      client.setQueryData(key, {});
      socket.message({ ...event, action });
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
  it("defers change refetches until a pending optimistic mutation settles", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    cleanup = connectWorkspace(client, workspaceId, userId);
    let finish!: () => void;
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    const result = mutation.execute(undefined);
    await Promise.resolve();
    await Promise.resolve();
    Socket.instances[0].open();
    Socket.instances[0].message(event);
    expect(invalidate).not.toHaveBeenCalled();
    finish();
    await result;
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
  it("checks revoked authentication immediately while a write is still pending", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    cleanup = connectWorkspace(client, workspaceId, userId);
    let finish!: () => void;
    const mutation = client.getMutationCache().build(client, {
      mutationFn: () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    });
    const result = mutation.execute(undefined);
    await Promise.resolve();
    await Promise.resolve();
    Socket.instances[0].open();
    Socket.instances[0].close(1012);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["me"] });
    expect(client.getQueryData(["tasks", workspaceId])).toBeUndefined();
    finish();
    await result;
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(["tasks", workspaceId])).toBeUndefined();
  });
  it("backs off, stops after eight failures, resumes on focus, and cleans up stale callbacks", () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    cleanup = connectWorkspace(client, workspaceId, userId);
    for (let attempt = 0; attempt < 8; attempt++) {
      Socket.instances.at(-1)?.close(1012);
      vi.advanceTimersByTime(Math.min(10000, 250 * 2 ** attempt));
    }
    expect(Socket.instances).toHaveLength(9);
    Socket.instances.at(-1)?.close(1012);
    vi.advanceTimersByTime(100000);
    expect(Socket.instances).toHaveLength(9);
    browser.dispatchEvent(new Event("focus"));
    expect(Socket.instances).toHaveLength(10);
    const old = Socket.instances[0];
    const latest = Socket.instances.at(-1)!;
    latest.open();
    const count = invalidate.mock.calls.length;
    old.message(event);
    expect(invalidate).toHaveBeenCalledTimes(count);
    cleanup();
    cleanup = undefined;
    expect(latest.readyState).toBe(3);
    latest.message(event);
    latest.open();
    browser.dispatchEvent(new Event("online"));
    vi.advanceTimersByTime(100000);
    expect(Socket.instances).toHaveLength(10);
    expect(invalidate).toHaveBeenCalledTimes(count);
  });
  it("refetches authentication on policy closure without an automatic retry", () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    cleanup = connectWorkspace(client, workspaceId, userId);
    Socket.instances[0].close(1008);
    vi.advanceTimersByTime(100000);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["me"] });
    expect(client.getQueryData(["tasks", workspaceId])).toBeUndefined();
    expect(Socket.instances).toHaveLength(1);
  });
});
