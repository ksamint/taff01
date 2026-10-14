/**
 * Optional model path for Ask taff (D6, ADR 0016). A provider-neutral
 * adapter for any OpenAI-compatible `POST {base}/chat/completions` API, with
 * plain `fetch` and no SDK. It exists only when AI_BASE_URL, AI_API_KEY and
 * AI_MODEL are all set; core also requires the workspace's `ai_enabled`.
 * Production keeps the variables unset, so no workspace data leaves.
 *
 * The key lives in this closure only: it is never returned, logged or put in
 * an error message.
 */
export type AiConfig = { baseUrl: string; apiKey: string; model: string };
export type AiProvider = {
  readonly model: string;
  /** The model's reply, or null on any failure (callers fall back to rules). */
  complete(input: { system: string; user: string }): Promise<string | null>;
};
type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** All three variables, trimmed and non-empty, and an http(s) base URL. */
export function aiConfigFromEnv(
  env: Record<string, string | undefined>,
): AiConfig | null {
  const baseUrl = env.AI_BASE_URL?.trim();
  const apiKey = env.AI_API_KEY?.trim();
  const model = env.AI_MODEL?.trim();
  if (!baseUrl || !apiKey || !model) return null;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model };
}

const MAX_REPLY = 2000;

export function createAiProvider(
  config: AiConfig,
  fetchImpl: Fetch = (input, init) => fetch(input, init),
  timeoutMs = 15_000,
): AiProvider {
  const { baseUrl, apiKey, model } = config;
  return {
    model,
    async complete({ system, user }) {
      try {
        const response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 400,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        });
        if (!response.ok) return null;
        const body = (await response.json()) as {
          choices?: { message?: { content?: unknown } }[];
        };
        const content = body.choices?.[0]?.message?.content;
        if (typeof content !== "string" || !content.trim()) return null;
        return content.trim().slice(0, MAX_REPLY);
      } catch {
        // Network, timeout or parse failure: the error may echo request
        // details, so it is dropped rather than rethrown or logged.
        return null;
      }
    },
  };
}

export function createAiProviderFromEnv(
  env: Record<string, string | undefined>,
  fetchImpl?: Fetch,
): AiProvider | undefined {
  const config = aiConfigFromEnv(env);
  return config ? createAiProvider(config, fetchImpl) : undefined;
}
