import { Writable } from "node:stream";
import { CoreError, createCore } from "@taff/core";
import pino from "pino";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { calendarImageFixture } from "../../../packages/schemas/src/calendar-image.fixture";
import { timelineImageFixture } from "../../../packages/schemas/src/timeline-image.fixture";
import { createApp } from "./app";
import type { RateLimiter } from "./rate-limit";

/** ADR 0031: the export route is a thin adapter over core and the renderer. */
const origin = "http://localhost:3000";
const core = createCore({
  databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
  authUrl: origin,
  authSecret: "test-only-secret-with-at-least-32-characters",
  tokenPepper: "test-only-pepper-with-16-characters",
});
const logger = pino({}, new Writable({ write: (_c, _e, done) => done() }));
const allow: RateLimiter = {
  limit: 100,
  hit: async () => ({ allowed: true, count: 1 }),
  close: async () => {},
};
let limited: "allow" | "deny" | "throw" = "allow";
const hits: string[] = [];
const exportLimiter: RateLimiter = {
  limit: 10,
  hit: async (key) => {
    hits.push(key);
    if (limited === "throw") throw new Error("valkey down");
    return { allowed: limited === "allow", count: 1 };
  },
  close: async () => {},
};
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const renderer = vi.fn<typeof fetch>();
const appWith = (renderUrl?: string) =>
  createApp(
    core,
    origin,
    logger,
    allow,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { exportRateLimiter: exportLimiter, renderUrl, renderFetch: renderer },
  );
const app = appWith("http://render.internal:3002");
const id = "00000000-0000-4000-8000-000000000001";
const project = "00000000-0000-4000-8000-000000000002";
const hash = "a".repeat(64);
const exported = {
  layout: { version: 1 } as never,
  watermark: {
    text: "Person · Team · 2026-11-12 · export",
    recipientName: "Person",
    org: "Team",
    localDate: "2026-11-12",
    summaryId: null,
    contentHash: hash,
  },
  contentHash: hash,
  fileName: "taff-project-2026-11-12-aaaaaaaa.png",
};
const now = new Date();
const signIn = () =>
  vi.spyOn(core, "getSession").mockResolvedValue({
    response: {
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
    },
    headers: new Headers(),
  });
const path = `/api/workspaces/${id}/view-image?locale=zh-CN&projectId=${project}`;
afterEach(() => {
  vi.restoreAllMocks();
  renderer.mockReset();
  hits.length = 0;
  limited = "allow";
});
afterAll(() => core.close());

