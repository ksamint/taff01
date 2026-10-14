import { type createCore, userPrincipal } from "@taff/core";
import { graphQuerySchema, idSchema } from "@taff/schemas";
import type { Hono } from "hono";

type Core = ReturnType<typeof createCore>;
type Env = {
  Variables: { userId: string; sessionId: string; sessionExpiresAt: number };
};

/** Relations graph REST (M16). Mounted after the session middleware. */
export function registerRelationRoutes(app: Hono<Env>, core: Core) {
  app.get("/api/workspaces/:id/graph", async (c) => {
    const { projectId, layers, ...rest } = c.req.query();
    const query = graphQuerySchema.parse({
      ...rest,
      ...(projectId === undefined ? {} : { projectId }),
      ...(layers === undefined
        ? {}
        : { layers: layers === "" ? [] : layers.split(",") }),
    });
    return c.json(
      await core.relationGraph(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        query,
      ),
    );
  });
}
