import { CoreError, createCore } from "@taff/core";
import pino from "pino";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const core = createCore({
  databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
  authUrl: "http://localhost:3000",
  authSecret: "test-only-secret-with-at-least-32-characters",
  tokenPepper: "test-only-pepper-with-16-characters",
});
const app = createApp(core, "http://localhost:3000", pino({ enabled: false }), {
  limit: 60,
  hit: async () => ({ allowed: true, count: 1 }),
  close: async () => {},
});
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const person = { kind: "user", userId: id };
const now = new Date();
const session = {
  session: {
    id,
    userId: id,
    token: "test-token",
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    ipAddress: null,
    userAgent: null,
  },
  user: {
    id,
    email: "person@example.com",
    emailVerified: false,
    systemAdmin: false,
    name: "Person",
    createdAt: now,
    updatedAt: now,
    image: null,
    locale: "en",
    tz: "UTC",
  },
};
const signedIn = () =>
  vi
    .spyOn(core, "getSession")
    .mockResolvedValue({ response: session, headers: new Headers() });
const send = (path: string, method: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const milestone = {
  id,
  workspaceId: id,
  projectId: id,
  name: "Release",
  date: "2026-10-15",
  archivedAt: null,
  version: 1,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
const dependency = {
  id,
  workspaceId: id,
  predecessorTaskId: id,
  predecessorMilestoneId: null,
  successorTaskId: other,
  successorMilestoneId: null,
  createdAt: now.toISOString(),
};
afterEach(() => vi.restoreAllMocks());
afterAll(() => core.close());

describe("timeline REST boundaries", () => {
  it("requires a session before any timeline read", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: null,
      headers: new Headers(),
    });
    const read = vi.spyOn(core, "getTimeline");
    expect((await app.request(`/api/projects/${id}/timeline`)).status).toBe(
      401,
    );
    expect(read).not.toHaveBeenCalled();
  });
  it("reads the timeline with the session identity and maps core errors", async () => {
    signedIn();
    const read = vi
      .spyOn(core, "getTimeline")
      .mockRejectedValueOnce(new CoreError("forbidden", 403));
    expect((await app.request("/api/projects/bad/timeline")).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
    const denied = await app.request(`/api/projects/${id}/timeline`);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: "forbidden" });
    expect(read).toHaveBeenCalledWith(person, id);
  });
  it("validates plan bodies and forwards shiftChildren and the conflict", async () => {
    signedIn();
    const plan = vi
      .spyOn(core, "setTaskPlan")
      .mockRejectedValue(new CoreError("conflict", 409));
    for (const body of [
      { startDate: "2026-02-30", durationDays: 2 },
      { startDate: "2026-10-12", durationDays: 0 },
      { startDate: "2026-10-12", durationDays: 2, dueAt: "x" },
    ])
      expect((await send(`/api/tasks/${id}/plan`, "PATCH", body)).status).toBe(
        400,
      );
    expect(plan).not.toHaveBeenCalled();
    const body = {
      version: 2,
      startDate: "2026-10-12",
      durationDays: 3,
      shiftChildren: true,
    };
    const response = await send(`/api/tasks/${id}/plan`, "PATCH", body);
    expect(response.status).toBe(409);
    expect(plan).toHaveBeenCalledWith(person, id, body);
  });
  it("creates, updates and archives milestones through validated routes", async () => {
    signedIn();
    const create = vi
      .spyOn(core, "createMilestone")
      .mockResolvedValue(milestone);
    const update = vi
      .spyOn(core, "updateMilestone")
      .mockResolvedValue(milestone);
    const archive = vi
      .spyOn(core, "archiveMilestone")
      .mockResolvedValue(milestone);
    const list = vi
      .spyOn(core, "listMilestones")
      .mockResolvedValue([milestone]);
    expect(
      (await send(`/api/projects/${id}/milestones`, "POST", { name: "" }))
        .status,
    ).toBe(400);
    const created = await send(`/api/projects/${id}/milestones`, "POST", {
      name: "Release",
      date: "2026-10-15",
    });
    expect(created.status).toBe(201);
    expect(create).toHaveBeenCalledWith(person, id, {
      name: "Release",
      date: "2026-10-15",
    });
    expect((await app.request(`/api/projects/${id}/milestones`)).status).toBe(
      200,
    );
    expect(list).toHaveBeenCalledWith(person, id);
    expect(
      (await send(`/api/milestones/${id}`, "PATCH", { version: 1 })).status,
    ).toBe(400);
    expect(
      (
        await send(`/api/milestones/${id}`, "PATCH", {
          version: 1,
          date: "2026-10-16",
        })
      ).status,
    ).toBe(200);
    expect(update).toHaveBeenCalledWith(person, id, {
      version: 1,
      date: "2026-10-16",
    });
    expect(
      (await send(`/api/milestones/${id}?version=1`, "DELETE")).status,
    ).toBe(200);
    expect(archive).toHaveBeenCalledWith(person, id, 1);
    expect((await send(`/api/milestones/${id}`, "DELETE")).status).toBe(200);
    expect(archive).toHaveBeenLastCalledWith(person, id, undefined);
  });
  it("validates dependency ends and forwards add and remove", async () => {
    signedIn();
    const add = vi.spyOn(core, "addDependency").mockResolvedValue(dependency);
    const remove = vi
      .spyOn(core, "removeDependency")
      .mockResolvedValue(dependency);
    for (const body of [
      { predecessorTaskId: id },
      {
        predecessorTaskId: id,
        predecessorMilestoneId: id,
        successorTaskId: other,
      },
      { predecessorTaskId: id, successorTaskId: "bad" },
    ])
      expect((await send("/api/dependencies", "POST", body)).status).toBe(400);
    expect(add).not.toHaveBeenCalled();
    const body = { predecessorTaskId: id, successorTaskId: other };
    expect((await send("/api/dependencies", "POST", body)).status).toBe(201);
    expect(add).toHaveBeenCalledWith(person, body);
    expect((await send(`/api/dependencies/${id}`, "DELETE")).status).toBe(200);
    expect(remove).toHaveBeenCalledWith(person, id);
  });
  it("validates payments and keeps finance refusals", async () => {
    signedIn();
    const add = vi
      .spyOn(core, "addPayment")
      .mockRejectedValue(new CoreError("forbidden", 403));
    const list = vi
      .spyOn(core, "listPayments")
      .mockRejectedValue(new CoreError("forbidden", 403));
    for (const body of [
      { amount: "0", paidOn: "2026-10-01" },
      { amount: "12.345", paidOn: "2026-10-01" },
      { amount: 12, paidOn: "2026-10-01" },
    ])
      expect(
        (await send(`/api/projects/${id}/payments`, "POST", body)).status,
      ).toBe(400);
    expect(add).not.toHaveBeenCalled();
    const body = { amount: "250.00", paidOn: "2026-10-01", note: "Deposit" };
    expect(
      (await send(`/api/projects/${id}/payments`, "POST", body)).status,
    ).toBe(403);
    expect(add).toHaveBeenCalledWith(person, id, body);
    expect((await app.request(`/api/projects/${id}/payments`)).status).toBe(
      403,
    );
    expect(list).toHaveBeenCalledWith(person, id);
  });
  it("accepts finance fields on the project patch", async () => {
    signedIn();
    const update = vi
      .spyOn(core, "updateProject")
      .mockRejectedValue(new CoreError("forbidden", 403));
    expect(
      (
        await send(`/api/projects/${id}`, "PATCH", {
          version: 1,
          currency: "hkd",
        })
      ).status,
    ).toBe(400);
    const body = { version: 1, contractAmount: "1000.00", currency: "HKD" };
    expect((await send(`/api/projects/${id}`, "PATCH", body)).status).toBe(403);
    expect(update).toHaveBeenCalledWith(person, id, body);
  });
});

