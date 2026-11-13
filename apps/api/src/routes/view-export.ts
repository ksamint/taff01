import { createHash } from "node:crypto";
import { type createCore, userPrincipal } from "@taff/core";
import { idSchema, viewExportQuerySchema } from "@taff/schemas";
import type { Hono } from "hono";
import type { AppEnv } from "../app";
import type { RateLimiter } from "../rate-limit";

type Core = ReturnType<typeof createCore>;
const RENDER_TIMEOUT_MS = 10_000;

/**
 * Exported view images (ADR 0031): core builds the watermarked layout with
 * the caller's own rights; the stateless internal renderer draws it. Core
 * audits snapshot metadata; image binaries are not stored.
 */
export function registerViewExportRoutes(
  app: Hono<AppEnv>,
  core: Core,
  limiter: RateLimiter,
  renderUrl: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  app.get("/api/workspaces/:id/view-image", async (c) => {
    c.header("Cache-Control", "private, no-store");
    const workspaceId = idSchema.parse(c.req.param("id"));
    const query = viewExportQuerySchema.parse(c.req.query());
    // Per person, counted in Valkey; a failed count refuses (fail closed).
    const key = `view-export:${createHash("sha256").update(c.get("userId")).digest("hex")}`;
    try {
      const hit = await limiter.hit(key);
      if (!hit.allowed) {
        c.header("Retry-After", "60");
        return c.json({ error: "rate_limited" }, 429);
      }
    } catch {
      return c.json({ error: "internal_error" }, 503);
    }
    const input = await core.exportViewImageInput(
      userPrincipal(c.get("userId")),
      workspaceId,
      query,
    );
    if (!renderUrl) return c.json({ error: "render_unavailable" }, 503);
    const { fileName, ...body } = input;
    let response: Response;
    try {
      response = await fetcher(new URL("/render/summary", renderUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
      });
    } catch {
      return c.json({ error: "render_failed" }, 502);
    }
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("image/png")
    )
      return c.json({ error: "render_failed" }, 502);
    return c.body(new Uint8Array(await response.arrayBuffer()), 200, {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Content-Type-Options": "nosniff",
      "X-Taff-Content-Hash": input.contentHash,
    });
  });
}
