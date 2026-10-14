import { randomUUID } from "node:crypto";
import { agentProfiles, connectDatabase, members } from "@taff/db";
import { relationGraphSchema } from "@taff/schemas";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn(
    "SKIP M16 relations PostgreSQL tests: TEST_DATABASE_URL required",
  );
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("M16 tests require isolated _test database");
describe.skipIf(!url)("M16 relations graph", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let alice: Principal;
  let guest: Principal;
  let outsider: Principal;
  let agent: Principal;
  let w: string;
  let owner: string;
  let agentId: string;
  let outsiderProject: string;
  let projectId: string;
  let otherProject: string;
  let companyId: string;
  let contactId: string;
  const taskIds: string[] = [];
  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "m16-test-secret-longer-than-thirty-two-characters",
      tokenPepper: "m16-test-pepper-at-least-sixteen",
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
    const me = await core.getMe(a.user.id);
    w = me.workspaces[0].id;
    owner = me.workspaces[0].memberId;
    const g = await signup("Guest Gu");
    guest = userPrincipal(g.user.id);
    const o = await signup("Outsider");
    outsider = userPrincipal(o.user.id);
    const outsiderW = (await core.getMe(o.user.id)).workspaces[0].id;
    outsiderProject = (
      await core.createProject(outsider, outsiderW, { name: "Elsewhere" })
    ).id;
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${a.user.id},true)`,
      );
      await tx.insert(members).values({
        workspaceId: w,
        userId: g.user.id,
        name: "Guest Gu",
        kind: "person",
        role: "guest",
      });
      const [am] = await tx
        .insert(members)
        .values({ workspaceId: w, name: "Graph Agent", kind: "agent" })
        .returning();
      agentId = am.id;
      await tx
        .insert(agentProfiles)
        .values({ id: am.id, workspaceId: w, supervisorId: owner });
    });
    const token = await core.createAgentToken(alice, {
      workspaceId: w,
      memberId: agentId,
      name: "M16 read",
      scopes: ["tasks:read"],
    });
    agent = (await core.authenticateAgentToken(token.token))!;
    companyId = (
      await core.createCompany(alice, w, {
        name: "Northwind Retail",
        industry: "Retail",
      })
    ).id;
    contactId = (
      await core.createContact(alice, w, {
        name: "Wong Chi-ming",
        title: "Chairman",
        companyId,
        phone: "+852 9123 4501",
        email: "cm.wong@nwretail.hk",
      })
    ).id;
    const project = await core.createProject(alice, w, { name: "Checkout v2" });
    projectId = project.id;
    await core.updateProject(alice, projectId, {
      version: project.version,
      clientCompanyId: companyId,
    });
    otherProject = (await core.createProject(alice, w, { name: "Analytics" }))
      .id;
    const create = (title: string, fields: object = {}) =>
      core.createTask(alice, {
        workspaceId: w,
        ownerId: owner,
        workerId: null,
        projectId,
        title,
        ...fields,
      });
    const parent = await create("Payments");
    const child = await create("Migrate cards", {
      parentId: parent.id,
      workerId: agentId,
    });
    const outside = await create("Event schema", { projectId: otherProject });
    taskIds.push(parent.id, child.id, outside.id);
    await core.addDependency(alice, {
      predecessorTaskId: outside.id,
      successorTaskId: child.id,
    });
    await core.setContactRoles(alice, "project", projectId, contactId, {
      roles: ["decider"],
    });
    await core.setContactRoles(alice, "task", parent.id, contactId, {
      roles: ["tech"],
    });
  }, 30000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });

  it("builds the workspace graph with CRM for a person and no contact details", async () => {
    const graph = relationGraphSchema.parse(await core.relationGraph(alice, w));
    expect(graph.crmVisible).toBe(true);
    expect(graph.layers).toEqual(["people", "dependencies", "org", "crm"]);
    const [parent, child, outside] = taskIds;
    expect(graph.edges.map((e) => [e.kind, e.from, e.to])).toEqual(
      expect.arrayContaining([
        ["contains", `workspace:${w}`, `project:${projectId}`],
        ["contains", `project:${projectId}`, `task:${parent}`],
        ["contains", `task:${parent}`, `task:${child}`],
        ["owns", `person:${owner}`, `task:${child}`],
        ["works_on", `agent:${agentId}`, `task:${child}`],
        ["supervises", `person:${owner}`, `agent:${agentId}`],
        ["depends_on", `task:${child}`, `task:${outside}`],
        ["client_of", `company:${companyId}`, `project:${projectId}`],
        ["stakeholder_of", `contact:${contactId}`, `project:${projectId}`],
        ["stakeholder_of", `contact:${contactId}`, `task:${parent}`],
        ["contact_of", `contact:${contactId}`, `company:${companyId}`],
      ]),
    );
    expect(graph.nodes.find((n) => n.id === contactId)).toEqual({
      key: `contact:${contactId}`,
      kind: "contact",
      id: contactId,
      label: "Wong Chi-ming",
      detail: "Chairman",
    });
    const text = JSON.stringify(graph);
    expect(text).not.toContain("9123");
    expect(text).not.toContain("nwretail");
    // Two reads are identical.
    expect(await core.relationGraph(alice, w)).toEqual(graph);
  });
  it("scopes to a project and filters layers", async () => {
    const graph = await core.relationGraph(alice, w, {
      projectId,
      layers: ["dependencies"],
    });
    expect(graph.projectId).toBe(projectId);
    expect(graph.edges.map((e) => e.kind)).toEqual(["depends_on"]);
    // The dependency neighbour from another project comes along.
    expect(graph.nodes.map((n) => n.id)).toContain(taskIds[2]);
    expect(graph.nodes.map((n) => n.id)).not.toContain(otherProject);
  });
  it("shows no CRM node to a guest or to an agent without crm.read", async () => {
    for (const reader of [guest, agent]) {
      const graph = await core.relationGraph(reader, w);
      expect(graph.crmVisible).toBe(false);
      expect(
        graph.nodes.filter((n) => n.kind === "company" || n.kind === "contact"),
      ).toEqual([]);
      expect(graph.nodes.some((n) => n.id === taskIds[1])).toBe(true);
    }
    await core.setAgentPermission(alice, agentId, {
      capability: "crm.read",
      decision: "allow",
    });
    try {
      const graph = await core.relationGraph(agent, w);
      expect(graph.crmVisible).toBe(true);
      expect(JSON.stringify(graph)).not.toContain("nwretail");
    } finally {
      await core.setAgentPermission(alice, agentId, {
        capability: "crm.read",
        decision: "ask",
      });
    }
  });
  it("refuses outsiders, other workspaces' projects and bad layers", async () => {
    await expect(core.relationGraph(outsider, w)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      core.relationGraph(alice, w, { projectId: outsiderProject }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      core.relationGraph(alice, w, {
        layers: ["chain"] as unknown as ["org"],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
});