describe("timeline MCP tools", () => {
  const principal = {
    kind: "agent" as const,
    tokenId: id,
    memberId: id,
    workspaceId: id,
    scopes: ["tasks:read" as const, "tasks:write" as const],
  };
  const call = async (method: string, params: unknown) => {
    const response = await app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer redacted-test-token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const text = await response.text();
    const raw = response.headers.get("content-type")?.includes("event-stream")
      ? text
          .split("\n")
          .find((line) => line.startsWith("data:"))
          ?.slice(5)
      : text;
    return JSON.parse(raw ?? "{}") as {
      result?: { isError?: boolean; tools?: { name: string }[] };
      error?: unknown;
    };
  };
  it("lists the timeline tools and forwards validated arguments with the token identity", async () => {
    vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
    vi.spyOn(core, "resolveAgentWorkspace").mockResolvedValue(principal);
    vi.spyOn(core, "recordMcpCall").mockResolvedValue();
    const listed = await call("tools/list", {});
    expect(listed.result?.tools?.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "timeline.get",
        "tasks.plan",
        "dependencies.add",
        "dependencies.remove",
      ]),
    );
    const read = vi
      .spyOn(core, "getTimeline")
      .mockRejectedValue(new CoreError("forbidden", 403));
    const denied = await call("tools/call", {
      name: "timeline.get",
      arguments: { projectId: id },
    });
    expect(denied.result?.isError).toBe(true);
    expect(read).toHaveBeenCalledWith(principal, id);
    const plan = vi
      .spyOn(core, "setTaskPlan")
      .mockResolvedValue({ plans: [], tasks: [] });
    const invalid = await call("tools/call", {
      name: "tasks.plan",
      arguments: { taskId: id, startDate: "2026-10-12", durationDays: 0 },
    });
    expect(invalid.result?.isError || !!invalid.error).toBe(true);
    expect(plan).not.toHaveBeenCalled();
    await call("tools/call", {
      name: "tasks.plan",
      arguments: {
        taskId: id,
        version: 1,
        startDate: "2026-10-12",
        durationDays: 2,
      },
    });
    expect(plan).toHaveBeenCalledWith(principal, id, {
      version: 1,
      startDate: "2026-10-12",
      durationDays: 2,
    });
    const add = vi.spyOn(core, "addDependency").mockResolvedValue(dependency);
    const remove = vi
      .spyOn(core, "removeDependency")
      .mockResolvedValue(dependency);
    const both = await call("tools/call", {
      name: "dependencies.add",
      arguments: {
        predecessorTaskId: id,
        predecessorMilestoneId: id,
        successorTaskId: other,
      },
    });
    expect(both.result?.isError || !!both.error).toBe(true);
    expect(add).not.toHaveBeenCalled();
    await call("tools/call", {
      name: "dependencies.add",
      arguments: { predecessorTaskId: id, successorTaskId: other },
    });
    expect(add).toHaveBeenCalledWith(principal, {
      predecessorTaskId: id,
      successorTaskId: other,
    });
    await call("tools/call", {
      name: "dependencies.remove",
      arguments: { dependencyId: id },
    });
    expect(remove).toHaveBeenCalledWith(principal, id);
  });
});
