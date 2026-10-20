// OAuth 2.1 for MCP (ADR 0022). The public endpoints are cookie-less and
// open to any origin, so they are registered before the session, same-origin
// and credentialed-CORS middleware of /api/*; the consent endpoints are not.
import { createHash } from "node:crypto";
import type { Core } from "@taff/core";
import { OAuthError, userPrincipal } from "@taff/core";
import {
  oauthAuthorizeSchema,
  oauthDecisionSchema,
  oauthRegisterSchema,
} from "@taff/schemas";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import type { RateLimiter } from "./rate-limit";

const PUBLIC_PATHS = [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/*",
  "/.well-known/oauth-authorization-server",
  "/api/oauth/register",
  "/api/oauth/token",
  "/api/oauth/revoke",
];

function oauthError(c: Context, error: OAuthError) {
  c.header("Cache-Control", "no-store");
  return c.json(
    { error: error.error, error_description: error.description },
    error.status as 400 | 401,
  );
}
/** Form-encoded per RFC 6749, JSON tolerated; string fields only. */
async function formFields(c: Context): Promise<Record<string, string>> {
  const type = c.req.header("content-type") ?? "";
  const raw: Record<string, unknown> = type.includes("application/json")
    ? await c.req.json().catch(() => ({}))
    : await c.req.parseBody().catch(() => ({}));
  return Object.fromEntries(
    Object.entries(raw ?? {}).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}
async function limited(limiter: RateLimiter, key: string) {
  try {
    return !(await limiter.hit(key)).allowed;
  } catch {
    return true;
  }
}

export function registerPublicOAuthRoutes(
  app: Hono<any>,
  core: Core,
  limiter: RateLimiter,
) {
  const meta = core.oauthMetadata();
  for (const path of PUBLIC_PATHS) {
    app.use(path, cors({ origin: "*", maxAge: 600 }));
    app.use(
      path,
      bodyLimit({
        maxSize: 16_384,
        onError: (c) =>
          c.json(
            { error: "invalid_request", error_description: "Too large" },
            413,
          ),
      }),
    );
  }
  const resource = (c: Context) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(meta.protectedResource);
  };
  app.get("/.well-known/oauth-protected-resource", resource);
  app.get("/.well-known/oauth-protected-resource/mcp", resource);
  app.get("/.well-known/oauth-authorization-server", (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(meta.authorizationServer);
  });

  app.post("/api/oauth/register", async (c) => {
    // Registration is open (RFC 7591); one global budget bounds abuse.
    if (await limited(limiter, "oauth:register")) {
      c.header("Retry-After", "60");
      return c.json({ error: "rate_limited" }, 429);
    }
    try {
      const body = await c.req.json().catch(() => null);
      const client = await core.oauth.registerClient(
        oauthRegisterSchema.parse(body),
      );
      c.header("Cache-Control", "no-store");
      return c.json(client, 201);
    } catch (error) {
      if (error instanceof OAuthError) return oauthError(c, error);
      const redirect = (error as { issues?: { path?: unknown[] }[] }).issues
        ?.flatMap((issue) => issue.path ?? [])
        .includes("redirect_uris");
      return oauthError(
        c,
        new OAuthError(
          redirect ? "invalid_redirect_uri" : "invalid_client_metadata",
          redirect ? "Unsupported redirect URI" : "Malformed client metadata",
        ),
      );
    }
  });

  app.post("/api/oauth/token", async (c) => {
    const fields = await formFields(c);
    const key = createHash("sha256")
      .update(fields.client_id ?? "")
      .digest("hex");
    if (await limited(limiter, `oauth:token:${key}`)) {
      c.header("Retry-After", "60");
      return c.json({ error: "rate_limited" }, 429);
    }
    if (!["authorization_code", "refresh_token"].includes(fields.grant_type))
      return oauthError(
        c,
        new OAuthError(
          fields.grant_type ? "unsupported_grant_type" : "invalid_request",
          "Use authorization_code or refresh_token",
        ),
      );
    try {
      const issued = await core.oauth.token(
        fields as unknown as Parameters<Core["oauth"]["token"]>[0],
      );
      c.header("Cache-Control", "no-store");
      c.header("Pragma", "no-cache");
      return c.json(issued);
    } catch (error) {
      if (error instanceof OAuthError) return oauthError(c, error);
      throw error;
    }
  });

  app.post("/api/oauth/revoke", async (c) => {
    // RFC 7009 §2.2: an unknown or already revoked token is still a 200.
    await core.oauth.revoke(await formFields(c));
    c.header("Cache-Control", "no-store");
    return c.body(null, 200);
  });
}

/** Consent screen reads and decisions: a signed-in person, same origin. */
export function registerConsentRoutes(app: Hono<any>, core: Core) {
  app.get("/api/oauth/consent", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(
      await core.oauth.getConsent(
        userPrincipal(c.get("userId")),
        oauthAuthorizeSchema.parse(c.req.query()),
      ),
    );
  });
  app.post("/api/oauth/consent", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json(
      await core.oauth.decide(
        userPrincipal(c.get("userId")),
        oauthDecisionSchema.parse(await c.req.json()),
      ),
    );
  });
}
