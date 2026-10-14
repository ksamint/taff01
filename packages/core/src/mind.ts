import {
  type Database,
  mindEdges,
  mindNodeSources,
  mindNodes,
  mindSources,
  type Transaction,
} from "@taff/db";
import {
  type CreateTask,
  createTaskSchema,
  idSchema,
  type MindEdge,
  type MindEdgeInput,
  type MindEdgeUpdate,
  type MindMap,
  type MindMapQuery,
  type MindNode,
  type MindNodeInput,
  type MindNodeSource,
  type MindNodeUpdate,
  type MindSource,
  type MindSourceInput,
  type MindSourceUpdate,
  type MindValidationTaskInput,
  type MindValidationTaskResult,
  mindEdgeInputSchema,
  mindEdgeUpdateSchema,
  mindMapQuerySchema,
  mindNodeInputSchema,
  mindNodeUpdateSchema,
  mindSourceInputSchema,
  mindSourceUpdateSchema,
  mindValidationTaskInputSchema,
  SchemaError,
  type Task,
} from "@taff/schemas";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import { type Action, type Actor, can, type Resource } from "./permissions";
import { zonedInstant } from "./quick-add";

function parse<T>(schema: { parse(v: unknown): T }, v: unknown): T {
  try {
    return schema.parse(v);
  } catch (e) {
    if (e instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw e;
  }
}
const invalid = (): never => {
  throw new CoreError("invalid_input", 400);
};
const conflict = (): never => {
  throw new CoreError("conflict", 409);
};
const notFound = (): never => {
  throw new CoreError("not_found", 404);
};
type NodeRow = typeof mindNodes.$inferSelect;
type SourceRow = typeof mindSources.$inferSelect;
function dtoNode(row: NodeRow): MindNode {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    layer: row.layer,
    angle: Number(row.angle),
    strength: row.strength,
    momentum: row.momentum,
    note: row.note,
    taskId: row.taskId,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function dtoEdge(row: typeof mindEdges.$inferSelect): MindEdge {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    fromNodeId: row.fromNodeId,
    toNodeId: row.toNodeId,
    kind: row.kind as MindEdge["kind"],
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}
function dtoSource(row: SourceRow): MindSource {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    url: row.url,
    note: row.note,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function dtoLink(row: typeof mindNodeSources.$inferSelect): MindNodeSource {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    nodeId: row.nodeId,
    sourceId: row.sourceId,
    createdAt: row.createdAt.toISOString(),
  };
}

type Dependencies = {
  db: Database;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
  zoneOf(
    q: Database | Transaction,
    p: Principal,
    actor: Actor,
  ): Promise<string>;
  insertTask(tx: Transaction, p: Principal, body: CreateTask): Promise<Task>;
};

/**
 * Mind map (M18). Reads need workspace:read; writes need mind:write
 * (non-guest people); archiving and restoring nodes and sources need
 * mind:archive (admins). Edges and node-source links are removed like other
 * link rows: the delete is audited and undo re-creates them.
 */
export function createMindOperations({
  db,
  mutation,
  requireMember,
  zoneOf,
  insertTask,
}: Dependencies) {
  async function getMindMap(
    p: Principal,
    workspaceId: string,
    query: MindMapQuery = {},
  ): Promise<MindMap> {
    parse(idSchema, workspaceId);
    const body = parse(mindMapQuerySchema, query);
    const actor = await requireMember(db, p, workspaceId, "workspace:read");
    const all = body.archived === "include";
    const nodes = await db
      .select()
      .from(mindNodes)
      .where(
        and(
          eq(mindNodes.workspaceId, workspaceId),
          all ? undefined : isNull(mindNodes.archivedAt),
        ),
      )
      .orderBy(asc(mindNodes.layer), asc(mindNodes.angle), asc(mindNodes.id));
    const sources = await db
      .select()
      .from(mindSources)
      .where(
        and(
          eq(mindSources.workspaceId, workspaceId),
          all ? undefined : isNull(mindSources.archivedAt),
        ),
      )
      .orderBy(asc(mindSources.title), asc(mindSources.id));
    const nodeIds = new Set(nodes.map((row) => row.id));
    const sourceIds = new Set(sources.map((row) => row.id));
    const edges = (
      await db
        .select()
        .from(mindEdges)
        .where(eq(mindEdges.workspaceId, workspaceId))
        .orderBy(asc(mindEdges.createdAt), asc(mindEdges.id))
    ).filter((row) => nodeIds.has(row.fromNodeId) && nodeIds.has(row.toNodeId));
    const links = (
      await db
        .select()
        .from(mindNodeSources)
        .where(eq(mindNodeSources.workspaceId, workspaceId))
        .orderBy(asc(mindNodeSources.createdAt), asc(mindNodeSources.id))
    ).filter((row) => nodeIds.has(row.nodeId) && sourceIds.has(row.sourceId));
    return {
      workspaceId,
      nodes: nodes.map(dtoNode),
      edges: edges.map(dtoEdge),
      sources: sources.map(dtoSource),
      nodeSources: links.map(dtoLink),
      canWrite: can(actor, "mind:write", { workspaceId }),
      canArchive: can(actor, "mind:archive", { workspaceId }),
    };
  }

  async function lockNode(tx: Transaction, id: string) {
    parse(idSchema, id);
    const [row] = await tx
      .select()
      .from(mindNodes)
      .where(eq(mindNodes.id, id))
      .for("update");
    if (!row) notFound();
    return row as NodeRow;
  }
  async function lockSource(tx: Transaction, id: string) {
    parse(idSchema, id);
    const [row] = await tx
      .select()
      .from(mindSources)
      .where(eq(mindSources.id, id))
      .for("update");
    if (!row) notFound();
    return row as SourceRow;
  }
  /** Archive and restore need mind:archive; any other edit mind:write. */
  async function authorizeEdit(
    tx: Transaction,
    p: Principal,
    workspaceId: string,
    archived: boolean | undefined,
    current: Date | null,
  ) {
    await requireMember(tx, p, workspaceId, "mind:write");
    if (archived !== undefined && archived !== !!current)
      await requireMember(tx, p, workspaceId, "mind:archive");
  }

  async function createMindNode(
    p: Principal,
    workspaceId: string,
    input: MindNodeInput,
  ): Promise<MindNode> {
    parse(idSchema, workspaceId);
    const body = parse(mindNodeInputSchema, input);
    return mutation(p, async (tx) => {
      await requireMember(tx, p, workspaceId, "mind:write");
      const [row] = await tx
        .insert(mindNodes)
        .values({
          workspaceId,
          title: body.title,
          layer: body.layer,
          angle: body.angle.toFixed(2),
          strength: body.strength ?? 3,
          momentum: body.momentum ?? 0,
          note: body.note ?? "",
        })
        .returning();
      return dtoNode(row);
    });
  }
  async function updateMindNode(
    p: Principal,
    id: string,
    input: MindNodeUpdate,
  ): Promise<MindNode> {
    const body = parse(mindNodeUpdateSchema, input);
    return mutation(p, async (tx) => {
      const row = await lockNode(tx, id);
      await authorizeEdit(
        tx,
        p,
        row.workspaceId,
        body.archived,
        row.archivedAt,
      );
      if (row.version !== body.version) conflict();
      const [updated] = await tx
        .update(mindNodes)
        .set({
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.layer !== undefined ? { layer: body.layer } : {}),
          ...(body.angle !== undefined ? { angle: body.angle.toFixed(2) } : {}),
          ...(body.strength !== undefined ? { strength: body.strength } : {}),
          ...(body.momentum !== undefined ? { momentum: body.momentum } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
          ...(body.archived !== undefined
            ? {
                archivedAt: body.archived
                  ? (row.archivedAt ?? new Date())
                  : null,
              }
            : {}),
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(mindNodes.id, id))
        .returning();
      return dtoNode(updated);
    });
  }

  async function createMindEdge(
    p: Principal,
    workspaceId: string,
    input: MindEdgeInput,
  ): Promise<MindEdge> {
    parse(idSchema, workspaceId);
    const body = parse(mindEdgeInputSchema, input);
    return mutation(p, async (tx) => {
      await requireMember(tx, p, workspaceId, "mind:write");
      for (const nodeId of [body.fromNodeId, body.toNodeId]) {
        const [node] = await tx
          .select({ archivedAt: mindNodes.archivedAt })
          .from(mindNodes)
          .where(
            and(
              eq(mindNodes.id, nodeId),
              eq(mindNodes.workspaceId, workspaceId),
            ),
          )
          .for("share");
        // Another workspace's node stays private.
        if (!node) notFound();
        if (node?.archivedAt) invalid();
      }
      // One link per pair, whichever way it was drawn.
      const existing = await tx
        .select({ id: mindEdges.id })
        .from(mindEdges)
        .where(
          and(
            eq(mindEdges.workspaceId, workspaceId),
            or(
              and(
                eq(mindEdges.fromNodeId, body.fromNodeId),
                eq(mindEdges.toNodeId, body.toNodeId),
              ),
              and(
                eq(mindEdges.fromNodeId, body.toNodeId),
                eq(mindEdges.toNodeId, body.fromNodeId),
              ),
            ),
          ),
        )
        .limit(1);
      if (existing.length) conflict();
      const [row] = await tx
        .insert(mindEdges)
        .values({
          workspaceId,
          fromNodeId: body.fromNodeId,
          toNodeId: body.toNodeId,
          kind: body.kind ?? "relates",
        })
        .returning();
      return dtoEdge(row);
    });
  }
  /** Changes a link's kind (M18 screens), with the edge's version. */
  async function updateMindEdge(
    p: Principal,
    id: string,
    input: MindEdgeUpdate,
  ): Promise<MindEdge> {
    parse(idSchema, id);
    const body = parse(mindEdgeUpdateSchema, input);
    return mutation(p, async (tx) => {
      const [row] = await tx
        .select()
        .from(mindEdges)
        .where(eq(mindEdges.id, id))
        .for("update");
      if (!row) notFound();
      const edge = row as typeof mindEdges.$inferSelect;
      await requireMember(tx, p, edge.workspaceId, "mind:write");
      if (edge.version !== body.version) conflict();
      const [updated] = await tx
        .update(mindEdges)
        .set({
          kind: body.kind,
          version: edge.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(mindEdges.id, id))
        .returning();
      return dtoEdge(updated);
    });
  }
  /** Removes a link row; the audit trigger records it, undo re-adds it. */
  async function removeMindEdge(p: Principal, id: string): Promise<MindEdge> {
    parse(idSchema, id);
    return mutation(p, async (tx) => {
      const [row] = await tx
        .select()
        .from(mindEdges)
        .where(eq(mindEdges.id, id))
        .for("update");
      if (!row) notFound();
      const edge = row as typeof mindEdges.$inferSelect;
      await requireMember(tx, p, edge.workspaceId, "mind:write");
      await tx.delete(mindEdges).where(eq(mindEdges.id, id));
      return dtoEdge(edge);
    });
  }

  async function createMindSource(
    p: Principal,
    workspaceId: string,
    input: MindSourceInput,
  ): Promise<MindSource> {
    parse(idSchema, workspaceId);
    const body = parse(mindSourceInputSchema, input);
    return mutation(p, async (tx) => {
      await requireMember(tx, p, workspaceId, "mind:write");
      const [row] = await tx
        .insert(mindSources)
        .values({
          workspaceId,
          title: body.title,
          url: body.url ?? null,
          note: body.note ?? "",
        })
        .returning();
      return dtoSource(row);
    });
  }
  async function updateMindSource(
    p: Principal,
    id: string,
    input: MindSourceUpdate,
  ): Promise<MindSource> {
    const body = parse(mindSourceUpdateSchema, input);
    return mutation(p, async (tx) => {
      const row = await lockSource(tx, id);
      await authorizeEdit(
        tx,
        p,
        row.workspaceId,
        body.archived,
        row.archivedAt,
      );
      if (row.version !== body.version) conflict();
      const [updated] = await tx
        .update(mindSources)
        .set({
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.url !== undefined ? { url: body.url } : {}),
          ...(body.note !== undefined ? { note: body.note } : {}),
          ...(body.archived !== undefined
            ? {
                archivedAt: body.archived
                  ? (row.archivedAt ?? new Date())
                  : null,
              }
            : {}),
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(mindSources.id, id))
        .returning();
      return dtoSource(updated);
    });
  }

  async function linkMindSource(
    p: Principal,
    nodeId: string,
    sourceId: string,
  ): Promise<MindNodeSource> {
    parse(idSchema, sourceId);
    return mutation(p, async (tx) => {
      const node = await lockNode(tx, nodeId);
      await requireMember(tx, p, node.workspaceId, "mind:write");
      const [source] = await tx
        .select()
        .from(mindSources)
        .where(
          and(
            eq(mindSources.id, sourceId),
            eq(mindSources.workspaceId, node.workspaceId),
          ),
        )
        .for("share");
      if (!source) notFound();
      if (node.archivedAt || source?.archivedAt) invalid();
      const [row] = await tx
        .insert(mindNodeSources)
        .values({ workspaceId: node.workspaceId, nodeId, sourceId })
        .onConflictDoNothing()
        .returning();
      if (!row) conflict();
      return dtoLink(row);
    });
  }
  async function unlinkMindSource(
    p: Principal,
    nodeId: string,
    sourceId: string,
  ): Promise<MindNodeSource> {
    parse(idSchema, sourceId);
    return mutation(p, async (tx) => {
      const node = await lockNode(tx, nodeId);
      await requireMember(tx, p, node.workspaceId, "mind:write");
      const [row] = await tx
        .delete(mindNodeSources)
        .where(
          and(
            eq(mindNodeSources.workspaceId, node.workspaceId),
            eq(mindNodeSources.nodeId, nodeId),
            eq(mindNodeSources.sourceId, sourceId),
          ),
        )
        .returning();
      if (!row) notFound();
      return dtoLink(row);
    });
  }

  /**
   * "Turn into a validation task" (plan §4.3): a real task owned by the
   * signed-in person, due at 23:59 on the civil date in their time zone,
   * created through the normal task path and linked, in one transaction.
   */
  async function createValidationTask(
    p: Principal,
    nodeId: string,
    input: MindValidationTaskInput,
  ): Promise<MindValidationTaskResult> {
    const body = parse(mindValidationTaskInputSchema, input);
    return mutation(p, async (tx) => {
      const node = await lockNode(tx, nodeId);
      const actor = await requireMember(tx, p, node.workspaceId, "mind:write");
      if (node.version !== body.version || node.taskId) conflict();
      if (node.archivedAt) invalid();
      const tz = await zoneOf(tx, p, actor);
      const dueAt =
        zonedInstant(body.dueDate, "23:59", tz) ??
        new Date(`${body.dueDate}T23:59:00Z`);
      const task = await insertTask(
        tx,
        p,
        parse(createTaskSchema, {
          workspaceId: node.workspaceId,
          title: body.title ?? node.title,
          description: node.note,
          ownerId: actor.id,
          workerId: null,
          projectId: body.projectId ?? null,
          dueAt: dueAt.toISOString(),
        }),
      );
      const [updated] = await tx
        .update(mindNodes)
        .set({
          taskId: task.id,
          version: node.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(mindNodes.id, nodeId))
        .returning();
      return { node: dtoNode(updated), task };
    });
  }

  return {
    operations: {
      getMindMap,
      createMindNode,
      updateMindNode,
      createMindEdge,
      updateMindEdge,
      removeMindEdge,
      createMindSource,
      updateMindSource,
      linkMindSource,
      unlinkMindSource,
      createValidationTask,
    },
  };
}
