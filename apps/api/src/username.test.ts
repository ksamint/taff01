import { createCore } from "@taff/core";
import pino from "pino";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const origin = "https://taff.test";
const core = createCore({
  databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
  authUrl: origin,
  authSecret: "username-test-secret-with-at-least-32-characters",
  tokenPepper: "username-test-pepper-with-16-characters",
});
const app = createApp(core, origin, pino({ enabled: false }), {
  limit: 60,
  hit: async () => ({ allowed: true, count: 1 }),
  close: async () => {},
});
function request(path: string, body: unknown, requestOrigin = origin) {
  return app.request(`/api/auth/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: requestOrigin },
    body: JSON.stringify(body),
  });
}
afterEach(() => vi.restoreAllMocks());
afterAll(() => core.close());

describe("username authentication REST boundary", () => {
  it("rejects unsafe input and foreign origins before the auth handler", async () => {
    const handler = vi.spyOn(core.auth, "handler");
    for (const body of [
      { username: "x", password: "pass12" },
      { username: "bad/name", password: "pass12" },
      { username: "operator", password: "short" },
      { username: "operator", password: "pass12", systemAdmin: true },
      { username: "operator", password: "pass12", userId: "other" },
    ]) {
      expect((await request("sign-in/username", body)).status).toBe(400);
    }
    expect(
      (
        await request(
          "sign-in/username",
          { username: "operator", password: "pass12" },
          "https://foreign.test",
        )
      ).status,
    ).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("preserves the native authentication response and secure cookies", async () => {
    const handler = vi.spyOn(core.auth, "handler").mockResolvedValue(
      Response.json(
        { status: true },
        {
          headers: {
            "Set-Cookie": "session=opaque; Secure; HttpOnly; SameSite=Lax",
          },
        },
      ),
    );
    const response = await request("sign-in/username", {
      username: " op ",
      password: "pass12",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
    expect(response.headers.get("Set-Cookie")).toContain("Secure; HttpOnly");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(handler).toHaveBeenCalledOnce();
    expect(await handler.mock.calls[0]?.[0].clone().json()).toEqual({
      username: "op",
      password: "pass12",
    });
  });

  it("keeps public signup at eight characters and blocks privilege fields", async () => {
    const handler = vi.spyOn(core.auth, "handler");
    const body = { name: "Operator", email: "operator@example.com" };
    for (const extra of [
      { password: "pass12", username: "operator" },
      { password: "password123", systemAdmin: true },
      { password: "password123", id: "provisioned-org-admin:spoofed" },
    ]) {
      expect(
        (await request("sign-up/email", { ...body, ...extra })).status,
      ).toBe(400);
    }
    expect(handler).not.toHaveBeenCalled();
  });
});
