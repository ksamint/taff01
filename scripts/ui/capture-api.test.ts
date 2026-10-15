import { createServer } from "node:http";
import { request } from "@playwright/test";
import { expect, test } from "vitest";
import { captureRead } from "./prepare-view";

test("date reads work in a real API context without baseURL", async () => {
  const observed: {
    method: string | undefined;
    path: string | undefined;
    proof: string | string[] | undefined;
  }[] = [];
  const server = createServer((req, res) => {
    observed.push({
      method: req.method,
      path: req.url,
      proof: req.headers["x-capture-proof"],
    });
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ today: "2026-10-08" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local listener");
  const origin = `http://127.0.0.1:${address.port}`;
  const api = await request.newContext({
    extraHTTPHeaders: { "x-capture-proof": "baseURLless" },
  });
  try {
    // This is the actual standalone-CLI failure, before the helper resolves it.
    await expect(api.get("/api/brief?scope=all")).rejects.toThrow(
      "Invalid URL",
    );
    const page = { request: api, url: () => `${origin}/me?tab=brief` };
    const brief = await captureRead(page, "/api/brief?scope=all");
    expect(brief.status()).toBe(200);
    expect(await brief.json()).toEqual({ today: "2026-10-08" });
    const projectId = "11111111-1111-4111-8111-111111111111";
    const timeline = await captureRead(
      {
        request: api,
        url: () => `${origin}/projects/${projectId}?view=timeline`,
      },
      `/api/projects/${projectId}/timeline`,
    );
    expect(timeline.status()).toBe(200);
    expect(await timeline.json()).toEqual({ today: "2026-10-08" });
    expect(observed).toEqual([
      { method: "GET", path: "/api/brief?scope=all", proof: "baseURLless" },
      {
        method: "GET",
        path: `/api/projects/${projectId}/timeline`,
        proof: "baseURLless",
      },
    ]);
  } finally {
    await api.dispose();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
