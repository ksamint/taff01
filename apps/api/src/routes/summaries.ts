import { createHash } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { type createCore, userPrincipal } from "@taff/core";
import {
  audienceRecipientInputSchema,
  audienceRecipientUpdateSchema,
  audienceTagInputSchema,
  audienceTagUpdateSchema,
  dailySummaryListQuerySchema,
  idSchema,
  projectAudienceTagsInputSchema,
  sharedSummaryRequestSchema,
  summaryPreviewInputSchema,
  summaryShareInputSchema,
  workspaceQuerySchema,
} from "@taff/schemas";
import type { Context, Hono } from "hono";
import type { AppEnv } from "../app";
import type { RateLimiter } from "../rate-limit";

type Core = ReturnType<typeof createCore>;
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/**
 * REST adapter for shareholder summaries (ADR 0027): validation and the
 * session principal, nothing more. Every rule is in core's `can()`.
 */
export function registerSummaryRoutes(app: Hono<AppEnv>, core: Core) {
  const me = (c: Context<AppEnv>) => userPrincipal(c.get("userId"));
  const id = (c: Context<AppEnv>) => idSchema.parse(c.req.param("id"));

  app.get("/api/workspaces/:id/audience-tags", async (c) =>
    c.json(await core.listAudienceTags(me(c), id(c))),
  );
  app.post("/api/workspaces/:id/audience-tags", async (c) =>
    c.json(
      await core.createAudienceTag(
        me(c),
        id(c),
        audienceTagInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.patch("/api/audience-tags/:id", async (c) =>
    c.json(
      await core.updateAudienceTag(
        me(c),
        id(c),
        audienceTagUpdateSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.get("/api/audience-tags/:id/recipients", async (c) =>
    c.json(await core.listAudienceRecipients(me(c), id(c))),
  );
  app.post("/api/audience-tags/:id/recipients", async (c) =>
    c.json(
      await core.createAudienceRecipient(
        me(c),
        id(c),
        audienceRecipientInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.patch("/api/audience-recipients/:id", async (c) =>
    c.json(
      await core.updateAudienceRecipient(
        me(c),
        id(c),
        audienceRecipientUpdateSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.get("/api/projects/:id/audience-tags", async (c) =>
    c.json(await core.listProjectAudienceTags(me(c), id(c))),
  );
  app.put("/api/projects/:id/audience-tags", async (c) =>
    c.json(
      await core.setProjectAudienceTags(
        me(c),
        id(c),
        projectAudienceTagsInputSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.get("/api/summaries", async (c) => {
    const { workspaceId, ...rest } = c.req.query();
    const workspace = workspaceQuerySchema.parse({ workspaceId });
    return c.json(
      await core.listDailySummaries(
        me(c),
        workspace.workspaceId,
        dailySummaryListQuerySchema.parse(rest),
      ),
    );
  });
  // Registered before /:id so "preview" is never read as a summary id.
  app.post("/api/summaries/preview", async (c) =>
    c.json(
      await core.previewDailySummary(
        me(c),
        summaryPreviewInputSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.get("/api/summaries/:id", async (c) =>
    c.json(await core.getDailySummary(me(c), id(c))),
  );
  app.get("/api/summaries/:id/shares", async (c) =>
    c.json(await core.listSummaryShares(me(c), id(c))),
  );
  app.post("/api/summaries/:id/shares", async (c) => {
    c.header("Cache-Control", "private, no-store");
    return c.json(
      await core.createSummaryShare(
        me(c),
        id(c),
        summaryShareInputSchema.parse(await c.req.json()),
      ),
      201,
    );
  });
  app.delete("/api/summary-shares/:id", async (c) =>
    c.json(await core.revokeSummaryShare(me(c), id(c))),
  );
}

/**
 * The one public route: a share link's page posts its token here. The token
 * travels in the body, never in an API path, so request logs and error logs
 * never carry it. Two Valkey counters (client address, token hash) are hit
 * before any database read; a failed count denies.
 */
export function registerPublicSummaryRoutes(
  app: Hono<AppEnv>,
  core: Core,
  limiter: RateLimiter,
) {
  app.post("/api/shared-summary", async (c) => {
    c.header("Cache-Control", "private, no-store");
    c.header("X-Robots-Tag", "noindex, nofollow");
    c.header("Referrer-Policy", "no-referrer");
    const { token } = sharedSummaryRequestSchema.parse(await c.req.json());
    let peer = "unknown";
    try {
      peer = getConnInfo(c).remote.address ?? peer;
    } catch {
      /* In-process adapters have no socket. */
    }
    const deny = { allowed: false, count: 0 };
    const byPeer = await limiter
      .hit(`share:peer:${sha256(peer)}`)
      .catch(() => deny);
    if (!byPeer.allowed) return c.json({ error: "rate_limited" }, 429);
    const byToken = await limiter
      .hit(`share:token:${sha256(token)}`)
      .catch(() => deny);
    if (!byToken.allowed) return c.json({ error: "rate_limited" }, 429);
    return c.json(await core.readSharedSummary(token));
  });
}
