import { randomUUID } from "node:crypto";
import { connectDatabase, members, tasks } from "@taff/db";
import type { Task } from "@taff/schemas";
import { workspaceGraphSchema } from "@taff/schemas/graph";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import {
  type GraphProjection,
  type GraphStore,
  graphFingerprint,
} from "./graph-store";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("Graph tests require isolated _test database");
describe.skipIf(!url)("workspace graph authorization and freshness", () => {
  let core: Core;
  let db: ReturnType<typeof connectDatabase>;
  let principal: Principal;
  let guest: Principal;
  let outsider: Principal;
  let agent: Principal;
  let workspaceId: string;
  let ownerId: string;
  let task: Task;
  let child: Task;
  const projections = new Map<string, GraphProjection>();
  const store: GraphStore = {
    read: vi.fn(async (id) => projections.get(id) ?? null),
    replace: vi.fn(async (id, value) => {
      projections.set(id, {
        ...structuredClone(value),
        fingerprint: graphFingerprint(value),
        syncedAt: new Date().toISOString(),
      });
    }),
    listWorkspaces: vi.fn(async (after = "") =>
      [...projections.keys()]
        .filter((id) => id > after)
        .sort()
        .slice(0, 100),
    ),
    remove: vi.fn(async (id) => {
      projections.delete(id);
    }),
    close: vi.fn(async () => {}),
  };
  beforeAll(async () => {
    await migrateDatabase(url!);
    db = connectDatabase(url!);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "graph-test-secret-longer-than-thirty-two-characters",
      tokenPepper: "graph-test-pepper-sixteen",
      graph: store,
    });
    const signup = (name: string) =>
      core.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
    const admin = await signup("Graph admin");
    principal = userPrincipal(admin.user.id);
    outsider = userPrincipal((await signup("Graph outsider")).user.id);
    const guestUser = (await signup("Graph guest")).user;
    guest = userPrincipal(guestUser.id);
    workspaceId = (
      await core.createWorkspace(principal, { name: "Graph isolation" })
    ).id;
    ownerId = (await core.listMembers(principal, workspaceId))[0].id;
    await db.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${admin.user.id},true)`,
      );
      await tx.insert(members).values({
        workspaceId,
        userId: guestUser.id,
        kind: "person",
        role: "guest",
        name: "Graph guest",
      });
    });
    const worker = await core.createWorkspaceAgent(principal, workspaceId, {
      name: "Graph worker",
      kind: "agent",
    });
    const token = await core.createAgentToken(principal, {
      workspaceId,
      memberId: worker.id,
      name: "Graph read",
      scopes: ["tasks:read"],
    });
    agent = (await core.authenticateAgentToken(token.token))!;
    const project = await core.createProject(principal, workspaceId, {
      name: "Projected project",
    });
    task = await core.createTask(principal, {
      workspaceId,
      ownerId,
      workerId: worker.id,
      projectId: project.id,
      title: "Parent",
    });
    child = await core.createTask(principal, {
      workspaceId,
      ownerId,
      title: "Child",
      workerId: null,
      parentId: task.id,
    });
  }, 30000);
  afterAll(async () => {
    await core?.close();
    await db?.close();
  });

  it("serves Neo4j projection only after rebuild, with SQL-equivalent guest and agent reads", async () => {
    expect(await core.getWorkspaceGraph(principal, workspaceId)).toMatchObject({
      status: "stale",
      nodes: [],
      edges: [],
    });
    await core.rebuildWorkspaceGraph(workspaceId);
    const graph = workspaceGraphSchema.parse(
      await core.getWorkspaceGraph(principal, workspaceId),
    );
    expect(graph.status).toBe("ready");
    expect(graph.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(["task", "project", "person", "agent"]),
    );
    expect(graph.edges).toContainEqual({
      source: child.id,
      target: task.id,
      kind: "parent",
    });
    expect(
      graph.edges
        .filter((edge) => edge.source === task.id)
        .map((edge) => edge.kind)
        .sort(),
    ).toEqual(["owner", "project", "worker"]);
    expect(await core.getWorkspaceGraph(guest, workspaceId)).toEqual(graph);
    expect(await core.getWorkspaceGraph(agent, workspaceId)).toEqual(graph);
    const reads = vi.mocked(store.read).mock.calls.length;
    await expect(
      core.getWorkspaceGraph(outsider, workspaceId),
    ).rejects.toMatchObject({ code: "forbidden" });
    const deniedToken = await core.createAgentToken(principal, {
      workspaceId,
      memberId: agent.kind === "agent" ? agent.memberId : "",
      name: "No read scope",
      scopes: ["tasks:write"],
    });
    const deniedAgent = (await core.authenticateAgentToken(deniedToken.token))!;
    await expect(
      core.getWorkspaceGraph(deniedAgent, workspaceId),
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(vi.mocked(store.read).mock.calls).toHaveLength(reads);
  });

  it("fails closed for mutation/deletion and corrupt projected edges, then recovers", async () => {
    const projection = projections.get(workspaceId)!;
    const edge = projection.edges.pop()!;
    expect(await core.getWorkspaceGraph(principal, workspaceId)).toMatchObject({
      status: "stale",
      nodes: [],
      edges: [],
    });
    projection.edges.push(edge);
    task = await core.updateTask(principal, task.id, {
      version: task.version,
      title: "Renamed parent",
    });
    expect(await core.getWorkspaceGraph(principal, workspaceId)).toMatchObject({
      status: "stale",
      nodes: [],
    });
    await core.rebuildWorkspaceGraph(workspaceId);
    expect(
      (await core.getWorkspaceGraph(principal, workspaceId)).nodes,
    ).toContainEqual(
      expect.objectContaining({ id: task.id, label: "Renamed parent" }),
    );
    await db.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${principal.kind === "user" ? principal.userId : ""},true)`,
      );
      await tx.delete(tasks).where(eq(tasks.id, child.id));
    });
    expect(await core.getWorkspaceGraph(principal, workspaceId)).toMatchObject({
      status: "stale",
      edges: [],
    });
    await core.rebuildWorkspaceGraph(workspaceId);
    expect(
      (await core.getWorkspaceGraph(principal, workspaceId)).nodes.some(
        (node) => node.id === child.id,
      ),
    ).toBe(false);
  });

  it("degrades graph reads during an outage while SQL writes continue", async () => {
    vi.mocked(store.read).mockRejectedValueOnce(new Error("Unavailable"));
    expect(await core.getWorkspaceGraph(principal, workspaceId)).toMatchObject({
      status: "unavailable",
      nodes: [],
      edges: [],
    });
    task = await core.updateTask(principal, task.id, {
      version: task.version,
      title: "SQL still works",
    });
    expect(task.title).toBe("SQL still works");
    await core.rebuildWorkspaceGraph(workspaceId);
    expect((await core.getWorkspaceGraph(principal, workspaceId)).status).toBe(
      "ready",
    );
  });

  it("reports too_large explicitly and removes an obsolete projection", async () => {
    await db.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${principal.kind === "user" ? principal.userId : ""},true)`,
      );
      await tx.insert(members).values(
        Array.from({ length: 500 }, (_, i) => ({
          workspaceId,
          kind: "agent" as const,
          name: `Bound ${i}`,
        })),
      );
    });
    expect(await core.getWorkspaceGraph(principal, workspaceId)).toMatchObject({
      status: "too_large",
      nodeLimit: 500,
      nodes: [],
      edges: [],
    });
    await core.rebuildWorkspaceGraph(workspaceId);
    expect(projections.has(workspaceId)).toBe(false);
  });

  it("purges projections for removed workspaces", async () => {
    const removed = randomUUID();
    projections.set(removed, {
      nodes: [],
      edges: [],
      fingerprint: "obsolete",
      syncedAt: new Date().toISOString(),
    });
    await core.rebuildWorkspaceGraph(removed);
    expect(projections.has(removed)).toBe(false);
  });
});
