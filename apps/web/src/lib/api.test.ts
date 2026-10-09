import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("API throttling", () => {
  it("preserves a server cooldown without exposing the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "rate_limited",
            privateDetail: "not exposed",
          }),
          { status: 429, headers: { "Retry-After": "3600" } },
        ),
      ),
    );
    await expect(
      request("/api/auth/phone-number/send-otp"),
    ).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
      retryAfter: 3600,
    });
  });

  it("ignores an invalid cooldown and keeps the existing generic error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ unexpected: "body" }), {
          status: 503,
          headers: { "Retry-After": "Infinity" },
        }),
      ),
    );
    await expect(request("/api/auth/methods")).rejects.toEqual(
      new ApiError("internal_error", 503),
    );
  });
});
