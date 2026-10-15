import { randomUUID } from "node:crypto";
import {
  activity,
  connectDatabase,
  members,
  projects,
  tasks,
  workspaces,
} from "@taff/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url) console.warn("SKIP CRM PostgreSQL tests: TEST_DATABASE_URL required");
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("CRM tests require isolated _test database");
describe.skipIf(!url)("M12 CRM invariants (DEPLOY.md rules 1–7)", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let alice: Principal;
  let bob: Principal;
  let guest: Principal;
  let outsider: Principal;
  let crmAgent: Principal;
  let plainAgent: Principal;
  let aliceId: string;
  let w: string;
  let otherW: string;
  let owner: string;
  let agentId: string;
  const status = (promise: Promise<unknown>) =>
    promise.then(
      () => 200,
      (error: { status?: number }) => error.status ?? 500,
    );
  /** Runs `fn` and returns how many activity rows each action gained in `w`. */
  async function audited(fn: () => Promise<unknown>) {
    const count = async () =>
      new Map(
        (
          await connection.db
            .select({
              action: activity.action,
              n: sql<number>`count(*)::int`,
            })
            .from(activity)
            .where(eq(activity.workspaceId, w))
            .groupBy(activity.action)
        ).map((row) => [row.action, row.n]),
      );
    const before = await count();
    await fn();
    const after = await count();
    return Object.fromEntries(
      [...after]
        .map(([action, n]) => [action, n - (before.get(action) ?? 0)] as const)
        .filter(([, n]) => n > 0),
    );
  }
  const clean = async () => expect(await core.auditCrm(alice, w)).toEqual([]);
  const task = (title: string, projectId: string | null) =>
    core.createTask(alice, {
      workspaceId: w,
      ownerId: owner,
      workerId: null,
      title,
      projectId,
    });
  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    core = createCore({
      databaseUrl: url!,
      authUrl: "http://localhost:3000",
      authSecret: "crm-test-secret-longer-than-thirty-two-characters",
      tokenPepper: "crm-test-pepper-at-least-sixteen",
    });
    const signup = async (name: string) =>
      core.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
    const a = await signup("Alex Chen");
    aliceId = a.user.id;
    alice = userPrincipal(aliceId);
    const me = await core.getMe(aliceId);
    w = me.workspaces[0].id;
    owner = me.workspaces[0].memberId;
    const b = await signup("Bob Lee");
    bob = userPrincipal(b.user.id);
    const g = await signup("Guest");
    guest = userPrincipal(g.user.id);
    const o = await signup("Outsider");
    outsider = userPrincipal(o.user.id);
    otherW = (await core.getMe(o.user.id)).workspaces[0].id;
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${aliceId},true)`);
      await tx.insert(members).values([
        { workspaceId: w, userId: b.user.id, name: "Bob Lee", kind: "person" },
        {
          workspaceId: w,
          userId: g.user.id,
          name: "Guest",
          kind: "person",
          role: "guest",
        },
      ]);
      const [agent] = await tx
        .insert(members)
        .values({ workspaceId: w, name: "CRM Agent", kind: "agent" })
        .returning();
      agentId = agent.id;
    });
    const issue = async (scopes: ("tasks:read" | "tasks:write")[]) =>
      (await core.authenticateAgentToken(
        (
          await core.createAgentToken(alice, {
            workspaceId: w,
            memberId: agentId,
            name: `crm ${scopes.join(",")}`,
            scopes,
          })
        ).token,
      ))!;
    crmAgent = await issue(["tasks:read"]);
    // Without tasks:read a token never reads CRM, whatever the capability.
    plainAgent = await issue(["tasks:write"]);
  }, 30000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });

  it("lists distinct roles across company, project and task links without duplicates", async () => {
    const company = await core.createCompany(alice, w, {
      name: "Role summary client",
    });
    const contact = await core.createContact(alice, w, {
      name: "Summary buyer",
      companyId: company.id,
    });
    const project = await core.createProject(alice, w, {
      name: "Role summary project",
    });
    const work = await task("Role summary task", project.id);
    await core.setContactRoles(alice, "company", company.id, contact.id, {
      roles: ["finance", "decider"],
    });
    await core.setContactRoles(alice, "project", project.id, contact.id, {
      roles: ["decider", "tech"],
    });
    await core.setContactRoles(alice, "task", work.id, contact.id, {
      roles: ["tech"],
    });
    expect(
      (await core.listContacts(alice, w)).find((row) => row.id === contact.id)
        ?.roles,
    ).toEqual(["decider", "tech", "finance"]);
    await core.unlinkContact(alice, "project", project.id, contact.id);
    expect(
      (await core.listContacts(alice, w)).find((row) => row.id === contact.id)
        ?.roles,
    ).toEqual(["decider", "finance"]);
    await clean();
  });

  it("creates, edits, archives and restores companies and contacts with versions and activity", async () => {
    let company!: Awaited<ReturnType<Core["createCompany"]>>;
    expect(
      await audited(async () => {
        company = await core.createCompany(alice, w, {
          name: "Northwind Retail",
          industry: "Retail",
        });
      }),
    ).toEqual({ "companies.insert": 1 });
    expect(company).toMatchObject({ version: 1, archivedAt: null });
    const renamed = await core.updateCompany(bob, company.id, {
      version: 1,
      name: "Northwind Retail Group",
    });
    expect(renamed.version).toBe(2);
    expect(
      await status(
        core.updateCompany(alice, company.id, { version: 1, industry: "X" }),
      ),
    ).toBe(409);
    // Archive and restore are admin-only (crm:archive).
    expect(
      await status(
        core.updateCompany(bob, company.id, { version: 2, archived: true }),
      ),
    ).toBe(403);
    const archived = await core.updateCompany(alice, company.id, {
      version: 2,
      archived: true,
    });
    expect(archived.archivedAt).not.toBeNull();
    expect(
      (await core.listCompanies(alice, w)).some((c) => c.id === company.id),
    ).toBe(false);
    expect(
      (await core.listCompanies(alice, w, { includeArchived: true })).some(
        (c) => c.id === company.id,
      ),
    ).toBe(true);
    // An archived company cannot employ a new contact.
    expect(
      await status(
        core.createContact(alice, w, { name: "Lee", companyId: company.id }),
      ),
    ).toBe(400);
    const restored = await core.updateCompany(alice, company.id, {
      version: 3,
      archived: false,
    });
    expect(restored).toMatchObject({ archivedAt: null, version: 4 });

    let contact!: Awaited<ReturnType<Core["createContact"]>>;
    expect(
      await audited(async () => {
        contact = await core.createContact(bob, w, {
          name: "Lee Pui-yan",
          title: "Operations director",
          companyId: company.id,
          phone: "+852 9123 4502",
          email: "py.lee@example.com",
        });
      }),
    ).toEqual({ "contacts.insert": 1 });
    expect(contact).toMatchObject({
      companyId: company.id,
      phone: "+852 9123 4502",
      email: "py.lee@example.com",
    });
    const edited = await core.updateContact(bob, contact.id, {
      version: 1,
      title: "COO",
    });
    expect(edited).toMatchObject({ title: "COO", version: 2 });
    expect(
      await status(
        core.updateContact(alice, contact.id, { version: 1, name: "X" }),
      ),
    ).toBe(409);
    expect(
      await status(
        core.updateContact(bob, contact.id, { version: 2, archived: true }),
      ),
    ).toBe(403);
    expect(
      await audited(() =>
        core.updateContact(alice, contact.id, { version: 2, archived: true }),
      ),
    ).toEqual({ "contacts.update": 1 });
    expect(
      (await core.listContacts(alice, w)).some((c) => c.id === contact.id),
    ).toBe(false);
    expect(
      (await core.listContacts(alice, w, { includeArchived: true })).some(
        (c) => c.id === contact.id,
      ),
    ).toBe(true);
    const back = await core.updateContact(alice, contact.id, {
      version: 3,
      archived: false,
    });
    expect(back).toMatchObject({ archivedAt: null, version: 4 });
    await clean();
  });

  it("moves exclusive roles, rejects out-of-scope roles and non-employer company links", async () => {
    const co = await core.createCompany(alice, w, { name: "HuiTong Pay" });
    const other = await core.createCompany(alice, w, { name: "Qinglan" });
    const project = await core.createProject(alice, w, { name: "Checkout" });
    const t = await task("Payment sign-off", project.id);
    const [c1, c2, c3] = await Promise.all(
      ["Cheung Wing", "Wong Chi-ming", "Ng Ka-lok"].map((name, i) =>
        core.createContact(alice, w, {
          name,
          companyId: i < 2 ? co.id : other.id,
        }),
      ),
    );
    // Company: chair is exclusive.
    let first!: Awaited<ReturnType<Core["setContactRoles"]>>;
    expect(
      await audited(async () => {
        first = await core.setContactRoles(alice, "company", co.id, c1.id, {
          roles: ["decider", "chair"],
        });
      }),
    ).toEqual({ "company_contacts.insert": 1, "contact_roles.insert": 2 });
    expect(first).toMatchObject({
      link: { scope: "company", entityId: co.id, roles: ["decider", "chair"] },
      replaced: [],
      addedProjectStakeholder: false,
      previousRoles: null,
    });
    const moved = await core.setContactRoles(bob, "company", co.id, c2.id, {
      roles: ["chair"],
    });
    expect(moved.replaced).toEqual([{ role: "chair", contactId: c1.id }]);
    const companyLinks = await core.listContactLinks(alice, "company", co.id);
    expect(companyLinks.map((link) => [link.contact.name, link.roles])).toEqual(
      [
        ["Cheung Wing", ["decider"]],
        ["Wong Chi-ming", ["chair"]],
      ],
    );
    // Rule 2: roles are limited by scope.
    expect(
      await status(
        core.setContactRoles(alice, "project", project.id, c1.id, {
          roles: ["chair"],
        }),
      ),
    ).toBe(400);
    expect(
      await status(
        core.setContactRoles(alice, "company", co.id, c1.id, {
          roles: ["signoff"],
        }),
      ),
    ).toBe(400);
    expect(
      await status(
        core.setContactRoles(alice, "task", t.id, c1.id, { roles: ["broker"] }),
      ),
    ).toBe(400);
    // Rule 5: only the employer can be linked at company level.
    expect(
      await status(
        core.setContactRoles(alice, "company", co.id, c3.id, { roles: [] }),
      ),
    ).toBe(400);
    // Project: sign-off is exclusive.
    await core.setContactRoles(alice, "project", project.id, c1.id, {
      roles: ["signoff"],
    });
    const projectMove = await core.setContactRoles(
      alice,
      "project",
      project.id,
      c2.id,
      { roles: ["signoff", "tech"] },
    );
    expect(projectMove.replaced).toEqual([
      { role: "signoff", contactId: c1.id },
    ]);
    expect(projectMove.link.roles).toEqual(["tech", "signoff"]);
    // Task: sign-off is exclusive and a task contact becomes a stakeholder.
    let taskLink!: Awaited<ReturnType<Core["setContactRoles"]>>;
    expect(
      await audited(async () => {
        taskLink = await core.setContactRoles(alice, "task", t.id, c3.id, {
          roles: ["signoff"],
        });
      }),
    ).toEqual({
      "project_contacts.insert": 1,
      "task_contacts.insert": 1,
      "contact_roles.insert": 1,
    });
    expect(taskLink.addedProjectStakeholder).toBe(true);
    const taskMove = await core.setContactRoles(alice, "task", t.id, c1.id, {
      roles: ["signoff"],
    });
    expect(taskMove).toMatchObject({
      replaced: [{ role: "signoff", contactId: c3.id }],
      addedProjectStakeholder: false,
      previousRoles: null,
    });
    expect(
      (await core.listContactLinks(alice, "project", project.id)).map(
        (link) => link.contactId,
      ),
    ).toEqual(expect.arrayContaining([c1.id, c2.id, c3.id]));
    // Editing an existing link reports its previous roles for undo.
    const edited = await core.setContactRoles(alice, "task", t.id, c1.id, {
      roles: ["decider"],
    });
    expect(edited.previousRoles).toEqual(["signoff"]);
    // A task without a project cannot hold contacts.
    const loose = await task("No project", null);
    expect(
      await status(
        core.setContactRoles(alice, "task", loose.id, c1.id, { roles: [] }),
      ),
    ).toBe(400);
    await clean();
  });

  it("removing a stakeholder cascades its task links and reports the count", async () => {
    const project = await core.createProject(alice, w, {
      name: "Stakeholders",
    });
    const [t1, t2] = await Promise.all([
      task("First", project.id),
      task("Second", project.id),
    ]);
    const contact = await core.createContact(alice, w, { name: "Chan Ka-ho" });
    await core.setContactRoles(alice, "task", t1.id, contact.id, {
      roles: ["tech"],
    });
    await core.setContactRoles(alice, "task", t2.id, contact.id, {
      roles: [],
    });
    let result!: Awaited<ReturnType<Core["unlinkContact"]>>;
    const changes = await audited(async () => {
      result = await core.unlinkContact(
        alice,
        "project",
        project.id,
        contact.id,
      );
    });
    expect(result).toEqual({
      cascadedTaskLinks: 2,
      undo: {
        workspaceId: w,
        expectedState: expect.stringMatching(/^[a-f0-9]{64}$/),
        steps: [
          {
            method: "PUT",
            scope: "project",
            entityId: project.id,
            contactId: contact.id,
            roles: [],
          },
          ...[t1, t2]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((t) => ({
              method: "PUT",
              scope: "task",
              entityId: t.id,
              contactId: contact.id,
              roles: t.id === t1.id ? ["tech"] : [],
            })),
        ],
      },
    });
    expect(changes).toEqual({
      "project_contacts.delete": 1,
      "task_contacts.delete": 2,
      "contact_roles.delete": 1,
    });
    expect(await core.listContactLinks(alice, "task", t1.id)).toEqual([]);
    expect(
      await status(
        core.unlinkContact(alice, "project", project.id, contact.id),
      ),
    ).toBe(404);
    // Unlinking a task contact leaves the stakeholder.
    await core.setContactRoles(alice, "task", t1.id, contact.id, { roles: [] });
    expect(await core.unlinkContact(alice, "task", t1.id, contact.id)).toEqual({
      cascadedTaskLinks: 0,
      undo: {
        workspaceId: w,
        expectedState: expect.stringMatching(/^[a-f0-9]{64}$/),
        steps: [
          {
            method: "PUT",
            scope: "task",
            entityId: t1.id,
            contactId: contact.id,
            roles: [],
          },
        ],
      },
    });
    expect(
      await core.listContactLinks(alice, "project", project.id),
    ).toHaveLength(1);
    await clean();
  });

  it("changing a contact's company drops the old company links, and a second call restores", async () => {
    const co1 = await core.createCompany(alice, w, { name: "Shikawa" });
    const co2 = await core.createCompany(alice, w, {
      name: "Shikawa Holdings",
    });
    const contact = await core.createContact(alice, w, {
      name: "Leung Wing-sze",
      companyId: co1.id,
    });
    await core.setContactRoles(alice, "company", co1.id, contact.id, {
      roles: ["decider", "finance"],
    });
    let result!: Awaited<ReturnType<Core["setContactCompany"]>>;
    const changes = await audited(async () => {
      result = await core.setContactCompany(alice, contact.id, {
        version: 1,
        companyId: co2.id,
      });
    });
    expect(result).toMatchObject({
      dropped: 1,
      previousCompanyId: co1.id,
      contact: { companyId: co2.id, version: 2 },
    });
    expect(changes).toEqual({
      "company_contacts.delete": 1,
      "contact_roles.delete": 2,
      "contacts.update": 1,
    });
    expect(await core.listContactLinks(alice, "company", co1.id)).toEqual([]);
    expect(
      await status(
        core.setContactCompany(alice, contact.id, {
          version: 1,
          companyId: co1.id,
        }),
      ),
    ).toBe(409);
    // Undo: move back, then restore the dropped link with its roles.
    const back = await core.setContactCompany(alice, contact.id, {
      version: 2,
      companyId: co1.id,
    });
    expect(back).toMatchObject({ dropped: 0, previousCompanyId: co2.id });
    await core.setContactRoles(alice, "company", co1.id, contact.id, {
      roles: ["decider", "finance"],
    });
    expect(
      (await core.listContactLinks(alice, "company", co1.id))[0].roles,
    ).toEqual(["decider", "finance"]);
    // Clearing the employer works too; a foreign or archived company does not.
    const other = await core.createCompany(outsider, otherW, { name: "Else" });
    expect(
      await status(
        core.setContactCompany(alice, contact.id, {
          version: 3,
          companyId: other.id,
        }),
      ),
    ).toBe(400);
    const cleared = await core.setContactCompany(alice, contact.id, {
      version: 3,
      companyId: null,
    });
    expect(cleared).toMatchObject({ dropped: 1, contact: { companyId: null } });
    const detail = await core.getContactDetail(alice, contact.id);
    expect(detail).toMatchObject({ company: null, links: [] });
    await clean();
  });

  it("refuses new links to archived contacts but reads their history", async () => {
    const project = await core.createProject(alice, w, { name: "Archive" });
    const contact = await core.createContact(alice, w, { name: "Archived" });
    await core.setContactRoles(alice, "project", project.id, contact.id, {
      roles: ["ops"],
    });
    await core.updateContact(alice, contact.id, { version: 1, archived: true });
    const t = await task("Later", project.id);
    expect(
      await status(
        core.setContactRoles(alice, "task", t.id, contact.id, { roles: [] }),
      ),
    ).toBe(400);
    const archivedProject = await core.createProject(alice, w, { name: "Old" });
    await core.updateProject(alice, archivedProject.id, {
      version: 1,
      archived: true,
    });
    const active = await core.createContact(alice, w, { name: "Active" });
    expect(
      await status(
        core.setContactRoles(alice, "project", archivedProject.id, active.id, {
          roles: [],
        }),
      ),
    ).toBe(400);
    const detail = await core.getContactDetail(alice, contact.id);
    expect(detail.links).toEqual([
      {
        scope: "project",
        entityId: project.id,
        title: "Archive",
        projectId: project.id,
        roles: ["ops"],
      },
    ]);
    await clean();
  });

  it("moves task contacts with the task's project and removes them without one", async () => {
    const p1 = await core.createProject(alice, w, { name: "Move from" });
    const p2 = await core.createProject(alice, w, { name: "Move to" });
    const t = await task("Movable", p1.id);
    const [a, b] = await Promise.all([
      core.createContact(alice, w, { name: "Mover A" }),
      core.createContact(alice, w, { name: "Mover B" }),
    ]);
    await core.setContactRoles(alice, "task", t.id, a.id, {
      roles: ["signoff"],
    });
    await core.setContactRoles(alice, "task", t.id, b.id, { roles: ["tech"] });
    // b is already a stakeholder of the destination project.
    await core.setContactRoles(alice, "project", p2.id, b.id, {
      roles: ["broker"],
    });
    const moved = await core.updateTask(alice, t.id, {
      version: t.version,
      projectId: p2.id,
    });
    expect(moved.projectId).toBe(p2.id);
    const links = await core.listContactLinks(alice, "task", t.id);
    expect(links.map((link) => [link.contactId, link.roles])).toEqual(
      expect.arrayContaining([
        [a.id, ["signoff"]],
        [b.id, ["tech"]],
      ]),
    );
    const destination = await core.listContactLinks(alice, "project", p2.id);
    expect(destination.map((link) => [link.contactId, link.roles])).toEqual(
      expect.arrayContaining([
        [a.id, []],
        [b.id, ["broker"]],
      ]),
    );
    expect(
      (await core.getContactDetail(alice, a.id)).links.find(
        (link) => link.scope === "task",
      )?.projectId,
    ).toBe(p2.id);
    // Removing the old stakeholder no longer touches the moved task link.
    await core.setContactRoles(alice, "project", p1.id, a.id, { roles: [] });
    expect(await core.unlinkContact(alice, "project", p1.id, a.id)).toEqual({
      cascadedTaskLinks: 0,
      undo: {
        workspaceId: w,
        expectedState: expect.stringMatching(/^[a-f0-9]{64}$/),
        steps: [
          {
            method: "PUT",
            scope: "project",
            entityId: p1.id,
            contactId: a.id,
            roles: [],
          },
        ],
      },
    });
    await clean();
    const cleared = await core.updateTask(alice, t.id, {
      version: moved.version,
      projectId: null,
    });
    expect(cleared.projectId).toBeNull();
    expect(await core.listContactLinks(alice, "task", t.id)).toEqual([]);
    expect(await core.listContactLinks(alice, "project", p2.id)).toHaveLength(
      2,
    );
    await clean();
  });

  it("redacts phone and email for agents without crm.contact_details and keeps agents read-only", async () => {
    const co = await core.createCompany(alice, w, { name: "Redacted Co" });
    const contact = await core.createContact(alice, w, {
      name: "Private Person",
      companyId: co.id,
      phone: "+852 6000 0000",
      email: "private@example.com",
    });
    // crm.read defaults to ask: no grant, no read.
    expect(await status(core.listContacts(crmAgent, w))).toBe(403);
    await core.setAgentPermission(alice, agentId, {
      capability: "crm.read",
      decision: "allow",
    });
    // The token scope stays binding.
    expect(await status(core.listContacts(plainAgent, w))).toBe(403);
    const listed = await core.listContacts(crmAgent, w);
    const seen = listed.find((c) => c.id === contact.id);
    expect(seen).toMatchObject({ phone: null, email: null });
    expect(
      await core.listContacts(crmAgent, w, { query: "private@example" }),
    ).toEqual([]);
    expect(
      (await core.getContactDetail(crmAgent, contact.id)).contact,
    ).toMatchObject({ phone: null, email: null });
    expect((await core.getCompany(crmAgent, co.id)).contacts[0]).toMatchObject({
      phone: null,
      email: null,
    });
    expect(
      (await core.searchCrm(crmAgent, w, "private")).contacts[0],
    ).toMatchObject({ phone: null, email: null });
    // People always see details.
    expect(
      (await core.getContactDetail(bob, contact.id)).contact,
    ).toMatchObject({ phone: "+852 6000 0000", email: "private@example.com" });
    await core.setAgentPermission(alice, agentId, {
      capability: "crm.contact_details",
      decision: "allow",
    });
    expect(
      (await core.getContactDetail(crmAgent, contact.id)).contact,
    ).toMatchObject({ phone: "+852 6000 0000" });
    // No agent write path exists.
    expect(
      await status(core.createContact(crmAgent, w, { name: "Agent made" })),
    ).toBe(403);
    expect(
      await status(
        core.updateContact(crmAgent, contact.id, { version: 1, title: "X" }),
      ),
    ).toBe(403);
    expect(
      await status(
        core.setContactRoles(crmAgent, "company", co.id, contact.id, {
          roles: [],
        }),
      ),
    ).toBe(403);
    await core.setAgentPermission(alice, agentId, {
      capability: "crm.contact_details",
      decision: "deny",
    });
    await core.setAgentPermission(alice, agentId, {
      capability: "crm.read",
      decision: "ask",
    });
    await clean();
  });

  it("forbids guests and outsiders and rejects cross-workspace ids", async () => {
    const co = await core.createCompany(alice, w, { name: "Guarded" });
    const contact = await core.createContact(alice, w, {
      name: "Guarded Contact",
      companyId: co.id,
    });
    const project = await core.createProject(alice, w, { name: "Guarded P" });
    for (const read of [
      () => core.listCompanies(guest, w),
      () => core.listContacts(guest, w),
      () => core.getCompany(guest, co.id),
      () => core.getContactDetail(guest, contact.id),
      () => core.listContactLinks(guest, "project", project.id),
      () => core.searchCrm(guest, w, "g"),
      () => core.createCompany(guest, w, { name: "No" }),
      () =>
        core.setContactRoles(guest, "project", project.id, contact.id, {
          roles: [],
        }),
      () => core.getContactDetail(outsider, contact.id),
      () => core.listContactLinks(outsider, "company", co.id),
      () => core.unlinkContact(outsider, "company", co.id, contact.id),
      () => core.auditCrm(bob, w),
    ])
      expect(await status(read())).toBe(403);
    const foreignCompany = await core.createCompany(outsider, otherW, {
      name: "Foreign",
    });
    const foreignContact = await core.createContact(outsider, otherW, {
      name: "Foreign Contact",
    });
    const foreignProject = await core.createProject(outsider, otherW, {
      name: "Foreign P",
    });
    expect(
      await status(
        core.createContact(alice, w, {
          name: "Bad employer",
          companyId: foreignCompany.id,
        }),
      ),
    ).toBe(400);
    expect(
      await status(
        core.setContactRoles(alice, "project", project.id, foreignContact.id, {
          roles: [],
        }),
      ),
    ).toBe(400);
    expect(
      await status(
        core.setContactRoles(alice, "project", foreignProject.id, contact.id, {
          roles: [],
        }),
      ),
    ).toBe(403);
    expect(await status(core.getCompany(alice, foreignCompany.id))).toBe(403);
    expect(
      await status(
        core.setContactRoles(alice, "project", randomUUID(), contact.id, {
          roles: [],
        }),
      ),
    ).toBe(404);
    expect(
      await status(core.listContactLinks(alice, "nope" as "task", project.id)),
    ).toBe(400);
    await clean();
    expect(await core.auditCrm(outsider, otherW)).toEqual([]);
  });

  it("reads a company with its people, roles and client projects, and searches CRM records", async () => {
    const co = await core.createCompany(alice, w, {
      name: "Zebra Searchable Ltd",
      industry: "Logistics",
    });
    const contact = await core.createContact(alice, w, {
      name: "Zebra Person",
      title: "Buyer",
      companyId: co.id,
      email: "buyer@zebra.example",
    });
    const gone = await core.createContact(alice, w, { name: "Zebra Archived" });
    await core.updateContact(alice, gone.id, { version: 1, archived: true });
    await core.setContactRoles(alice, "company", co.id, contact.id, {
      roles: ["chair"],
    });
    const project = await core.createProject(alice, w, { name: "Zebra P" });
    await core.updateProject(alice, project.id, {
      version: 1,
      clientCompanyId: co.id,
    });
    const detail = await core.getCompany(alice, co.id);
    expect(detail.company.id).toBe(co.id);
    expect(detail.contacts.map((c) => c.id)).toEqual([contact.id]);
    expect(detail.links).toMatchObject([
      { contactId: contact.id, roles: ["chair"] },
    ]);
    expect(detail.projects.map((p) => p.id)).toEqual([project.id]);
    const found = await core.searchCrm(alice, w, "ZEBRA");
    expect(found.companies.map((c) => c.id)).toEqual([co.id]);
    expect(found.contacts.map((c) => c.id)).toEqual([contact.id]);
    expect(
      (await core.searchCrm(alice, w, "buyer@zebra")).contacts.map((c) => c.id),
    ).toEqual([contact.id]);
    expect(
      (await core.searchCrm(alice, w, "logistics")).companies.map((c) => c.id),
    ).toEqual([co.id]);
    expect(
      (await core.listContacts(alice, w, { companyId: co.id })).map(
        (c) => c.id,
      ),
    ).toEqual([contact.id]);
    expect((await core.searchCrm(outsider, otherW, "zebra")).contacts).toEqual(
      [],
    );
    await clean();
  });
  it("rejects Undo after a task moved while its removed contact links were absent", async () => {
    const source = await core.createProject(alice, w, {
      name: "Absent-link source",
    });
    const destination = await core.createProject(alice, w, {
      name: "Absent-link destination",
    });
    const work = await task("Absent-link task", source.id);
    const contact = await core.createContact(alice, w, {
      name: "Absent-link contact",
    });
    await core.setContactRoles(alice, "task", work.id, contact.id, {
      roles: ["tech"],
    });
    const removed = await core.unlinkContact(
      alice,
      "project",
      source.id,
      contact.id,
    );
    await core.updateTask(alice, work.id, {
      version: work.version,
      projectId: destination.id,
    });
    expect(await status(core.undoCrm(alice, removed.undo!))).toBe(409);
    expect(await core.listContactLinks(alice, "task", work.id)).toEqual([]);
    expect(await core.listContactLinks(alice, "project", source.id)).toEqual(
      [],
    );
    expect(
      await core.listContactLinks(alice, "project", destination.id),
    ).toEqual([]);
    await clean();
  });

  it.each(["project", "task"] as const)(
    "rejects a busy inverse %s immediately instead of waiting in a workspace lock cycle",
    async (scope) => {
      const project = await core.createProject(alice, w, {
        name: `Busy inverse ${scope}`,
      });
      const work = await task(`Busy inverse ${scope}`, project.id);
      const contact = await core.createContact(alice, w, {
        name: `Busy inverse ${scope}`,
      });
      await core.setContactRoles(alice, "task", work.id, contact.id, {
        roles: ["tech"],
      });
      const removed = await core.unlinkContact(
        alice,
        "project",
        project.id,
        contact.id,
      );
      let pending: Promise<number> | undefined;
      try {
        await connection.db.transaction(async (tx) => {
          if (scope === "project")
            await tx
              .select()
              .from(projects)
              .where(eq(projects.id, project.id))
              .for("share");
          else
            await tx
              .select()
              .from(tasks)
              .where(eq(tasks.id, work.id))
              .for("update");
          pending = status(core.undoCrm(alice, removed.undo!));
          let timer: ReturnType<typeof setTimeout> | undefined;
          const result = await Promise.race([
            pending,
            new Promise<string>((resolve) => {
              timer = setTimeout(() => resolve("waited"), 5000);
            }),
          ]);
          clearTimeout(timer);
          expect(result).toBe(409);
          // A task-first creator can now obtain the workspace; Undo released it.
          await tx
            .select()
            .from(workspaces)
            .where(eq(workspaces.id, w))
            .for("update", { noWait: true });
        });
      } finally {
        if (pending) await pending;
      }
      expect(await core.listContactLinks(alice, "task", work.id)).toEqual([]);
      await core.undoCrm(alice, removed.undo!);
      expect(
        (await core.listContactLinks(alice, "task", work.id))[0].roles,
      ).toEqual(["tech"]);
      await clean();
    },
  );

  it.each(["create", "update"] as const)(
    "serializes contact %s before row writes when a CRM inverse holds the workspace",
    async (action) => {
      const contact = await core.createContact(alice, w, {
        name: `Serialized ${action}`,
      });
      let pending: Promise<unknown> | undefined;
      try {
        await connection.db.transaction(async (tx) => {
          await tx
            .select()
            .from(workspaces)
            .where(eq(workspaces.id, w))
            .for("update");
          const [blocker] = await tx.execute<{ pid: number }>(
            sql`select pg_backend_pid()::int as pid`,
          );
          pending =
            action === "create"
              ? core.createContact(alice, w, { name: "Waited creation" })
              : core.updateContact(alice, contact.id, {
                  version: contact.version,
                  name: "Waited update",
                });
          let blocked = false;
          for (let attempt = 0; attempt < 100; attempt++) {
            const [row] = await connection.db.execute<{ blocked: boolean }>(
              sql`select exists (select 1 from pg_stat_activity where ${blocker.pid} = any(pg_blocking_pids(pid))) as blocked`,
            );
            if (row.blocked) {
              blocked = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          expect(blocked).toBe(true);
        });
      } finally {
        if (pending) await pending;
      }
      await clean();
    },
  );

  it("rejects stale exclusive-role Undo without taking back a newer holder's role", async () => {
    const project = await core.createProject(alice, w, {
      name: "Guarded role undo",
    });
    const [a, b, c] = await Promise.all(
      ["Holder A", "Holder B", "Holder C"].map((name) =>
        core.createContact(alice, w, { name }),
      ),
    );
    await core.setContactRoles(alice, "project", project.id, a.id, {
      roles: ["signoff", "tech"],
    });
    const moved = await core.setContactRoles(
      alice,
      "project",
      project.id,
      b.id,
      { roles: ["signoff"] },
    );
    // Capture is authoritative, including A's nonexclusive role, not a client cache.
    expect(moved.undo!.steps).toEqual([
      {
        method: "DELETE",
        scope: "project",
        entityId: project.id,
        contactId: b.id,
      },
      {
        method: "PUT",
        scope: "project",
        entityId: project.id,
        contactId: a.id,
        roles: ["tech", "signoff"],
      },
    ]);
    await core.setContactRoles(bob, "project", project.id, c.id, {
      roles: ["signoff"],
    });
    const before = await core.listContactLinks(alice, "project", project.id);
    expect(await status(core.undoCrm(alice, moved.undo!))).toBe(409);
    expect(await core.listContactLinks(alice, "project", project.id)).toEqual(
      before,
    );
    await clean();
  });

  it("restores stakeholder cascades atomically and rolls back the first step if a later step fails", async () => {
    const project = await core.createProject(alice, w, {
      name: "Atomic cascade undo",
    });
    const work = await task("Cascade undo work", project.id);
    const contact = await core.createContact(alice, w, {
      name: "Cascade undo contact",
    });
    await core.setContactRoles(alice, "task", work.id, contact.id, {
      roles: ["tech"],
    });
    const removed = await core.unlinkContact(
      alice,
      "project",
      project.id,
      contact.id,
    );
    const undo = removed.undo!;
    expect(undo.steps).toHaveLength(2);
    const bad = {
      ...undo,
      steps: [
        undo.steps[0],
        {
          method: "PUT" as const,
          scope: "task" as const,
          entityId: work.id,
          contactId: contact.id,
          roles: ["chair" as const],
        },
      ],
    };
    const activityBefore = await connection.db
      .select({ n: sql<number>`count(*)::int` })
      .from(activity)
      .where(eq(activity.workspaceId, w));
    expect(await status(core.undoCrm(alice, bad))).toBe(400);
    expect(await core.listContactLinks(alice, "project", project.id)).toEqual(
      [],
    );
    expect(await core.listContactLinks(alice, "task", work.id)).toEqual([]);
    expect(
      await connection.db
        .select({ n: sql<number>`count(*)::int` })
        .from(activity)
        .where(eq(activity.workspaceId, w)),
    ).toEqual(activityBefore);
    expect(await core.undoCrm(alice, undo)).toEqual({ restored: true });
    expect(
      (await core.listContactLinks(alice, "task", work.id))[0].roles,
    ).toEqual(["tech"]);
    expect(
      await core.listContactLinks(alice, "project", project.id),
    ).toHaveLength(1);
    await clean();
  });

  it("restores company and company roles atomically, preserving the move on inverse failure", async () => {
    const old = await core.createCompany(alice, w, {
      name: "Old guarded employer",
    });
    const next = await core.createCompany(alice, w, {
      name: "New guarded employer",
    });
    const contact = await core.createContact(alice, w, {
      name: "Guarded employee",
      companyId: old.id,
    });
    await core.setContactRoles(alice, "company", old.id, contact.id, {
      roles: ["chair"],
    });
    const moved = await core.setContactCompany(alice, contact.id, {
      version: contact.version,
      companyId: next.id,
    });
    const undo = moved.undo!;
    expect(
      await status(
        core.undoCrm(alice, {
          ...undo,
          steps: [
            ...undo.steps,
            {
              method: "PUT",
              scope: "company",
              entityId: old.id,
              contactId: contact.id,
              roles: ["signoff"],
            },
          ],
        }),
      ),
    ).toBe(400);
    expect(
      (await core.getContactDetail(alice, contact.id)).contact.companyId,
    ).toBe(next.id);
    expect(await core.listContactLinks(alice, "company", old.id)).toEqual([]);
    await core.undoCrm(alice, undo);
    expect(
      (await core.getContactDetail(alice, contact.id)).contact.companyId,
    ).toBe(old.id);
    expect(
      (await core.listContactLinks(alice, "company", old.id))[0].roles,
    ).toEqual(["chair"]);
    await clean();
  });

  it.each(["member", "guest", "outsider", "agent", "plain-agent"] as const)(
    "CRM Undo applies contact:manage for %s",
    async (kind) => {
      const project = await core.createProject(alice, w, {
        name: `Undo permission ${kind}`,
      });
      const contact = await core.createContact(alice, w, {
        name: `Undo permission ${kind}`,
      });
      const changed = await core.setContactRoles(
        alice,
        "project",
        project.id,
        contact.id,
        { roles: [] },
      );
      const principal = {
        member: bob,
        guest,
        outsider,
        agent: crmAgent,
        "plain-agent": plainAgent,
      }[kind];
      expect(await status(core.undoCrm(principal, changed.undo!))).toBe(
        kind === "member" ? 200 : 403,
      );
    },
  );

  it("rejects foreign-workspace inverse steps even with a valid local guard", async () => {
    const local = await core.createProject(alice, w, { name: "Local inverse" });
    const contact = await core.createContact(alice, w, {
      name: "Local inverse",
    });
    const changed = await core.setContactRoles(
      alice,
      "project",
      local.id,
      contact.id,
      { roles: [] },
    );
    const foreign = await core.createProject(outsider, otherW, {
      name: "Foreign inverse",
    });
    expect(
      await status(
        core.undoCrm(alice, {
          ...changed.undo!,
          steps: [
            {
              method: "PUT",
              scope: "project",
              entityId: foreign.id,
              contactId: contact.id,
              roles: [],
            },
          ],
        }),
      ),
    ).toBe(400);
    expect(
      await core.listContactLinks(alice, "project", local.id),
    ).toHaveLength(1);
  });

  it("auditCrm reports rows that bypassed the constraints", async () => {
    const co1 = await core.createCompany(alice, w, { name: "Audit One" });
    const co2 = await core.createCompany(alice, w, { name: "Audit Two" });
    const project = await core.createProject(alice, w, { name: "Audit P" });
    const t = await task("Audit task", project.id);
    const contact = await core.createContact(alice, w, {
      name: "Audit Contact",
      companyId: co1.id,
    });
    // Replica mode skips FK and audit triggers (test superuser only), so
    // the rows below break rules the schema normally makes impossible.
    const [bad] = await connection.db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      return tx.execute<{ company: string; task: string }>(sql`
        WITH c AS (INSERT INTO company_contacts(workspace_id, company_id, contact_id)
          VALUES (${w}, ${co2.id}, ${contact.id}) RETURNING id),
        t AS (INSERT INTO task_contacts(workspace_id, task_id, project_id, contact_id)
          VALUES (${w}, ${t.id}, ${project.id}, ${contact.id}) RETURNING id)
        SELECT (SELECT id::text FROM c) AS company, (SELECT id::text FROM t) AS task`);
    });
    try {
      expect(await core.auditCrm(alice, w)).toEqual(
        expect.arrayContaining([
          { code: "foreign_company_link", id: bad.company },
          { code: "task_contact_not_stakeholder", id: bad.task },
        ]),
      );
    } finally {
      await connection.db.transaction(async (tx) => {
        await tx.execute(sql`set local session_replication_role = replica`);
        await tx.execute(
          sql`DELETE FROM company_contacts WHERE id = ${bad.company}`,
        );
        await tx.execute(sql`DELETE FROM task_contacts WHERE id = ${bad.task}`);
      });
    }
    await clean();
  });
});
