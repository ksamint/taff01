import { Writable } from "node:stream";
import { CoreError, createCore } from "@taff/core";
import pino from "pino";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import type { RateLimiter } from "./rate-limit";

const origin = "http://localhost:3000";
const core = createCore({
  databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
  authUrl: origin,
  authSecret: "test-only-secret-with-at-least-32-characters",
  tokenPepper: "test-only-pepper-with-16-characters",
});
const logged: string[] = [];
const logger = pino(
  {},
  new Writable({
    write(chunk, _encoding, done) {
      logged.push(chunk.toString());
      done();
    },
  }),
);
const allow: RateLimiter = {
  limit: 100,
  hit: async () => ({ allowed: true, count: 1 }),
  close: async () => {},
};
const shareHits: string[] = [];
let shareAllowed = (_key: string) => true;
const shareLimiter: RateLimiter = {
  limit: 30,
  hit: async (key) => {
    shareHits.push(key);
    if (key === "throw") throw new Error("unreachable");
    return { allowed: shareAllowed(key), count: 1 };
  },
  close: async () => {},
};
const app = createApp(
  core,
  origin,
  logger,
  allow,
  undefined,
  undefined,
  undefined,
  undefined,
  shareLimiter,
);
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const person = { kind: "user", userId: id };
const token = `tsum_${"a".repeat(43)}`;
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
const signedOut = () =>
  vi.spyOn(core, "getSession").mockResolvedValue({
    response: null,
    headers: new Headers(),
  });
