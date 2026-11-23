import { readFileSync } from "node:fs";

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };
type JsonObject = { [key: string]: Json };
type Shape = (value: unknown) => Json;
export type Auth = "public" | "session" | "bearer";

const contracts = (file: string) =>
  Object.keys(
    JSON.parse(
      readFileSync(
        new URL(`../../packages/schemas/generated/${file}`, import.meta.url),
        "utf8",
      ),
    ),
  );
export const restRoutes = new Set(contracts("rest.json"));
export const mcpTools = new Set(contracts("mcp-tools.json"));
export const mcpMethods = new Set([
  "initialize",
  "notifications/initialized",
  "ping",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/read",
  "resources/templates/list",
  "resources/subscribe",
  "resources/unsubscribe",
  "prompts/list",
  "prompts/get",
  "completion/complete",
]);

export function localUrl(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("replay requires a credential-free loopback origin");
  return url;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("expected object");
  return value as Record<string, unknown>;
}

function fields(shapes: Record<string, Shape>): Shape {
  return (value) => {
    const source = record(value);
    const output: JsonObject = {};
    for (const key of Object.keys(shapes)) {
      if (Object.hasOwn(source, key)) output[key] = shapes[key](source[key]);
    }
    // Count unexpected data without writing arbitrary keys or values.
    const unknown = Object.keys(source).filter(
      (key) => !Object.hasOwn(shapes, key),
    ).length;
    if (unknown) output.$unknownFields = unknown;
    return output;
  };
}

const invalidValue = "__invalid_value__";
const boolean: Shape = (value) =>
  typeof value === "boolean" ? value : invalidValue;
const number: Shape = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : invalidValue;
const oneOf =
  (...values: string[]): Shape =>
  (value) =>
    typeof value === "string" && values.includes(value) ? value : invalidValue;
const list =
  (shape: Shape): Shape =>
  (value) =>
    Array.isArray(value) ? value.map(shape) : invalidValue;
const exactUrl =
  (...paths: string[]): Shape =>
  (value) => {
    if (typeof value !== "string") return invalidValue;
    try {
      const url = localUrl(value);
      return !url.search && !url.hash && paths.includes(url.pathname)
        ? `{origin}${url.pathname}`
        : invalidValue;
    } catch {
      return invalidValue;
    }
  };
const scope: Shape = (value) =>
  typeof value === "string" &&
  /^(tasks|calendar|files|inbox|summaries|agents|projects):(read|write|review|manage|attach)$/.test(
    value,
  )
    ? value
    : invalidValue;
const toolName: Shape = (value) =>
  typeof value === "string" && mcpTools.has(value) ? value : invalidValue;
const oauthResource = fields({
  resource: exactUrl("/mcp"),
  authorization_servers: list(exactUrl("/")),
  scopes_supported: list(scope),
  bearer_methods_supported: list(oneOf("header")),
  resource_name: oneOf("Taff"),
});

export const recipes = {
  health: {
    route: "GET /api/health",
    auth: "public",
    body: fields({ status: oneOf("ok") }),
  },
  authMethods: {
    route: "GET /api/auth/methods",
    auth: "public",
    body: fields({ smsEnabled: boolean }),
  },
  oauthServer: {
    route: "GET /.well-known/oauth-authorization-server",
    auth: "public",
    body: fields({
      issuer: exactUrl("/"),
      authorization_endpoint: exactUrl("/oauth/authorize"),
      token_endpoint: exactUrl("/api/oauth/token"),
      registration_endpoint: exactUrl("/api/oauth/register"),
      revocation_endpoint: exactUrl("/api/oauth/revoke"),
      response_types_supported: list(oneOf("code")),
      grant_types_supported: list(oneOf("authorization_code", "refresh_token")),
      code_challenge_methods_supported: list(oneOf("S256")),
      token_endpoint_auth_methods_supported: list(oneOf("none")),
      revocation_endpoint_auth_methods_supported: list(oneOf("none")),
      scopes_supported: list(scope),
      authorization_response_iss_parameter_supported: boolean,
    }),
  },
  oauthResource: {
    route: "GET /.well-known/oauth-protected-resource",
    auth: "public",
    body: oauthResource,
  },
  oauthMcpResource: {
    route: "GET /.well-known/oauth-protected-resource/mcp",
    auth: "public",
    body: oauthResource,
  },
  notifications: {
    route: "GET /api/me/notifications",
    auth: "session",
    body: fields({
      version: number,
      review: boolean,
      block: boolean,
      mention: boolean,
      done: boolean,
      digest: boolean,
      digestAt: oneOf("08:00", "09:00", "18:00"),
      quiet: boolean,
    }),
  },
  mcpCatalog: {
    route: "POST /mcp",
    auth: "bearer",
    body: fields({
      jsonrpc: oneOf("2.0"),
      id: (value) =>
        typeof value === "string" || typeof value === "number"
          ? "{rpc-id}"
          : invalidValue,
      result: fields({
        resultType: oneOf("complete"),
        ttlMs: number,
        cacheScope: oneOf("private", "public"),
        _meta: fields({
          "io.modelcontextprotocol/serverInfo": (value) =>
            value && typeof value === "object" && !Array.isArray(value)
              ? "{server-info}"
              : invalidValue,
        }),
        tools: list((value) => {
          const tool = record(value);
          // Only public catalog identifiers and boolean annotations are replayed.
          return {
            name: toolName(tool.name),
            annotations: fields({
              readOnlyHint: boolean,
              destructiveHint: boolean,
              idempotentHint: boolean,
              openWorldHint: boolean,
            })(tool.annotations),
          };
        }),
      }),
    }),
  },
} satisfies Record<string, { route: string; auth: Auth; body: Shape }>;
export type Recipe = keyof typeof recipes;
export const mcpProtocol = "2026-07-28";

const errorBody = fields({
  error: oneOf(
    "invalid_input",
    "unauthorized",
    "forbidden",
    "not_found",
    "conflict",
    "rate_limited",
    "internal_error",
  ),
});

export async function responseBody(
  response: Request | Response,
): Promise<unknown> {
  if (!response.body) throw new Error("response body absent");
  const media = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (media !== "application/json" && media !== "text/event-stream")
    throw new Error("unsupported response media");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  const deadline = AbortSignal.timeout(5000);
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  deadline.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 262_144) throw new Error("oversize response");
      text += decoder.decode(chunk.value, { stream: true });
      if (media === "text/event-stream") {
        const event = /(?:^|\n)data: ([^\r\n]+)\r?\n\r?\n/.exec(text);
        if (event) return JSON.parse(event[1]!);
      }
    }
    if (deadline.aborted) throw new Error("body timed out");
    return JSON.parse(text + decoder.decode());
  } finally {
    deadline.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
  }
}

export async function projectResponse(
  recipe: Recipe,
  response: Response,
): Promise<Json> {
  const body = await responseBody(response);
  return (response.ok ? recipes[recipe].body : errorBody)(body);
}

export function captureSafe(body: Json) {
  if (body === invalidValue) return false;
  if (Array.isArray(body)) return body.every(captureSafe);
  if (body && typeof body === "object")
    return (
      !Object.hasOwn(body, "$unknownFields") &&
      Object.values(body).every(captureSafe)
    );
  return true;
}

export function modernCatalogRequest() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": mcpProtocol,
        "io.modelcontextprotocol/clientInfo": {
          name: "taff-replay",
          version: "1",
        },
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  };
}