describe("exported view image route", () => {
  it("requires a session before core, the limiter or the renderer", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: null,
      headers: new Headers(),
    });
    const call = vi.spyOn(core, "exportViewImageInput");
    expect((await app.request(path)).status).toBe(401);
    expect(call).not.toHaveBeenCalled();
    expect(hits).toEqual([]);
    expect(renderer).not.toHaveBeenCalled();
  });

  it("sends core's layout to the renderer and returns an uncached PNG attachment", async () => {
    signIn();
    const call = vi
      .spyOn(core, "exportViewImageInput")
      .mockResolvedValue(exported);
    renderer.mockResolvedValue(
      new Response(PNG, { headers: { "content-type": "image/png" } }),
    );
    const response = await app.request(path);
    expect(response.status).toBe(200);
    expect(call).toHaveBeenCalledWith(
      { kind: "user", userId: id },
      id,
      {
        locale: "zh-CN",
        projectId: project,
      },
      "web",
    );
    const [target, init] = renderer.mock.calls[0];
    expect(String(target)).toBe("http://render.internal:3002/render/summary");
    // The download name never reaches the renderer's strict contract.
    expect(JSON.parse(String(init?.body))).toEqual({
      layout: exported.layout,
      watermark: exported.watermark,
      contentHash: hash,
    });
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="${exported.fileName}"`,
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-taff-content-hash")).toBe(hash);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^view-export:[a-f0-9]{64}$/);
    expect(hits[0]).not.toContain(id);
  });

  it("validates the query before counting or calling core", async () => {
    signIn();
    const call = vi.spyOn(core, "exportViewImageInput");
    for (const bad of [
      `/api/workspaces/${id}/view-image?locale=fr`,
      `/api/workspaces/${id}/view-image`,
      `/api/workspaces/${id}/view-image?locale=en&projectId=nope`,
      `/api/workspaces/${id}/view-image?locale=en&extra=1`,
      `/api/workspaces/${id}/view-image?locale=en&view=timeline`,
      `${path}&criticalPath=hide`,
      `${path}&view=timeline&criticalPath=yes`,
      `/api/workspaces/${id}/view-image?locale=en&view=calendar&calendarMode=day&visibleDate=2026-03-08`,
      `${path}&view=calendar&calendarMode=week&visibleDate=2026-03-08`,
      "/api/workspaces/nope/view-image?locale=en",
    ])
      expect((await app.request(bad)).status).toBe(400);
    expect(call).not.toHaveBeenCalled();
    expect(hits).toEqual([]);
  });

  it("routes authorized timeline options through the shared quota and timeline renderer", async () => {
    signIn();
    const timeline = {
      ...timelineImageFixture("en"),
      fileName: "taff-timeline-2026-11-12-aaaaaaaa.png",
    };
    const call = vi
      .spyOn(core, "exportViewImageInput")
      .mockResolvedValue(timeline);
    renderer.mockResolvedValue(
      new Response(PNG, { headers: { "content-type": "image/png" } }),
    );
    const response = await app.request(
      `${path}&view=timeline&criticalPath=hide`,
    );
    expect(response.status).toBe(200);
    expect(call).toHaveBeenCalledWith(
      { kind: "user", userId: id },
      id,
      {
        locale: "zh-CN",
        projectId: project,
        view: "timeline",
        criticalPath: "hide",
      },
      "web",
    );
    expect(String(renderer.mock.calls[0][0])).toBe(
      "http://render.internal:3002/render/timeline",
    );
    expect(JSON.parse(String(renderer.mock.calls[0][1]?.body))).toEqual(
      timelineImageFixture("en"),
    );
    expect(hits).toHaveLength(1);
  });

  it("refuses over the limit and fails closed when the count fails", async () => {
    signIn();
    const call = vi.spyOn(core, "exportViewImageInput");
    limited = "deny";
    const denied = await app.request(path);
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBe("60");
    limited = "throw";
    expect((await app.request(path)).status).toBe(503);
    expect(call).not.toHaveBeenCalled();
    expect(renderer).not.toHaveBeenCalled();
  });

  it("passes core's refusals through without rendering", async () => {
    signIn();
    for (const [code, status] of [
      ["forbidden", 403],
      ["not_found", 404],
    ] as const) {
      vi.spyOn(core, "exportViewImageInput").mockRejectedValueOnce(
        new CoreError(code, status),
      );
      expect((await app.request(path)).status).toBe(status);
    }
    expect(renderer).not.toHaveBeenCalled();
  });

  it("answers 503 without a renderer and 502 when the renderer fails", async () => {
    signIn();
    vi.spyOn(core, "exportViewImageInput").mockResolvedValue(exported);
    const off = await appWith(undefined).request(path);
    expect(off.status).toBe(503);
    expect(await off.json()).toEqual({ error: "render_unavailable" });
    expect(renderer).not.toHaveBeenCalled();
    renderer.mockResolvedValueOnce(
      new Response("render_too_large", { status: 422 }),
    );
    renderer.mockResolvedValueOnce(
      new Response("<html>", { headers: { "content-type": "text/html" } }),
    );
    renderer.mockRejectedValueOnce(new Error("timeout"));
    for (let attempt = 0; attempt < 3; attempt++) {
      const failed = await app.request(path);
      expect(failed.status).toBe(502);
      expect(await failed.json()).toEqual({ error: "render_failed" });
    }
  });
});

it("routes an authorized calendar window through the shared quota and calendar renderer", async () => {
  signIn();
  const calendar = {
    ...calendarImageFixture("en", "week"),
    fileName: "taff-calendar-2026-11-12-aaaaaaaa.png",
  };
  const call = vi
    .spyOn(core, "exportViewImageInput")
    .mockResolvedValue(calendar);
  renderer.mockResolvedValue(
    new Response(PNG, { headers: { "content-type": "image/png" } }),
  );
  const response = await app.request(
    `/api/workspaces/${id}/view-image?locale=en&view=calendar&calendarMode=week&visibleDate=2026-03-08`,
  );
  expect(response.status).toBe(200);
  expect(call).toHaveBeenCalledWith(
    { kind: "user", userId: id },
    id,
    {
      locale: "en",
      view: "calendar",
      calendarMode: "week",
      visibleDate: "2026-03-08",
    },
    "web",
  );
  expect(String(renderer.mock.calls[0][0])).toBe(
    "http://render.internal:3002/render/calendar",
  );
  expect(JSON.parse(String(renderer.mock.calls[0][1]?.body))).toEqual(
    calendarImageFixture("en", "week"),
  );
  expect(hits).toHaveLength(1);
});
