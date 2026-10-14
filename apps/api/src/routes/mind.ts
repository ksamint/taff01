import { type createCore, userPrincipal } from "@taff/core";
import {
  idSchema,
  mindEdgeInputSchema,
  mindMapQuerySchema,
  mindNodeInputSchema,
  mindNodeUpdateSchema,
  mindSourceInputSchema,
  mindSourceUpdateSchema,
  mindValidationTaskInputSchema,
} from "@taff/schemas";
import type { Hono } from "hono";

type Core = ReturnType<typeof createCore>;
type Env = {
  Variables: { userId: string; sessionId: string; sessionExpiresAt: number };
};

/**
 * Mind map REST (M18, per workspace). Nodes and sources archive through
 * PATCH `{archived}`; edges and node-source links are removed with DELETE,
 * which returns the removed row so undo can re-create it.
 */
export function registerMindRoutes(app: Hono<Env>, core: Core) {
  const me = (c: { get(key: "userId"): string }) =>
    userPrincipal(c.get("userId"));
  app.get("/api/workspaces/:id/mind", async (c) =>
    c.json(
      await core.getMindMap(
        me(c),
        idSchema.parse(c.req.param("id")),
        mindMapQuerySchema.parse(c.req.query()),
      ),
    ),
  );
  app.post("/api/workspaces/:id/mind/nodes", async (c) =>
    c.json(
      await core.createMindNode(
        me(c),
        idSchema.parse(c.req.param("id")),
        mindNodeInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.patch("/api/mind/nodes/:id", async (c) =>
    c.json(
      await core.updateMindNode(
        me(c),
        idSchema.parse(c.req.param("id")),
        mindNodeUpdateSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.post("/api/mind/nodes/:id/task", async (c) =>
    c.json(
      await core.createValidationTask(
        me(c),
        idSchema.parse(c.req.param("id")),
        mindValidationTaskInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.put("/api/mind/nodes/:id/sources/:sourceId", async (c) =>
    c.json(
      await core.linkMindSource(
        me(c),
        idSchema.parse(c.req.param("id")),
        idSchema.parse(c.req.param("sourceId")),
      ),
      201,
    ),
  );
  app.delete("/api/mind/nodes/:id/sources/:sourceId", async (c) =>
    c.json(
      await core.unlinkMindSource(
        me(c),
        idSchema.parse(c.req.param("id")),
        idSchema.parse(c.req.param("sourceId")),
      ),
    ),
  );
  app.post("/api/workspaces/:id/mind/edges", async (c) =>
    c.json(
      await core.createMindEdge(
        me(c),
        idSchema.parse(c.req.param("id")),
        mindEdgeInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.delete("/api/mind/edges/:id", async (c) =>
    c.json(await core.removeMindEdge(me(c), idSchema.parse(c.req.param("id")))),
  );
  app.post("/api/workspaces/:id/mind/sources", async (c) =>
    c.json(
      await core.createMindSource(
        me(c),
        idSchema.parse(c.req.param("id")),
        mindSourceInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.patch("/api/mind/sources/:id", async (c) =>
    c.json(
      await core.updateMindSource(
        me(c),
        idSchema.parse(c.req.param("id")),
        mindSourceUpdateSchema.parse(await c.req.json()),
      ),
    ),
  );
}
