import { createHash } from "node:crypto";
import { type createCore, userPrincipal } from "@taff/core";
import {
  aiSettingsInputSchema,
  askInputSchema,
  briefQuerySchema,
  idSchema,
  suggestionDecisionSchema,
  suggestionFilterSchema,
  suggestionInputSchema,
} from "@taff/schemas";
import type { Hono } from "hono";
import type { RateLimiter } from "../rate-limit";

type Core = ReturnType<typeof createCore>;
type Env = {
  Variables: { userId: string; sessionId: string; sessionExpiresAt: number };
};

/**
 * Brief, Ask taff, suggestions and the model-path switch (M17). Mounted
 * after the session middleware. People and agents propose through the same
 * core operation; people also list, apply and dismiss proposals here.
 */
export function registerAssistantRoutes(
  app: Hono<Env>,
  core: Core,
  askLimiter: RateLimiter,
) {
  app.get("/api/brief", async (c) =>
    c.json(
      await core.getBrief(
        userPrincipal(c.get("userId")),
        briefQuerySchema.parse(c.req.query()),
        { labels: true },
      ),
    ),
  );
  app.post("/api/ask", async (c) => {
    const body = askInputSchema.parse(await c.req.json());
    // Per person, counted in Valkey; a failed count refuses (fail closed).
    const key = `ask:${createHash("sha256").update(c.get("userId")).digest("hex")}`;
    try {
      const hit = await askLimiter.hit(key);
      if (!hit.allowed) {
        c.header("Retry-After", "60");
        return c.json({ error: "rate_limited" }, 429);
      }
    } catch {
      return c.json({ error: "internal_error" }, 503);
    }
    c.header("Cache-Control", "private, no-store");
    return c.json(
      await core.ask(userPrincipal(c.get("userId")), body, { labels: true }),
    );
  });
  app.post("/api/suggestions", async (c) =>
    c.json(
      await core.createSuggestion(
        userPrincipal(c.get("userId")),
        suggestionInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.get("/api/workspaces/:id/suggestions", async (c) =>
    c.json(
      await core.listSuggestions(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        suggestionFilterSchema.parse(c.req.query()),
      ),
    ),
  );
  app.post("/api/suggestions/:id/apply", async (c) =>
    c.json(
      await core.applySuggestion(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        suggestionDecisionSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.post("/api/suggestions/:id/undo", async (c) =>
    c.json(
      await core.undoSuggestion(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        suggestionDecisionSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.post("/api/suggestions/:id/dismiss", async (c) =>
    c.json(
      await core.dismissSuggestion(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        suggestionDecisionSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.get("/api/workspaces/:id/ai", async (c) =>
    c.json(
      await core.getAiSettings(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.patch("/api/workspaces/:id/ai", async (c) =>
    c.json(
      await core.setAiSettings(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        aiSettingsInputSchema.parse(await c.req.json()),
      ),
    ),
  );
}
