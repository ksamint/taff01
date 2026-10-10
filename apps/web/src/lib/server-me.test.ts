import { afterEach, expect, it, vi } from "vitest";
import { readServerMe, readServerToday } from "./server-me";

const identity = {
  user: {
    id: "alice",
    name: "Alice",
    email: "alice@example.test",
    locale: "zh-HK",
    tz: "Asia/Hong_Kong",
  },
  workspaces: [],
};
afterEach(() => vi.unstubAllGlobals());

it("reads only the nonrenewing bootstrap endpoint without caching or following redirects", async () => {
  const fetcher = vi.fn(async (_url: URL, _options: RequestInit) =>
    Response.json(identity),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await readServerMe("test-session-cookie", "http://api:3001")).toEqual(
    identity,
  );
  const [url, options] = fetcher.mock.calls[0];
  expect(url.href).toBe("http://api:3001/api/bootstrap");
  expect(options).toMatchObject({
    headers: { Cookie: "test-session-cookie" },
    cache: "no-store",
    redirect: "error",
  });
  expect(options.signal).toBeInstanceOf(AbortSignal);
});

it("leaves anonymous pages local and retains the client fallback when the backend is unavailable", async () => {
  const fetcher = vi.fn(async () => {
    throw new Error("unavailable");
  });
  vi.stubGlobal("fetch", fetcher);
  expect(await readServerMe("", "http://api:3001")).toBeNull();
  expect(await readServerMe("session", undefined)).toBeUndefined();
  expect(fetcher).not.toHaveBeenCalled();
  expect(await readServerMe("session", "http://api:3001")).toBeUndefined();
});

it("distinguishes an unauthorized cookie from an invalid or failed bootstrap", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
  expect(await readServerMe("session", "http://api:3001")).toBeNull();
  fetcher.mockResolvedValueOnce(new Response(null, { status: 500 }));
  expect(await readServerMe("session", "http://api:3001")).toBeUndefined();
  fetcher.mockResolvedValueOnce(Response.json({ user: { id: "untrusted" } }));
  expect(await readServerMe("session", "http://api:3001")).toBeUndefined();
});

it("reads Today through the nonrenewing endpoint and forwards only a validated presentation choice", async () => {
  const fetcher = vi.fn(async (_url: URL, _options: RequestInit) =>
    Response.json({ me: identity, today: null }),
  );
  vi.stubGlobal("fetch", fetcher);
  const choice = {
    preferredUserId: "alice",
    workspaceId: "11111111-1111-4111-8111-111111111111",
  };
  expect(
    await readServerToday(
      "session",
      "http://api:3001",
      encodeURIComponent(JSON.stringify(choice)),
    ),
  ).toEqual({ me: identity, today: null });
  const [url, options] = fetcher.mock.calls[0];
  expect(url.pathname).toBe("/api/bootstrap/today");
  expect(Object.fromEntries(url.searchParams)).toEqual(choice);
  expect(options).toMatchObject({
    headers: { Cookie: "session" },
    cache: "no-store",
    redirect: "error",
  });
  for (const invalid of [
    "%bad",
    "{}",
    JSON.stringify({ workspaceId: "invalid" }),
    JSON.stringify({ preferredUserId: "alice", secret: "never-forward" }),
  ]) {
    await readServerToday("session", "http://api:3001", invalid);
    expect(fetcher.mock.calls.at(-1)?.[0].searchParams.has("secret")).toBe(
      false,
    );
    expect(fetcher.mock.calls.at(-1)?.[0].searchParams.has("workspaceId")).toBe(
      false,
    );
  }
});

it("keeps Today anonymous, unavailable and malformed reads on the existing fallback path", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await readServerToday("", "http://api:3001")).toBeNull();
  expect(await readServerToday("session", undefined)).toBeUndefined();
  expect(fetcher).not.toHaveBeenCalled();
  for (const response of [
    new Response(null, { status: 500 }),
    Response.json({ me: identity, today: { workspaceId: "foreign" } }),
    Response.json({ me: { user: { id: "untrusted" } }, today: null }),
  ]) {
    fetcher.mockResolvedValueOnce(response);
    expect(await readServerToday("session", "http://api:3001")).toBeUndefined();
  }
  fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
  expect(await readServerToday("session", "http://api:3001")).toBeNull();
});

it.each(["old-api", "large-workspace"])(
  "retains the Me bootstrap for %s without seeding a partial collection",
  async (caseName) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockResolvedValueOnce(
      caseName === "old-api"
        ? new Response(null, { status: 404 })
        : new Response(" ".repeat(2_000_001)),
    );
    fetcher.mockResolvedValueOnce(Response.json(identity));
    expect(await readServerToday("session", "http://api:3001")).toEqual({
      me: identity,
      today: null,
    });
    expect(fetcher.mock.calls[1][0].pathname).toBe("/api/bootstrap");
  },
);
