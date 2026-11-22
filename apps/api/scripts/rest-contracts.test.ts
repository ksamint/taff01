import { readFileSync } from "node:fs";
import pino from "pino";
import { expect, test } from "vitest";
import { createApp } from "../src/app";
import { restJsonSchema } from "./rest-contracts";

test("every registered REST endpoint has a current shared schema", () => {
  const origin = "http://localhost:3000";
  const core = {
    oauthMetadata: () => ({
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
    }),
  } as Parameters<typeof createApp>[0];
  const limiter = {} as Parameters<typeof createApp>[3];
  const app = createApp(core, origin, pino({ enabled: false }), limiter);
  const routes = new Set(
    app.routes
      // Hono uses ALL for middleware. /mcp is documented by mcp-tools.json.
      .filter(({ method }) => method !== "ALL")
      .map(({ method, path }) => `${method} ${path}`),
  );
  const schemas = restJsonSchema();
  expect(Object.keys(schemas).sort()).toEqual([...routes].sort());
  const committed = readFileSync(
    new URL("../../../packages/schemas/generated/rest.json", import.meta.url),
    "utf8",
  );
  expect(committed).toBe(`${JSON.stringify(schemas, null, 2)}\n`);
});
