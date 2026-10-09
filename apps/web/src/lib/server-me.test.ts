import { afterEach, expect, it, vi } from "vitest";
import { readServerMe } from "./server-me";

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
