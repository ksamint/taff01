import { type createCore, userPrincipal } from "@taff/core";
import {
  dependencyInputSchema,
  idSchema,
  milestoneInputSchema,
  milestoneUpdateSchema,
  paymentInputSchema,
  taskPlanInputSchema,
} from "@taff/schemas";
import type { Hono } from "hono";

type Core = ReturnType<typeof createCore>;
/** The same environment as app.ts: the session middleware sets `userId`. */
type Env = {
  Variables: { userId: string; sessionId: string; sessionExpiresAt: number };
};

/**
 * Timeline REST (ADR 0015). Mounted after the session middleware, so every
 * route has a signed-in person; app.ts maps schema and core errors.
 */
export function registerTimelineRoutes(app: Hono<Env>, core: Core) {
  app.get("/api/projects/:id/timeline", async (c) =>
    c.json(
      await core.getTimeline(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.patch("/api/tasks/:id/plan", async (c) =>
    c.json(
      await core.setTaskPlan(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        taskPlanInputSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.get("/api/projects/:id/milestones", async (c) =>
    c.json(
      await core.listMilestones(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.post("/api/projects/:id/milestones", async (c) =>
    c.json(
      await core.createMilestone(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        milestoneInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.patch("/api/milestones/:id", async (c) =>
    c.json(
      await core.updateMilestone(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        milestoneUpdateSchema.parse(await c.req.json()),
      ),
    ),
  );
  // Archives (D4); `?version=` makes it conditional on the current version.
  app.delete("/api/milestones/:id", async (c) => {
    const version = c.req.query("version");
    return c.json(
      await core.archiveMilestone(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        version === undefined ? undefined : Number(version),
      ),
    );
  });
  app.post("/api/dependencies", async (c) =>
    c.json(
      await core.addDependency(
        userPrincipal(c.get("userId")),
        dependencyInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
  app.delete("/api/dependencies/:id", async (c) =>
    c.json(
      await core.removeDependency(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.get("/api/projects/:id/payments", async (c) =>
    c.json(
      await core.listPayments(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
      ),
    ),
  );
  app.post("/api/projects/:id/payments", async (c) =>
    c.json(
      await core.addPayment(
        userPrincipal(c.get("userId")),
        idSchema.parse(c.req.param("id")),
        paymentInputSchema.parse(await c.req.json()),
      ),
      201,
    ),
  );
}
