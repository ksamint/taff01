import { describe, expect, it, vi } from "vitest";
import {
  aiConfigFromEnv,
  createAiProvider,
  createAiProviderFromEnv,
} from "./ai-provider";

const KEY = "sk-test-never-shown-0123456789";
const env = {
  AI_BASE_URL: "https://models.example.test/v1/",
  AI_API_KEY: KEY,
  AI_MODEL: "example-model",
};
const reply = (content: unknown, status = 200) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("AI provider gating (D6)", () => {
  it.each([
    ["nothing set", {}],
    ["no key", { ...env, AI_API_KEY: "" }],
    ["no base URL", { ...env, AI_BASE_URL: undefined }],
    ["no model", { ...env, AI_MODEL: "   " }],
    ["a non-http base URL", { ...env, AI_BASE_URL: "file:///etc/passwd" }],
    ["a malformed base URL", { ...env, AI_BASE_URL: "not a url" }],
  ])("builds no provider with %s, so nothing can be sent", (_, values) => {
    const fetch = vi.fn();
    expect(aiConfigFromEnv(values)).toBeNull();
    expect(createAiProviderFromEnv(values, fetch)).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("builds a provider only when all three are set", () => {
    expect(aiConfigFromEnv(env)).toEqual({
      baseUrl: "https://models.example.test/v1",
      apiKey: KEY,
      model: "example-model",
    });
  });
});

describe("OpenAI-compatible adapter", () => {
  it("posts one chat completion with the bearer key and returns the reply", async () => {
    const fetch = vi.fn(async () => reply("  Checkout v2 is at medium risk. "));
    const provider = createAiProvider(
      aiConfigFromEnv(env) as NonNullable<ReturnType<typeof aiConfigFromEnv>>,
      fetch,
    );
    expect(provider.model).toBe("example-model");
    expect(JSON.stringify(provider)).not.toContain(KEY);
    await expect(
      provider.complete({ system: "rules", user: '{"question":"risk?"}' }),
    ).resolves.toBe("Checkout v2 is at medium risk.");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://models.example.test/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${KEY}`,
    );
    expect(JSON.parse(init.body as string)).toEqual({
      model: "example-model",
      temperature: 0.2,
      max_tokens: 400,
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: '{"question":"risk?"}' },
      ],
    });
  });
  it.each([
    ["an error status", async () => reply("nope", 401)],
    ["an empty reply", async () => reply("   ")],
    ["a non-text reply", async () => reply({ text: "x" })],
    ["invalid JSON", async () => new Response("<html>", { status: 200 })],
    [
      "a network error that echoes the key",
      async () => {
        throw new Error(`connect failed with Bearer ${KEY}`);
      },
    ],
  ])("returns null on %s without surfacing the key", async (_, impl) => {
    const provider = createAiProvider(
      { baseUrl: "https://x.test", apiKey: KEY, model: "m" },
      vi.fn(impl),
    );
    await expect(provider.complete({ system: "s", user: "u" })).resolves.toBe(
      null,
    );
  });
  it("bounds a long reply", async () => {
    const provider = createAiProvider(
      { baseUrl: "https://x.test", apiKey: KEY, model: "m" },
      vi.fn(async () => reply("a".repeat(5000))),
    );
    expect(await provider.complete({ system: "s", user: "u" })).toHaveLength(
      2000,
    );
  });
});