const send = (
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
afterEach(() => {
  vi.restoreAllMocks();
  shareHits.length = 0;
  shareAllowed = () => true;
  logged.length = 0;
});
afterAll(() => core.close());

describe("shareholder summary REST adapter", () => {
  const routes: [string, string, unknown?][] = [
    ["GET", `/api/workspaces/${id}/audience-tags`],
    ["POST", `/api/workspaces/${id}/audience-tags`, { org: "Harbour" }],
    ["PATCH", `/api/audience-tags/${id}`, { version: 1, label: "A" }],
    ["GET", `/api/audience-tags/${id}/recipients`],
    [
      "POST",
      `/api/audience-tags/${id}/recipients`,
      { name: "Pat", locale: "en", timeZone: "UTC", deliverAt: "09:00" },
    ],
    ["PATCH", `/api/audience-recipients/${id}`, { version: 1, enabled: false }],
    ["GET", `/api/projects/${id}/audience-tags`],
    ["PUT", `/api/projects/${id}/audience-tags`, { tagIds: [other] }],
    ["GET", `/api/summaries?workspaceId=${id}`],
    ["POST", "/api/summaries/preview", { recipientId: id }],
    ["GET", `/api/summaries/${id}`],
    ["GET", `/api/summaries/${id}/shares`],
    ["POST", `/api/summaries/${id}/shares`, {}],
    ["DELETE", `/api/summary-shares/${id}`],
  ];
  it.each(routes)("%s %s requires a session", async (method, path, body) => {
    signedOut();
    const calls = [
      "listAudienceTags",
      "createAudienceTag",
      "listDailySummaries",
      "createSummaryShare",
      "revokeSummaryShare",
    ].map((name) => vi.spyOn(core, name as "listAudienceTags"));
    expect((await send(path, method, body)).status).toBe(401);
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });

  it("validates bodies and queries before core and forwards the session principal", async () => {
    signIn();
    const create = vi
      .spyOn(core, "createAudienceTag")
      .mockResolvedValue({} as never);
    expect(
      (await send(`/api/workspaces/${id}/audience-tags`, "POST", { org: "" }))
        .status,
    ).toBe(400);
    expect(
      (
        await send(`/api/workspaces/${id}/audience-tags`, "POST", {
          org: "Harbour",
          kind: "investor",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("/api/workspaces/not-a-uuid/audience-tags", "POST", {
          org: "H",
        })
      ).status,
    ).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect(
      (
        await send(`/api/workspaces/${id}/audience-tags`, "POST", {
          org: " Harbour ",
        })
      ).status,
    ).toBe(201);
    expect(create).toHaveBeenCalledExactlyOnceWith(person, id, {
      org: "Harbour",
    });

    const put = vi
      .spyOn(core, "setProjectAudienceTags")
      .mockResolvedValue({ projectId: id, tags: [] });
    expect(
      (
        await send(`/api/projects/${id}/audience-tags`, "PUT", {
          tagIds: [other, other],
        })
      ).status,
    ).toBe(400);
    expect(
      (await send(`/api/projects/${id}/audience-tags`, "PUT", { tagIds: [] }))
        .status,
    ).toBe(200);
    expect(put).toHaveBeenCalledExactlyOnceWith(person, id, { tagIds: [] });

    const list = vi
      .spyOn(core, "listDailySummaries")
      .mockResolvedValue({ items: [], truncated: false });
    expect(
      (await send(`/api/summaries?workspaceId=${id}&tagId=nope`, "GET")).status,
    ).toBe(400);
    expect(
      (await send(`/api/summaries?workspaceId=${id}&other=1`, "GET")).status,
    ).toBe(400);
    expect(
      (await send(`/api/summaries?workspaceId=${id}&tagId=${other}`, "GET"))
        .status,
    ).toBe(200);
    expect(list).toHaveBeenCalledExactlyOnceWith(person, id, { tagId: other });

    const share = vi
      .spyOn(core, "createSummaryShare")
      .mockResolvedValue({} as never);
    expect(
      (await send(`/api/summaries/${id}/shares`, "POST", { expiresInDays: 91 }))
        .status,
    ).toBe(400);
    const issued = await send(`/api/summaries/${id}/shares`, "POST", {
      expiresInDays: 3,
    });
    expect(issued.status).toBe(201);
    expect(issued.headers.get("cache-control")).toBe("private, no-store");
    expect(share).toHaveBeenCalledExactlyOnceWith(person, id, {
      expiresInDays: 3,
    });

    const preview = vi
      .spyOn(core, "previewDailySummary")
      .mockResolvedValue({} as never);
    const read = vi.spyOn(core, "getDailySummary");
    expect(
      (
        await send("/api/summaries/preview", "POST", {
          recipientId: id,
          localDate: "2026-02-30",
        })
      ).status,
    ).toBe(400);
    expect(
      (await send("/api/summaries/preview", "POST", { recipientId: id }))
        .status,
    ).toBe(200);
    expect(preview).toHaveBeenCalledExactlyOnceWith(person, {
      recipientId: id,
    });
    expect(read).not.toHaveBeenCalled();
  });

  it("returns core denials and conflicts unchanged", async () => {
    signIn();
    vi.spyOn(core, "revokeSummaryShare").mockRejectedValue(
      new CoreError("forbidden", 403),
    );
    vi.spyOn(core, "updateAudienceTag").mockRejectedValue(
      new CoreError("conflict", 409),
    );
    vi.spyOn(core, "getDailySummary").mockRejectedValue(
      new CoreError("not_found", 404),
    );
    expect(
      await (await send(`/api/summary-shares/${id}`, "DELETE")).json(),
    ).toEqual({ error: "forbidden" });
    expect(
      (
        await send(`/api/audience-tags/${id}`, "PATCH", {
          version: 1,
          archived: true,
        })
      ).status,
    ).toBe(409);
    expect((await send(`/api/summaries/${id}`, "GET")).status).toBe(404);
  });
});

describe("public share-link read", () => {
  it("answers without a session, never caches, and forwards only the token", async () => {
    const session = vi.spyOn(core, "getSession");
    const read = vi
      .spyOn(core, "readSharedSummary")
      .mockResolvedValue({} as never);
    const response = await send("/api/shared-summary", "POST", { token });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(read).toHaveBeenCalledExactlyOnceWith(token);
    expect(session).not.toHaveBeenCalled();
    expect(shareHits).toHaveLength(2);
    expect(shareHits[0]).toMatch(/^share:peer:[a-f0-9]{64}$/);
    expect(shareHits[1]).toMatch(/^share:token:[a-f0-9]{64}$/);
    expect(shareHits.join()).not.toContain(token);
  });

  it("answers every miss with the same 404", async () => {
    vi.spyOn(core, "readSharedSummary").mockRejectedValue(
      new CoreError("not_found", 404),
    );
    for (const value of [token, "tsum_short", "x"]) {
      const response = await send("/api/shared-summary", "POST", {
        token: value,
      });
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "not_found" });
    }
  });

  it("rejects malformed bodies and cross-origin posts before core", async () => {
    const read = vi.spyOn(core, "readSharedSummary");
    for (const body of [
      {},
      { token: "" },
      { token: "a".repeat(201) },
      { token, extra: 1 },
    ])
      expect((await send("/api/shared-summary", "POST", body)).status).toBe(
        400,
      );
    expect(
      (
        await send(
          "/api/shared-summary",
          "POST",
          { token },
          { origin: "https://evil.example" },
        )
      ).status,
    ).toBe(403);
    expect(read).not.toHaveBeenCalled();
  });

  it("rate-limits by client address and by token before the database; a failed count denies", async () => {
    const read = vi
      .spyOn(core, "readSharedSummary")
      .mockResolvedValue({} as never);
    shareAllowed = (key) => !key.startsWith("share:peer:");
    expect((await send("/api/shared-summary", "POST", { token })).status).toBe(
      429,
    );
    expect(shareHits).toHaveLength(1);
    shareAllowed = (key) => !key.startsWith("share:token:");
    expect((await send("/api/shared-summary", "POST", { token })).status).toBe(
      429,
    );
    shareAllowed = () => {
      throw new Error("Valkey down");
    };
    expect((await send("/api/shared-summary", "POST", { token })).status).toBe(
      429,
    );
    expect(read).not.toHaveBeenCalled();
  });

  it("never writes the token to the log, even when core fails", async () => {
    vi.spyOn(core, "readSharedSummary").mockRejectedValue(
      new Error(`boom ${token}`),
    );
    const response = await send("/api/shared-summary", "POST", { token });
    expect(response.status).toBe(500);
    expect(logged.join("")).toContain("Request failed");
    expect(logged.join("")).not.toContain(token);
    expect(logged.join("")).not.toContain("a".repeat(43));
  });
});

describe("summary render delivery", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDioAAAAASUVORK5CYII=",
    "base64",
  );
  const stored = {
    id,
    workspaceId: id,
    summaryId: id,
    format: "txt" as const,
    body: "Daily progress\nPat\n",
    data: null,
    byteSize: 19,
    rendererVersion: "1",
    contentHash: "a".repeat(64),
    createdAt: now.toISOString(),
  };
  it("requires a human session, validates format and serves private text attachments", async () => {
    const read = vi.spyOn(core, "getSummaryRender").mockResolvedValue(stored);
    expect(
      (await app.request(`/api/summaries/${id}/render?format=txt`)).status,
    ).toBe(401);
    signIn();
    expect(
      (await app.request(`/api/summaries/${id}/render?format=svg`)).status,
    ).toBe(400);
    expect(read).not.toHaveBeenCalled();
    const response = await app.request(
      `/api/summaries/${id}/render?format=txt`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="summary.txt"',
    );
    expect(await response.text()).toBe(stored.body);
    expect(read).toHaveBeenCalledWith(person, id, "txt");
  });
  it("delivers native PNG bytes on private and shared reads without leaking the share credential", async () => {
    signIn();
    vi.spyOn(core, "getSummaryRender").mockResolvedValue({
      ...stored,
      format: "png",
      body: null,
      data: png.toString("base64"),
      byteSize: png.length,
    });
    const shared = vi.spyOn(core, "getSharedSummaryRender").mockResolvedValue({
      ...stored,
      format: "png",
      body: null,
      data: png.toString("base64"),
      byteSize: png.length,
    });
    for (const response of [
      await app.request(`/api/summaries/${id}/render?format=png`),
      await send("/api/shared-summary", "POST", { token, format: "png" }),
    ]) {
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      expect(response.headers.get("content-disposition")).not.toContain(token);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
    }
    expect(shared).toHaveBeenCalledWith(token, "png");
    expect(logged.join("\n")).not.toContain(token);
  });
  it("preserves public miss parity and rate limits for every format", async () => {
    const read = vi
      .spyOn(core, "getSharedSummaryRender")
      .mockRejectedValue(new CoreError("not_found", 404));
    for (const format of ["txt", "png"])
      for (const value of [token, "tsum_short", "unknown"]) {
        const response = await send("/api/shared-summary", "POST", {
          token: value,
          format,
        });
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "not_found" });
      }
    read.mockClear();
    shareAllowed = () => false;
    expect(
      (await send("/api/shared-summary", "POST", { token, format: "png" }))
        .status,
    ).toBe(429);
    expect(read).not.toHaveBeenCalled();
  });
});
