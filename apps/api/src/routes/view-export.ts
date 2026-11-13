import { CoreError, type createCore, userPrincipal } from "@taff/core";
import { idSchema, parseViewExportHttpQuery } from "@taff/schemas";
import type { Hono } from "hono";
import type { AppEnv } from "../app";
import type { RateLimiter } from "../rate-limit";
import { renderViewImage } from "../view-image";

type Core = ReturnType<typeof createCore>;

export function registerViewExportRoutes(
  app: Hono<AppEnv>,
  core: Core,
  limiter: RateLimiter,
  renderUrl: string | undefined,
  fetcher: typeof fetch = fetch,
) {
  app.get("/api/workspaces/:id/view-image", async (c) => {
    c.header("Cache-Control", "private, no-store");
    try {
      const image = await renderViewImage(
        core,
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        parseViewExportHttpQuery(c.req.query()),
        "web",
        { exportRateLimiter: limiter, renderUrl, renderFetch: fetcher },
      );
      return c.body(image.data, 200, {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${image.fileName}"`,
        "X-Content-Type-Options": "nosniff",
        "X-Taff-Content-Hash": image.contentHash,
      });
    } catch (error) {
      if (error instanceof CoreError && error.status === 429)
        c.header("Retry-After", "60");
      throw error;
    }
  });
}
