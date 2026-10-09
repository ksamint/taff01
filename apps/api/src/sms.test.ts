import { createCore } from "@taff/core";
import pino from "pino";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const core = createCore({
  databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
  authUrl: "https://taff.test",
  authSecret: "sms-adapter-test-secret-with-at-least-32-characters",
  tokenPepper: "sms-adapter-test-pepper",
});
const app = createApp(core, "https://taff.test", pino({ enabled: false }), {
  limit: 60,
  hit: async () => ({ allowed: true, count: 1 }),
  close: async () => {},
});
const phoneNumber = "+8613800000000";
const request = (
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  app.request(`/api/auth/phone-number/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://taff.test",
      ...headers,
    },
    body: JSON.stringify(body),
  });
afterEach(() => vi.restoreAllMocks());
afterAll(() => core.close());
describe("public SMS authentication adapter", () => {
  it("normalizes Better Auth cooldown headers and derives the same socket peer despite forwarded browser IPs", async () => {
    const handler = vi
      .spyOn(core, "handlePhoneAuth")
      .mockResolvedValue(
        Response.json({}, { status: 429, headers: { "X-Retry-After": "60" } }),
      );
    for (const forwarded of ["198.51.100.1", "198.51.100.2"]) {
      const response = await app.request(
        "/api/auth/phone-number/send-otp",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://taff.test",
            "X-Forwarded-For": forwarded,
          },
          body: JSON.stringify({ phoneNumber }),
        },
        { incoming: { socket: { remoteAddress: "192.0.2.1" } } },
      );
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("60");
    }
    expect(handler.mock.calls.map((call) => call[1])).toEqual([
      "192.0.2.1",
      "192.0.2.1",
    ]);
  });
  it("reports optional availability without requiring a session and disables safely", async () => {
    const response = await app.request("/api/auth/methods");
    expect(await response.json()).toEqual({ smsEnabled: false });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await request("send-otp", { phoneNumber })).status).toBe(503);
  });
  it("rejects foreign origins, nonmainland numbers and unsafe native plugin fields before core", async () => {
    const handler = vi.spyOn(core, "handlePhoneAuth");
    expect(
      (
        await request(
          "send-otp",
          { phoneNumber },
          { Origin: "https://foreign.test" },
        )
      ).status,
    ).toBe(403);
    for (const body of [
      { phoneNumber: "+85212345678" },
      { phoneNumber, code: "123456", updatePhoneNumber: true },
      { phoneNumber, code: "123456", disableSession: true },
    ])
      expect((await request("verify", body)).status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
    expect((await request("update-phone-number", { phoneNumber })).status).toBe(
      401,
    );
  });
  it("forwards secure session cookies but no native user, phone or session-token JSON", async () => {
    const handler = vi.spyOn(core, "handlePhoneAuth").mockResolvedValue(
      Response.json(
        { token: "never-forward", user: { phoneNumber } },
        {
          headers: {
            "Set-Cookie": "session=opaque; Secure; HttpOnly; SameSite=Lax",
          },
        },
      ),
    );
    const response = await request(
      "verify",
      { phoneNumber, code: "123456" },
      { "X-Forwarded-For": "spoofed", "X-Taff-Sms-Peer": "spoofed" },
    );
    expect(await response.json()).toEqual({ status: true });
    expect(response.headers.get("Set-Cookie")).toContain("Secure; HttpOnly");
    expect(handler.mock.calls[0][1]).toBe("unknown");
  });
  it("maps rate, provider and OTP errors without exposing provider details", async () => {
    const handler = vi.spyOn(core, "handlePhoneAuth");
    for (const [status, expected] of [
      [429, "rate_limited"],
      [503, "sms_unavailable"],
      [400, "sms_invalid_code"],
    ] as const) {
      handler.mockResolvedValueOnce(
        Response.json(
          { message: "private diagnostic" },
          { status, headers: { "Retry-After": "60" } },
        ),
      );
      const response = await request("verify", { phoneNumber, code: "123456" });
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: expected });
      expect(response.headers.get("Retry-After")).toBe("60");
    }
  });
});
