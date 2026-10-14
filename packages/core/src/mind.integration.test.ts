import { randomUUID } from "node:crypto";
import { activity, connectDatabase, members } from "@taff/db";
import { mindMapSchema, mindValidationTaskResultSchema } from "@taff/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn(
    "SKIP M18 mind map PostgreSQL tests: TEST_DATABASE_URL required",
  );
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("M18 tests require isolated _test database");
describe.skipIf(!url)("M18 mind map", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let alice: Principal;
  let bob: Principal;
  let guest: Principal;
  let outsider: Principal;
  let agent: Principal;
  let w: string;
  let outsiderW: string;
  let bobMember: string;
  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "m18-test-secret-longer-than-thirty-two-characters",
      tokenPepper: "m18-test-pepper-at-least-sixteen",
    });
    const signup = (name: string) =>
      core.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
    const a = await signup("Alex Chen");
    alice = userPrincipal(a.user.id);
    w = (await core.getMe(a.user.id)).workspaces[0].id;
    const b = await signup("Bob Lee");
    bob = userPrincipal(b.user.id);
    await core.updateProfile(b.user.id, { locale: "en", tz: "Asia/Hong_Kong" });
    const g = await signup("Guest Gu");
    guest = userPrincipal(g.user.id);
    const o = await signup("Outsider");
    outsider = userPrincipal(o.user.id);
    outsiderW = (await core.getMe(o.user.id)).workspaces[0].id;
    let agentId = "";
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${a.user.id},true)`,
      );
      const rows = await tx
        .insert(members)
        .values([
          {
            workspaceId: w,
            userId: b.user.id,
            name: "Bob Lee",
            kind: "person",
          },
          {
            workspaceId: w,
            userId: g.user.id,
            name: "Guest Gu",
            kind: "person",
            role: "guest",
          },
          { workspaceId: w, name: "Mind Agent", kind: "agent" },
        ])
        .returning();
      bobMember = rows[0].id;
      agentId = rows[2].id;
    });
    const token = await core.createAgentToken(alice, {
      workspaceId: w,
      memberId: agentId,
      name: "M18",
      scopes: ["tasks:read", "tasks:write"],
    });
    agent = (await core.authenticateAgentToken(token.token))!;
  }, 30000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });
  const node = (p: Principal, title: string, fields: object = {}) =>
    core.createMindNode(p, w, {
      title,
      layer: 1,
      angle: 62.5,
      strength: 4,
      momentum: 1,
      note: "Origin and batch now carry trust.",
      ...fields,
    });

  it("lets non-guest people write and only admins archive, with versions", async () => {
    const made = await node(bob, "Ingredient traceability");
    expect(made).toMatchObject({
      angle: 62.5,
      strength: 4,
      momentum: 1,
      taskId: null,
      archivedAt: null,
      version: 1,
    });
    for (const p of [guest, agent, outsider])
      await expect(node(p, "No")).rejects.toMatchObject({ code: "forbidden" });
    for (const fields of [
      { layer: 10 },
      { angle: 360 },
      { angle: 1.234 },
      { strength: 0 },
      { momentum: 3 },
      { title: "  " },
    ])
      await expect(node(bob, "Bad", fields)).rejects.toMatchObject({
        code: "invalid_input",
      });
    const edited = await core.updateMindNode(bob, made.id, {
      version: 1,
      momentum: -1,
      angle: 0,
    });
    expect(edited).toMatchObject({ momentum: -1, angle: 0, version: 2 });
    await expect(
      core.updateMindNode(bob, made.id, { version: 1, title: "Stale" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      core.updateMindNode(bob, made.id, { version: 2, archived: true }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const archived = await core.updateMindNode(alice, made.id, {
      version: 2,
      archived: true,
    });
    expect(archived.archivedAt).not.toBeNull();
    const active = mindMapSchema.parse(await core.getMindMap(guest, w));
    expect(active).toMatchObject({ canWrite: false, canArchive: false });
    expect(active.nodes.map((n) => n.id)).not.toContain(made.id);
    const everything = await core.getMindMap(bob, w, { archived: "include" });
    expect(everything).toMatchObject({ canWrite: true, canArchive: false });
    expect(everything.nodes.map((n) => n.id)).toContain(made.id);
    const restored = await core.updateMindNode(alice, made.id, {
      version: 3,
      archived: false,
    });
    expect(restored).toMatchObject({ archivedAt: null, version: 4 });
    await expect(core.getMindMap(outsider, w)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
  it("links nodes once per pair and removes links with an audit row", async () => {
    const a = await node(bob, "Belonging", { layer: 0 });
    const b = await node(bob, "Nostalgia", { layer: 1 });
    const foreign = await core.createMindNode(outsider, outsiderW, {
      title: "Elsewhere",
      layer: 0,
      angle: 0,
    });
    const edge = await core.createMindEdge(bob, w, {
      fromNodeId: a.id,
      toNodeId: b.id,
    });
    expect(edge).toMatchObject({ kind: "relates", fromNodeId: a.id });
    await expect(
      core.createMindEdge(bob, w, { fromNodeId: b.id, toNodeId: a.id }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      core.createMindEdge(bob, w, { fromNodeId: a.id, toNodeId: a.id }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.createMindEdge(bob, w, { fromNodeId: a.id, toNodeId: foreign.id }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      core.createMindEdge(guest, w, {
        fromNodeId: a.id,
        toNodeId: b.id,
        kind: "supports",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const archived = await core.updateMindNode(alice, b.id, {
      version: 1,
      archived: true,
    });
    const c = await node(bob, "Value");
    await expect(
      core.createMindEdge(bob, w, { fromNodeId: c.id, toNodeId: b.id }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    // An edge to an archived node is hidden, and returns with the node.
    expect(
      (await core.getMindMap(bob, w)).edges.map((e) => e.id),
    ).not.toContain(edge.id);
    await core.updateMindNode(alice, b.id, {
      version: archived.version,
      archived: false,
    });
    expect((await core.getMindMap(bob, w)).edges.map((e) => e.id)).toContain(
      edge.id,
    );
    // The kind is editable with the edge's version (M18 screens).
    expect(edge.version).toBe(1);
    const supports = await core.updateMindEdge(bob, edge.id, {
      version: 1,
      kind: "supports",
    });
    expect(supports).toMatchObject({ kind: "supports", version: 2 });
    await expect(
      core.updateMindEdge(bob, edge.id, { version: 1, kind: "contradicts" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      core.updateMindEdge(guest, edge.id, { version: 2, kind: "relates" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.updateMindEdge(outsider, edge.id, { version: 2, kind: "relates" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const restored = await core.updateMindEdge(bob, edge.id, {
      version: 2,
      kind: "relates",
    });
    expect(await core.removeMindEdge(bob, edge.id)).toEqual(restored);
    await expect(core.removeMindEdge(bob, edge.id)).rejects.toMatchObject({
      code: "not_found",
    });
    const audit = await connection.db
      .select({ action: activity.action })
      .from(activity)
      .where(
        and(eq(activity.workspaceId, w), eq(activity.resourceId, edge.id)),
      );
    expect(audit.map((row) => row.action)).toEqual([
      "mind_edges.insert",
      "mind_edges.update",
      "mind_edges.update",
      "mind_edges.delete",
    ]);
  });
  it("keeps sources with safe URLs and links them to nodes", async () => {
    const n = await node(bob, "Solo dining");
    await expect(
      core.createMindSource(bob, w, {
        title: "Bad",
        url: "javascript:alert(1)",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const source = await core.createMindSource(bob, w, {
      title: "Koponen & Mustonen (2022)",
      url: "https://doi.org/10.1177/1469540520955219",
      note: "Solo dining as a new commensality.",
    });
    const link = await core.linkMindSource(bob, n.id, source.id);
    expect(link).toMatchObject({ nodeId: n.id, sourceId: source.id });
    await expect(
      core.linkMindSource(bob, n.id, source.id),
    ).rejects.toMatchObject({ code: "conflict" });
    const map = await core.getMindMap(bob, w);
    expect(map.nodeSources.map((l) => l.id)).toContain(link.id);
    await expect(
      core.updateMindSource(bob, source.id, { version: 1, archived: true }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const edited = await core.updateMindSource(bob, source.id, {
      version: 1,
      url: null,
    });
    expect(edited).toMatchObject({ url: null, version: 2 });
    expect(await core.unlinkMindSource(bob, n.id, source.id)).toEqual(link);
    await expect(
      core.unlinkMindSource(bob, n.id, source.id),
    ).rejects.toMatchObject({ code: "not_found" });
    await core.updateMindSource(alice, source.id, {
      version: 2,
      archived: true,
    });
    await expect(
      core.linkMindSource(bob, n.id, source.id),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("turns a node into a validation task owned by the person, due in their zone", async () => {
    const n = await node(bob, "Healthy delivery");
    await expect(
      core.createValidationTask(guest, n.id, {
        version: 1,
        dueDate: "2026-10-20",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const result = mindValidationTaskResultSchema.parse(
      await core.createValidationTask(bob, n.id, {
        version: 1,
        dueDate: "2026-10-20",
        title: "Validate: Healthy delivery",
      }),
    );
    expect(result.task).toMatchObject({
      title: "Validate: Healthy delivery",
      description: "Origin and batch now carry trust.",
      ownerId: bobMember,
      workerId: null,
      workspaceId: w,
      // 23:59 on Oct 20 in Hong Kong.
      dueAt: "2026-10-20T15:59:00.000Z",
    });
    expect(result.node).toMatchObject({ taskId: result.task.id, version: 2 });
    await expect(
      core.createValidationTask(bob, n.id, {
        version: 2,
        dueDate: "2026-10-21",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    const audit = await connection.db
      .select({ action: activity.action })
      .from(activity)
      .where(
        and(
          eq(activity.workspaceId, w),
          inArray(activity.resourceId, [n.id, result.task.id]),
        ),
      );
    expect(audit.map((row) => row.action).sort()).toEqual([
      "mind_nodes.insert",
      "mind_nodes.update",
      "tasks.insert",
    ]);
  });
  it("audits every new Phase B table", async () => {
    const rows = await connection.client<{ table: string }[]>`
      select c.relname as table from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and t.tgname = c.relname || '_audit'
        and c.relname in ('suggestions','mind_nodes','mind_edges','mind_sources','mind_node_sources')
      order by c.relname`;
    expect(rows.map((row) => row.table)).toEqual([
      "mind_edges",
      "mind_node_sources",
      "mind_nodes",
      "mind_sources",
      "suggestions",
    ]);
  });
});
