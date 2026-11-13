import { projects, type Transaction, tasks, workspaces } from "@taff/db";
import {
  type CreateTask,
  idSchema,
  indicatorTaskTitle,
  OPERATION_TEMPLATES,
  type OperationTemplateKey,
  type OperationTemplateResult,
  operationTemplateKeySchema,
  type Task,
} from "@taff/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import type { Action, Actor, Resource } from "./permissions";

type Dependencies = {
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  requireMember(
    q: Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
  insertTask(tx: Transaction, p: Principal, body: CreateTask): Promise<Task>;
};

/** Applies a sector template to a workspace (spec OT-1). Idempotent by name. */
export function createOperationTemplateOperations({
  mutation,
  requireMember,
  insertTask,
}: Dependencies) {
  async function applyOperationTemplate(
    p: Principal,
    workspaceId: string,
    template: OperationTemplateKey,
  ): Promise<OperationTemplateResult> {
    const w = idSchema.safeParse(workspaceId);
    const key = operationTemplateKeySchema.safeParse(template);
    if (!w.success || !key.success) throw new CoreError("invalid_input", 400);
    // Agents create projects only through the confirmed operation (ADR 0025).
    if (p.kind !== "user") throw new CoreError("forbidden", 403);
    return mutation(p, async (tx) => {
      const actor = await requireMember(tx, p, w.data, "project:manage");
      // Serializes concurrent applies so neither duplicates a sector.
      const [row] = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(and(eq(workspaces.id, w.data), isNull(workspaces.archivedAt)))
        .for("update");
      if (!row) throw new CoreError("not_found", 404);
      let createdProjects = 0;
      let createdTasks = 0;
      for (const sector of OPERATION_TEMPLATES[key.data]) {
        let [project] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(
            and(
              eq(projects.workspaceId, w.data),
              eq(projects.name, sector.project),
              eq(projects.archived, false),
            ),
          )
          .orderBy(projects.createdAt, projects.id)
          .limit(1);
        if (!project) {
          [project] = await tx
            .insert(projects)
            .values({
              workspaceId: w.data,
              name: sector.project,
              // One transaction shares now(); keep the template's sector order.
              createdAt: sql`clock_timestamp()`,
            })
            .returning({ id: projects.id });
          createdProjects++;
        }
        for (const indicator of [sector.leading, sector.result]) {
          const title = indicatorTaskTitle(indicator);
          const [existing] = await tx
            .select({ id: tasks.id })
            .from(tasks)
            .where(
              and(
                eq(tasks.workspaceId, w.data),
                eq(tasks.projectId, project.id),
                eq(tasks.title, title),
                isNull(tasks.archivedAt),
              ),
            )
            .limit(1);
          if (existing) continue;
          await insertTask(tx, p, {
            workspaceId: w.data,
            projectId: project.id,
            title,
            labels: [sector.label, indicator.label],
            ownerId: actor.id,
            workerId: null,
          });
          createdTasks++;
        }
      }
      return { template: key.data, createdProjects, createdTasks };
    });
  }
  return { applyOperationTemplate };
}
