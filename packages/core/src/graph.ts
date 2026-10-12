import {
  type Database,
  members,
  projects,
  type Transaction,
  tasks,
  workspaces,
} from "@taff/db";
import { idSchema } from "@taff/schemas";
import {
  GRAPH_NODE_LIMIT,
  type GraphEdge,
  type WorkspaceGraph,
} from "@taff/schemas/graph";
import { eq, gt, sql } from "drizzle-orm";
import {
  type GraphSnapshot,
  type GraphStore,
  graphFingerprint,
} from "./graph-store";
import { type Principal } from "./index";
import type { Action, Actor, Resource } from "./permissions";

export function createGraphOperations({
  db,
  store,
  requireMember,
}: {
  db: Database;
  store?: GraphStore;
  requireMember: (
    query: Database | Transaction,
    principal: Principal,
    workspaceId: string,
    action: Action,
    resource?: Resource,
  ) => Promise<Actor>;
}) {
  async function snapshot(
    tx: Transaction,
    workspaceId: string,
  ): Promise<GraphSnapshot | null> {
    const projectRows = await tx
      .select({ id: projects.id, label: projects.name })
      .from(projects)
      .where(eq(projects.workspaceId, workspaceId))
      .orderBy(projects.id)
      .limit(GRAPH_NODE_LIMIT + 1);
    if (projectRows.length > GRAPH_NODE_LIMIT) return null;
    const memberRows = await tx
      .select({ id: members.id, label: members.name, kind: members.kind })
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.id)
      .limit(GRAPH_NODE_LIMIT - projectRows.length + 1);
    if (projectRows.length + memberRows.length > GRAPH_NODE_LIMIT) return null;
    const taskRows = await tx
      .select({
        id: tasks.id,
        label: tasks.title,
        status: tasks.status,
        projectId: tasks.projectId,
        parentId: tasks.parentId,
        ownerId: tasks.ownerId,
        workerId: tasks.workerId,
      })
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .orderBy(tasks.id)
      .limit(GRAPH_NODE_LIMIT - projectRows.length - memberRows.length + 1);
    if (
      projectRows.length + memberRows.length + taskRows.length >
      GRAPH_NODE_LIMIT
    )
      return null;
    const nodes = [
      ...projectRows.map((p) => ({ ...p, kind: "project" as const })),
      ...memberRows,
      ...taskRows.map(({ id, label, status }) => ({
        id,
        label,
        status,
        kind: "task" as const,
      })),
    ];
    const edges: GraphEdge[] = [];
    for (const task of taskRows)
      for (const kind of ["project", "parent", "owner", "worker"] as const) {
        const target = task[`${kind}Id`];
        if (target) edges.push({ source: task.id, target, kind });
      }
    return { nodes, edges };
  }
  async function getWorkspaceGraph(
    principal: Principal,
    workspaceId: string,
  ): Promise<WorkspaceGraph> {
    idSchema.parse(workspaceId);
    return db.transaction(
      async (tx) => {
        await requireMember(tx, principal, workspaceId, "workspace:read");
        const empty: WorkspaceGraph = {
          workspaceId,
          status: "disabled",
          syncedAt: null,
          nodeLimit: GRAPH_NODE_LIMIT,
          nodes: [],
          edges: [],
        };
        if (!store) return empty;
        const source = await snapshot(tx, workspaceId);
        if (!source) return { ...empty, status: "too_large" };
        try {
          const projection = await store.read(workspaceId);
          if (!projection) return { ...empty, status: "stale" };
          const fingerprint = graphFingerprint(source);
          // Compare both the checkpoint and actual graph: partial/corrupt or deleted data fails closed.
          if (
            projection.fingerprint !== fingerprint ||
            graphFingerprint(projection) !== fingerprint
          )
            return { ...empty, status: "stale", syncedAt: projection.syncedAt };
          return {
            ...empty,
            status: "ready",
            syncedAt: projection.syncedAt,
            nodes: projection.nodes,
            edges: projection.edges,
          };
        } catch {
          return { ...empty, status: "unavailable" };
        }
      },
      { isolationLevel: "repeatable read" },
    );
  }
  async function rebuildWorkspaceGraph(workspaceId: string): Promise<void> {
    idSchema.parse(workspaceId);
    if (!store) return;
    await db.transaction(
      async (tx) => {
        // Try-lock avoids an older repeatable-read snapshot waiting behind a newer projection.
        const lock = await tx.execute<{ locked: boolean }>(
          sql`select pg_try_advisory_xact_lock(hashtextextended(${`taff:graph:${workspaceId}`},0)) as locked`,
        );
        if (!lock[0]?.locked) return;
        const [workspace] = await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId));
        if (!workspace) {
          await store.remove(workspaceId);
          return;
        }
        const source = await snapshot(tx, workspaceId);
        if (!source) {
          await store.remove(workspaceId);
          return;
        }
        await store.replace(workspaceId, source);
      },
      { isolationLevel: "repeatable read" },
    );
  }
  async function rebuildWorkspaceGraphs(): Promise<void> {
    if (!store) return;
    let after: string | undefined;
    do {
      const page = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(after ? gt(workspaces.id, after) : undefined)
        .orderBy(workspaces.id)
        .limit(100);
      for (const workspace of page) await rebuildWorkspaceGraph(workspace.id);
      after = page.length === 100 ? page.at(-1)!.id : undefined;
    } while (after);
    // Reconcile removals too, including changes missed while either database was offline.
    do {
      const page = await store.listWorkspaces(after);
      for (const workspaceId of page) {
        const [workspace] = await db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId));
        if (!workspace) await rebuildWorkspaceGraph(workspaceId);
      }
      after = page.length === 100 ? page.at(-1) : undefined;
    } while (after);
  }
  return { getWorkspaceGraph, rebuildWorkspaceGraph, rebuildWorkspaceGraphs };
}
