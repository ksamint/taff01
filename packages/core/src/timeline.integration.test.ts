import { randomUUID } from "node:crypto";
import { activity, connectDatabase, grants, members } from "@taff/db";
import { timelineSchema } from "@taff/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn(
    "SKIP M12 timeline PostgreSQL tests: TEST_DATABASE_URL required",
  );
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("M12 tests require isolated _test database");
describe.skipIf(!url)(
  "M12 timeline, milestones, dependencies and finance",
  () => {
    let core: Core;
    let connection: ReturnType<typeof connectDatabase>;
    let alice: Principal;
    let bob: Principal;
    let outsider: Principal;
    let agent: Principal;
    let readOnlyAgent: Principal;
    let aliceId: string;
    let w: string;
    let owner: string;
    let bobMember: string;
    let agentId: string;
    let outsiderW: string;
    let outsiderMember: string;
    let projectId: string;
    const mutated: string[] = [];
    beforeAll(async () => {
      await migrateDatabase(url!);
      connection = connectDatabase(url!);
      core = createCore({
        databaseUrl: url!,
        authUrl: "http://localhost:3000",
        authSecret: "m12-test-secret-longer-than-thirty-two-characters",
        tokenPepper: "m12-test-pepper-at-least-sixteen",
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
      aliceId = a.user.id;
      alice = userPrincipal(aliceId);
      await core.updateProfile(aliceId, { locale: "en", tz: "Asia/Hong_Kong" });
      const me = await core.getMe(aliceId);
      w = me.workspaces[0].id;
      owner = me.workspaces[0].memberId;
      const b = await signup("Bob Lee");
      bob = userPrincipal(b.user.id);
      const o = await signup("Outsider");
      outsider = userPrincipal(o.user.id);
      const outsiderMe = await core.getMe(o.user.id);
      outsiderW = outsiderMe.workspaces[0].id;
      outsiderMember = outsiderMe.workspaces[0].memberId;
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id',${aliceId},true)`,
        );
        const [bm] = await tx
          .insert(members)
          .values({
            workspaceId: w,
            userId: b.user.id,
            name: "Bob Lee",
            kind: "person",
          })
          .returning();
        bobMember = bm.id;
        const [am] = await tx
          .insert(members)
          .values({ workspaceId: w, name: "Planning Agent", kind: "agent" })
          .returning();
        agentId = am.id;
      });
      const token = await core.createAgentToken(alice, {
        workspaceId: w,
        memberId: agentId,
        name: "M12 full",
        scopes: ["tasks:read", "tasks:write", "calendar:write"],
      });
      agent = (await core.authenticateAgentToken(token.token))!;
      const readOnly = await core.createAgentToken(alice, {
        workspaceId: w,
        memberId: agentId,
        name: "M12 read",
        scopes: ["tasks:read"],
      });
      readOnlyAgent = (await core.authenticateAgentToken(readOnly.token))!;
      projectId = (await core.createProject(alice, w, { name: "Checkout v2" }))
        .id;
    }, 30000);
    afterAll(async () => {
      if (core) await core.close();
      if (connection) await connection.close();
    });
    const create = (
      title: string,
      fields: Partial<Parameters<Core["createTask"]>[1]> = {},
    ) =>
      core.createTask(alice, {
        workspaceId: w,
        ownerId: owner,
        workerId: null,
        projectId,
        title,
        ...fields,
      });
    const item = async (p: Principal, id: string) =>
      (await core.getTimeline(p, projectId)).items.find((x) => x.id === id);

    it("creates and updates a plan with optimistic versions and keeps due_at on its last day", async () => {
      // 10:30 in Hong Kong on Oct 10.
      const task = await create("Ship release", {
        dueAt: "2026-10-10T02:30:00.000Z",
      });
      const first = await core.setTaskPlan(alice, task.id, {
        startDate: "2026-10-12",
        durationDays: 3,
      });
      mutated.push(task.id);
      expect(first.plans).toEqual([
        expect.objectContaining({
          taskId: task.id,
          startDate: "2026-10-12",
          durationDays: 3,
          version: 1,
        }),
      ]);
      expect(first.tasks).toEqual([
        expect.objectContaining({
          id: task.id,
          dueAt: "2026-10-14T02:30:00.000Z",
          version: task.version + 1,
        }),
      ]);
      await expect(
        core.setTaskPlan(alice, task.id, {
          startDate: "2026-10-12",
          durationDays: 3,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      await expect(
        core.setTaskPlan(alice, task.id, {
          version: 7,
          startDate: "2026-10-12",
          durationDays: 3,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      // Same last day: the task row is not written.
      const second = await core.setTaskPlan(alice, task.id, {
        version: 1,
        startDate: "2026-10-13",
        durationDays: 2,
      });
      expect(second.plans[0].version).toBe(2);
      expect(second.tasks).toEqual([]);
      await expect(
        core.setTaskPlan(alice, randomUUID(), {
          startDate: "2026-10-13",
          durationDays: 2,
        }),
      ).rejects.toMatchObject({ code: "not_found" });
      const undated = await create("No deadline yet");
      const third = await core.setTaskPlan(alice, undated.id, {
        startDate: "2026-10-20",
        durationDays: 1,
      });
      // 23:59 in Hong Kong.
      expect(third.tasks[0].dueAt).toBe("2026-10-20T15:59:00.000Z");
      expect(await item(alice, task.id)).toMatchObject({
        start: "2026-10-13",
        end: "2026-10-14",
        planned: true,
        version: 2,
      });
    });

    it("shifts the whole subtree by the delta of the span the timeline showed (D10)", async () => {
      const parent = await create("Parent");
      const c1 = await create("Child with plan", { parentId: parent.id });
      const g = await create("Grandchild", { parentId: c1.id });
      const c2 = await create("Child with deadline", {
        parentId: parent.id,
        dueAt: "2026-11-05T04:00:00.000Z",
      });
      await core.setTaskPlan(alice, c1.id, {
        startDate: "2026-11-02",
        durationDays: 2,
      });
      await core.setTaskPlan(alice, g.id, {
        startDate: "2026-11-03",
        durationDays: 1,
      });
      // C1 spans its child (Nov 3); C2 defaults to Nov 4–5; the parent shows Nov 3.
      expect(await item(alice, parent.id)).toMatchObject({
        start: "2026-11-03",
        end: "2026-11-05",
        hasChildren: true,
      });
      const shifted = await core.setTaskPlan(alice, parent.id, {
        startDate: "2026-11-06",
        durationDays: 3,
        shiftChildren: true,
      });
      expect(
        shifted.plans.map((plan) => [
          plan.taskId,
          plan.startDate,
          plan.version,
        ]),
      ).toEqual([
        [parent.id, "2026-11-06", 1],
        [c1.id, "2026-11-05", 2],
        [g.id, "2026-11-06", 2],
      ]);
      const dues = Object.fromEntries(
        shifted.tasks.map((task) => [task.id, task.dueAt]),
      );
      expect(dues).toEqual({
        [parent.id]: "2026-11-08T15:59:00.000Z",
        [c1.id]: "2026-11-06T15:59:00.000Z",
        [g.id]: "2026-11-06T15:59:00.000Z",
        [c2.id]: "2026-11-08T04:00:00.000Z",
      });
      expect(await item(alice, parent.id)).toMatchObject({
        start: "2026-11-06",
        end: "2026-11-08",
      });
      // A subtree holding work its mover may not schedule moves all or nothing.
      const bobsParent = await core.createTask(bob, {
        workspaceId: w,
        ownerId: bobMember,
        workerId: null,
        projectId,
        title: "Bob's parent",
      });
      const alicesChild = await core.createTask(bob, {
        workspaceId: w,
        ownerId: owner,
        workerId: null,
        parentId: bobsParent.id,
        title: "Alice's child",
        dueAt: "2026-11-10T04:00:00.000Z",
      });
      await expect(
        core.setTaskPlan(bob, bobsParent.id, {
          startDate: "2026-11-20",
          durationDays: 1,
          shiftChildren: true,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(await item(alice, alicesChild.id)).toMatchObject({
        end: "2026-11-10",
        planned: false,
      });
    });

    it("rejects a subtree inverse after a newer child edit, without changing any row", async () => {
      const parent = await create("Guarded parent");
      const child = await create("Guarded child", { parentId: parent.id });
      await core.setTaskPlan(alice, child.id, {
        startDate: "2026-11-02",
        durationDays: 2,
      });
      const moved = await core.setTaskPlan(alice, parent.id, {
        startDate: "2026-11-06",
        durationDays: 2,
        shiftChildren: true,
      });
      expect(moved.undoState).toMatch(/^[a-f0-9]{64}$/);
      await core.setTaskPlan(alice, child.id, {
        version: moved.plans.find((row) => row.taskId === child.id)!.version,
        startDate: "2026-11-10",
        durationDays: 2,
      });
      const before = await core.getTimeline(alice, projectId);
      await expect(
        core.setTaskPlan(alice, parent.id, {
          version: moved.plans[0].version,
          startDate: "2026-11-02",
          durationDays: 2,
          shiftChildren: true,
          expectedState: moved.undoState,
        }),
      ).rejects.toMatchObject({ code: "conflict", status: 409 });
      expect(await core.getTimeline(alice, projectId)).toEqual(before);
    });

    it("accepts an unchanged subtree inverse and rejects a newly added child", async () => {
      const parent = await create("Guarded membership parent");
      const child = await create("Guarded membership child", {
        parentId: parent.id,
      });
      await core.setTaskPlan(alice, child.id, {
        startDate: "2026-11-02",
        durationDays: 2,
      });
      const moved = await core.setTaskPlan(alice, parent.id, {
        startDate: "2026-11-06",
        durationDays: 2,
        shiftChildren: true,
      });
      const inverse = await core.setTaskPlan(alice, parent.id, {
        version: moved.plans[0].version,
        startDate: "2026-11-02",
        durationDays: 2,
        shiftChildren: true,
        expectedState: moved.undoState,
      });
      expect((await item(alice, child.id))!.start).toBe("2026-11-02");
      await create("New descendant", { parentId: parent.id });
      await expect(
        core.setTaskPlan(alice, parent.id, {
          version: inverse.plans[0].version,
          startDate: "2026-11-06",
          durationDays: 2,
          shiftChildren: true,
          expectedState: inverse.undoState,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("gates plans by task:schedule for people and agents", async () => {
      const alices = await create("Alice's task", { dueAt: null });
      await expect(
        core.setTaskPlan(bob, alices.id, {
          startDate: "2026-10-12",
          durationDays: 1,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        core.setTaskPlan(outsider, alices.id, {
          startDate: "2026-10-12",
          durationDays: 1,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        core.setTaskPlan(agent, alices.id, {
          startDate: "2026-10-12",
          durationDays: 1,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      const agentTask = await create("Agent's task", { workerId: agentId });
      const planned = await core.setTaskPlan(agent, agentTask.id, {
        startDate: "2026-10-12",
        durationDays: 2,
      });
      // Agents without a supervisor use UTC: 23:59Z on the last day.
      expect(planned.tasks[0].dueAt).toBe("2026-10-13T23:59:00.000Z");
      await expect(
        core.setTaskPlan(readOnlyAgent, agentTask.id, {
          version: 1,
          startDate: "2026-10-12",
          durationDays: 2,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
    });

    it("creates, updates and archives milestones as admin only", async () => {
      const created = await core.createMilestone(alice, projectId, {
        name: "v2.4 release",
        date: "2026-10-15",
      });
      mutated.push(created.id);
      expect(created).toMatchObject({ version: 1, archivedAt: null });
      await expect(
        core.createMilestone(bob, projectId, { name: "x", date: "2026-10-15" }),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        core.createMilestone(agent, projectId, {
          name: "x",
          date: "2026-10-15",
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      const moved = await core.updateMilestone(alice, created.id, {
        version: 1,
        date: "2026-10-16",
      });
      expect(moved).toMatchObject({ version: 2, date: "2026-10-16" });
      await expect(
        core.updateMilestone(alice, created.id, { version: 1, name: "Late" }),
      ).rejects.toMatchObject({ code: "conflict" });
      await expect(
        core.updateMilestone(bob, created.id, { version: 2, name: "Bob" }),
      ).rejects.toMatchObject({ code: "forbidden" });
      expect(
        (await core.listMilestones(bob, projectId)).map((m) => m.id),
      ).toContain(created.id);
      expect(await item(bob, created.id)).toMatchObject({
        kind: "milestone",
        start: "2026-10-16",
      });
      const archived = await core.archiveMilestone(alice, created.id, 2);
      expect(archived.archivedAt).not.toBeNull();
      expect(
        (await core.listMilestones(alice, projectId)).map((m) => m.id),
      ).not.toContain(created.id);
      expect(await item(alice, created.id)).toBeUndefined();
      const restored = await core.updateMilestone(alice, created.id, {
        version: archived.version,
        archived: false,
      });
      expect(restored.archivedAt).toBeNull();
      const again = await core.archiveMilestone(alice, created.id);
      expect(again.archivedAt).not.toBeNull();
    });

    it("adds and removes dependencies, rejecting duplicates, cycles and other workspaces", async () => {
      const a = await create("A", { dueAt: "2026-10-12T04:00:00.000Z" });
      const b = await create("B", { dueAt: "2026-10-14T04:00:00.000Z" });
      const c = await create("C", { dueAt: "2026-10-16T04:00:00.000Z" });
      const ab = await core.addDependency(alice, {
        predecessorTaskId: a.id,
        successorTaskId: b.id,
      });
      mutated.push(ab.id);
      const bc = await core.addDependency(alice, {
        predecessorTaskId: b.id,
        successorTaskId: c.id,
      });
      await expect(
        core.addDependency(alice, {
          predecessorTaskId: a.id,
          successorTaskId: b.id,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      await expect(
        core.addDependency(alice, {
          predecessorTaskId: c.id,
          successorTaskId: a.id,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      await expect(
        core.addDependency(alice, {
          predecessorTaskId: a.id,
          successorTaskId: a.id,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
      const foreign = await core.createTask(outsider, {
        workspaceId: outsiderW,
        ownerId: outsiderMember,
        workerId: null,
        title: "Elsewhere",
      });
      await expect(
        core.addDependency(alice, {
          predecessorTaskId: foreign.id,
          successorTaskId: a.id,
        }),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        core.addDependency(outsider, {
          predecessorTaskId: foreign.id,
          successorTaskId: a.id,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      const timeline = await core.getTimeline(alice, projectId);
      expect(
        timeline.dependencies.find((dep) => dep.id === ab.id),
      ).toMatchObject({
        from: { kind: "task", id: a.id },
        to: { kind: "task", id: b.id },
        conflict: false,
      });
      const removed = await core.removeDependency(alice, bc.id);
      mutated.push(bc.id);
      expect(removed.id).toBe(bc.id);
      await expect(core.removeDependency(alice, bc.id)).rejects.toMatchObject({
        code: "not_found",
      });
      // Without B→C, C→A no longer closes a cycle.
      const ca = await core.addDependency(alice, {
        predecessorTaskId: c.id,
        successorTaskId: a.id,
      });
      expect(
        (await core.getTimeline(alice, projectId)).dependencies.find(
          (dep) => dep.id === ca.id,
        )?.conflict,
      ).toBe(true);
      const milestone = await core.createMilestone(alice, projectId, {
        name: "Gate",
        date: "2026-10-20",
      });
      await core.addDependency(alice, {
        predecessorTaskId: b.id,
        successorMilestoneId: milestone.id,
      });
      await expect(
        core.addDependency(alice, {
          predecessorMilestoneId: milestone.id,
          successorTaskId: b.id,
        }),
      ).rejects.toMatchObject({ code: "conflict" });
    });

    it("gates dependency edits by the successor's owner, admins and its agent worker", async () => {
      const a = await create("Pred");
      const alices = await create("Alice's successor");
      const bobs = await core.createTask(bob, {
        workspaceId: w,
        ownerId: bobMember,
        workerId: null,
        projectId,
        title: "Bob's successor",
      });
      const agents = await create("Agent's successor", { workerId: agentId });
      await expect(
        core.addDependency(bob, {
          predecessorTaskId: a.id,
          successorTaskId: alices.id,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      const bobLink = await core.addDependency(bob, {
        predecessorTaskId: a.id,
        successorTaskId: bobs.id,
      });
      await expect(
        core.removeDependency(agent, bobLink.id),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        core.addDependency(agent, {
          predecessorTaskId: a.id,
          successorTaskId: alices.id,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        core.addDependency(readOnlyAgent, {
          predecessorTaskId: a.id,
          successorTaskId: agents.id,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      const agentLink = await core.addDependency(agent, {
        predecessorTaskId: a.id,
        successorTaskId: agents.id,
      });
      await expect(
        core.removeDependency(bob, agentLink.id),
      ).rejects.toMatchObject({ code: "forbidden" });
      await core.removeDependency(agent, agentLink.id);
      const milestone = await core.createMilestone(alice, projectId, {
        name: "Admin gate",
        date: "2026-10-21",
      });
      await expect(
        core.addDependency(bob, {
          predecessorTaskId: bobs.id,
          successorMilestoneId: milestone.id,
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
    });

    it("marks tasks with a pending grant as blocked", async () => {
      const task = await create("Needs staging write", {
        workerId: agentId,
        dueAt: "2026-10-12T04:00:00.000Z",
      });
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id',${aliceId},true)`,
        );
        await tx.insert(grants).values({
          workspaceId: w,
          agentId,
          capability: "staging.write",
          taskId: task.id,
          reason: "Needs staging write access",
        });
      });
      expect(await item(alice, task.id)).toMatchObject({
        blocked: true,
        workerIsAgent: true,
      });
      const timeline = await core.getTimeline(agent, projectId);
      expect(timelineSchema.parse(timeline)).toBeTruthy();
      expect(timeline.timeZone).toBe("UTC");
      expect(timeline.canEditPlan).toBe(true);
      expect(timeline.risk.reasons).toContain("blocked");
    });

    it("stores a project's stage and person in charge for admins", async () => {
      const created = await core.createProject(alice, w, {
        name: "Pipeline",
        stage: "lead",
        leadId: owner,
      });
      expect(created).toMatchObject({ stage: "lead", leadId: owner });
      const moved = await core.updateProject(alice, created.id, {
        version: created.version,
        stage: "contract_signed",
        leadId: bobMember,
      });
      expect(moved).toMatchObject({
        stage: "contract_signed",
        leadId: bobMember,
        version: created.version + 1,
      });
      for (const leadId of [agentId, outsiderMember, randomUUID()])
        await expect(
          core.updateProject(alice, created.id, {
            version: moved.version,
            leadId,
          }),
        ).rejects.toMatchObject({ code: "invalid_input" });
      await expect(
        core.updateProject(alice, created.id, {
          version: moved.version,
          stage: "won" as never,
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      await expect(
        core.updateProject(bob, created.id, {
          version: moved.version,
          stage: "in_service",
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      const cleared = await core.updateProject(alice, created.id, {
        version: moved.version,
        stage: null,
        leadId: null,
      });
      expect(cleared).toMatchObject({ stage: null, leadId: null });
      const asAgent = (await core.listProjects(agent, w)).find(
        (x) => x.id === moved.id,
      );
      expect(asAgent).toMatchObject({ stage: null, leadId: null });
      const [audit] = await connection.client<{ n: number }[]>`
        select count(*)::int as n from activity
        where resource_id=${created.id} and action='projects.update'`;
      expect(audit.n).toBe(2);
    });

    it("shows finance to people but not guests or agents, and records payments for admins", async () => {
      const finance = await core.createProject(alice, w, { name: "Paid work" });
      await expect(
        core.updateProject(alice, finance.id, {
          version: finance.version,
          contractAmount: "1000.00",
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      await expect(
        core.updateProject(bob, finance.id, {
          version: finance.version,
          contractAmount: "1000.00",
          currency: "HKD",
        }),
      ).rejects.toMatchObject({ code: "forbidden" });
      const updated = await core.updateProject(alice, finance.id, {
        version: finance.version,
        contractAmount: "1000.00",
        currency: "HKD",
      });
      expect(updated).toMatchObject({
        contractAmount: "1000.00",
        currency: "HKD",
      });
      const payment = await core.addPayment(alice, finance.id, {
        amount: "250.00",
        paidOn: "2026-10-01",
        note: "Deposit",
      });
      mutated.push(payment.id);
      expect(payment).toMatchObject({ amount: "250.00", createdBy: owner });
      await expect(
        core.addPayment(bob, finance.id, { amount: "1", paidOn: "2026-10-01" }),
      ).rejects.toMatchObject({ code: "forbidden" });
      await expect(
        core.addPayment(alice, finance.id, {
          amount: "0",
          paidOn: "2026-10-01",
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(
        (await core.listPayments(bob, finance.id)).map((x) => x.id),
      ).toEqual([payment.id]);
      await expect(core.listPayments(agent, finance.id)).rejects.toMatchObject({
        code: "forbidden",
      });
      expect(
        (await core.listPayments(alice, finance.id)).map((x) => x.id),
      ).toEqual([payment.id]);
      expect((await core.getTimeline(alice, finance.id)).risk.finance).toEqual({
        contractAmount: "1000.00",
        collectedAmount: "250.00",
        currency: "HKD",
        collectedPercent: 25,
      });
      expect((await core.getTimeline(bob, finance.id)).risk.finance).toEqual({
        contractAmount: "1000.00",
        collectedAmount: "250.00",
        currency: "HKD",
        collectedPercent: 25,
      });
      expect(
        (await core.getTimeline(agent, finance.id)).risk.finance,
      ).toBeNull();
      const asBob = (await core.listProjects(bob, w)).find(
        (x) => x.id === finance.id,
      );
      expect(asBob).toMatchObject({
        contractAmount: "1000.00",
        currency: "HKD",
      });
      const asAgent = (await core.listProjects(agent, w)).find(
        (x) => x.id === finance.id,
      );
      expect(asAgent).toMatchObject({ contractAmount: null, currency: null });

      // A guest of the workspace reads the plan but never the figures.
      const g = await core.auth.api.signUpEmail({
        body: {
          name: "Gina Guest",
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id',${aliceId},true)`,
        );
        await tx.insert(members).values({
          workspaceId: w,
          userId: g.user.id,
          name: "Gina Guest",
          kind: "person",
          role: "guest",
        });
      });
      const guest = userPrincipal(g.user.id);
      expect(
        (await core.getTimeline(guest, finance.id)).risk.finance,
      ).toBeNull();
      await expect(core.listPayments(guest, finance.id)).rejects.toMatchObject({
        code: "forbidden",
      });
    });

    it("guards reads: outsiders are refused and unknown projects are not found", async () => {
      await expect(core.getTimeline(outsider, projectId)).rejects.toMatchObject(
        { code: "forbidden" },
      );
      await expect(core.getTimeline(alice, randomUUID())).rejects.toMatchObject(
        { code: "not_found" },
      );
      await expect(
        core.listMilestones(outsider, projectId),
      ).rejects.toMatchObject({ code: "forbidden" });
      const timeline = await core.getTimeline(alice, projectId);
      expect(timelineSchema.parse(timeline)).toBeTruthy();
      expect(timeline).toMatchObject({
        timeZone: "Asia/Hong_Kong",
        canEditPlan: true,
      });
    });

    it("writes an activity row with the actor for every mutation", async () => {
      const rows = await connection.db
        .select({
          action: activity.action,
          resourceId: activity.resourceId,
          actorId: activity.actorId,
        })
        .from(activity)
        .where(
          and(
            eq(activity.workspaceId, w),
            inArray(activity.resourceId, mutated),
          ),
        );
      const actions = new Set(rows.map((row) => row.action));
      for (const action of [
        "task_plans.insert",
        "task_plans.update",
        "milestones.insert",
        "milestones.update",
        "task_dependencies.insert",
        "task_dependencies.delete",
        "project_payments.insert",
      ])
        expect(actions).toContain(action);
      expect(rows.every((row) => row.actorId === aliceId)).toBe(true);
    });
  },
);
