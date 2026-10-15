import { randomUUID } from "node:crypto";
import {
  activity,
  agentProfiles,
  connectDatabase,
  members,
  taskPlans,
  tasks,
} from "@taff/db";
import {
  askAnswerSchema,
  briefSchema,
  suggestionApplyResultSchema,
  suggestionListSchema,
} from "@taff/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { createAiProvider } from "./ai-provider";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn(
    "SKIP M17 assistant PostgreSQL tests: TEST_DATABASE_URL required",
  );
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("M17 tests require isolated _test database");
const KEY = "sk-m17-test-key-never-logged";
describe.skipIf(!url)(
  "M17 suggestions, brief, Ask taff and the model path",
  () => {
    let core: Core;
    let aiCore: Core;
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "One review waits for you." } }],
          }),
          { status: 200 },
        ),
    );
    let connection: ReturnType<typeof connectDatabase>;
    let alice: Principal;
    let bob: Principal;
    let outsider: Principal;
    let agent: Principal;
    let otherAgent: Principal;
    let w: string;
    let outsiderW: string;
    let owner: string;
    let bobMember: string;
    let agentId: string;
    let projectId: string;
    const options = {
      databaseUrl: "",
      authUrl: "http://localhost:3000",
      authSecret: "m17-test-secret-longer-than-thirty-two-characters",
      tokenPepper: "m17-test-pepper-at-least-sixteen",
    };
    beforeAll(async () => {
      await migrateDatabase(url!);
      connection = connectDatabase(url!);
      core = createCore({ ...options, databaseUrl: url! });
      aiCore = createCore({
        ...options,
        databaseUrl: url!,
        ai: createAiProvider(
          {
            baseUrl: "https://models.example.test/v1",
            apiKey: KEY,
            model: "m",
          },
          fetch,
        ),
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
      await core.updateProfile(a.user.id, {
        locale: "en",
        tz: "Asia/Hong_Kong",
      });
      const me = await core.getMe(a.user.id);
      w = me.workspaces[0].id;
      owner = me.workspaces[0].memberId;
      const b = await signup("Bob Lee");
      bob = userPrincipal(b.user.id);
      const o = await signup("Outsider");
      outsider = userPrincipal(o.user.id);
      outsiderW = (await core.getMe(o.user.id)).workspaces[0].id;
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id',${a.user.id},true)`,
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
          .values({ workspaceId: w, name: "Split Agent", kind: "agent" })
          .returning();
        agentId = am.id;
        await tx
          .insert(agentProfiles)
          .values({ id: am.id, workspaceId: w, supervisorId: owner });
      });
      const token = await core.createAgentToken(alice, {
        workspaceId: w,
        memberId: agentId,
        name: "M17 full",
        scopes: ["tasks:read", "tasks:write", "calendar:write"],
      });
      agent = (await core.authenticateAgentToken(token.token))!;
      const readOnly = await core.createAgentToken(alice, {
        workspaceId: w,
        memberId: agentId,
        name: "M17 read",
        scopes: ["tasks:read"],
      });
      otherAgent = (await core.authenticateAgentToken(readOnly.token))!;
      const project = await core.createProject(alice, w, {
        name: "Checkout v2",
      });
      projectId = project.id;
      await core.updateProject(alice, projectId, {
        version: project.version,
        contractAmount: "1000.00",
        currency: "HKD",
      });
      await core.addPayment(alice, projectId, {
        amount: "400.00",
        paidOn: "2026-10-01",
      });
    }, 30000);
    afterAll(async () => {
      if (core) await core.close();
      if (aiCore) await aiCore.close();
      if (connection) await connection.close();
    });
    const create = (title: string, fields: object = {}) =>
      core.createTask(alice, {
        workspaceId: w,
        ownerId: owner,
        workerId: agentId,
        projectId,
        title,
        ...fields,
      });
    const split = (taskId: string) => ({
      taskId,
      kind: "split" as const,
      payload: {
        subtasks: [
          { title: "Write migration" },
          { title: "Review rollout", ownerId: bobMember },
        ],
        reason: "Two owners",
      },
    });

    describe("suggestions", () => {
      it("lets only the task's agent worker propose", async () => {
        const task = await create("Card migration");
        await expect(
          core.createSuggestion(alice, split(task.id)),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          core.createSuggestion(otherAgent, split(task.id)),
        ).rejects.toMatchObject({ code: "forbidden" });
        const unassigned = await create("Not mine", { workerId: null });
        await expect(
          core.createSuggestion(agent, split(unassigned.id)),
        ).rejects.toMatchObject({ code: "forbidden" });
        const foreign = await core.createTask(outsider, {
          workspaceId: outsiderW,
          ownerId: (await core.listMembers(outsider, outsiderW))[0].id,
          workerId: null,
          title: "Elsewhere",
        });
        await expect(
          core.createSuggestion(agent, split(foreign.id)),
        ).rejects.toMatchObject({ code: "not_found" });
        await expect(
          core.createSuggestion(agent, {
            ...split(task.id),
            payload: { subtasks: [{ title: "x", ownerId: agentId }] },
          }),
        ).rejects.toMatchObject({ code: "invalid_input" });
        await expect(
          core.createSuggestion(agent, {
            taskId: task.id,
            kind: "reschedule",
            payload: { subtasks: [{ title: "x" }] } as never,
          }),
        ).rejects.toMatchObject({ code: "invalid_input" });
        const made = await core.createSuggestion(agent, split(task.id));
        expect(made).toMatchObject({
          kind: "split",
          status: "pending",
          createdBy: agentId,
          taskId: task.id,
          version: 1,
          decidedBy: null,
        });
        const listed = suggestionListSchema.parse(
          await core.listSuggestions(bob, w, { taskId: task.id }),
        );
        expect(listed.map((row) => row.id)).toEqual([made.id]);
        await expect(core.listSuggestions(outsider, w)).rejects.toMatchObject({
          code: "forbidden",
        });
      });
      it("applies a split through the normal create path in one transaction", async () => {
        const task = await create("Payments split");
        const made = await core.createSuggestion(agent, split(task.id));
        await expect(
          core.applySuggestion(bob, made.id, { version: 1 }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          core.applySuggestion(agent, made.id, { version: 1 }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          core.applySuggestion(alice, made.id, { version: 2 }),
        ).rejects.toMatchObject({ code: "conflict" });
        const result = suggestionApplyResultSchema.parse(
          await core.applySuggestion(alice, made.id, { version: 1 }),
        );
        expect(result.suggestion).toMatchObject({
          status: "applied",
          version: 2,
          decidedBy: owner,
        });
        expect(result.plan).toBeNull();
        expect(
          result.tasks.map((row) => [row.title, row.parentId, row.ownerId]),
        ).toEqual([
          ["Write migration", task.id, owner],
          ["Review rollout", task.id, bobMember],
        ]);
        expect(result.tasks.every((row) => row.projectId === projectId)).toBe(
          true,
        );
        // Every write is audited in the same transaction.
        const audited = await connection.db
          .select({ action: activity.action })
          .from(activity)
          .where(
            and(
              eq(activity.workspaceId, w),
              inArray(activity.resourceId, [
                made.id,
                ...result.tasks.map((row) => row.id),
              ]),
            ),
          );
        expect(audited.map((row) => row.action).sort()).toEqual([
          "suggestions.insert",
          "suggestions.update",
          "tasks.insert",
          "tasks.insert",
        ]);
        await expect(
          core.applySuggestion(alice, made.id, { version: 2 }),
        ).rejects.toMatchObject({ code: "conflict" });
      });
      it("rolls the whole apply back when the normal path refuses", async () => {
        const task = await create("Running split");
        const made = await core.createSuggestion(agent, split(task.id));
        await core.startRun(agent, task.id, {});
        // A parent with an active run takes no new subtask (409), as always.
        await expect(
          core.applySuggestion(alice, made.id, { version: 1 }),
        ).rejects.toMatchObject({ code: "conflict" });
        const [row] = await core.listSuggestions(alice, w, { taskId: task.id });
        expect(row).toMatchObject({ status: "pending", version: 1 });
        expect(
          (await core.listTasks(alice, w, { parentId: task.id })).length,
        ).toBe(0);
      });
      it("applies a reschedule through the plan path and dismisses others", async () => {
        const task = await create("Rollout", {
          dueAt: "2026-10-10T02:30:00.000Z",
        });
        const move = await core.createSuggestion(agent, {
          taskId: task.id,
          kind: "reschedule",
          payload: { startDate: "2026-10-20", durationDays: 3 },
        });
        const result = await core.applySuggestion(alice, move.id, {
          version: move.version,
        });
        expect(result.plan?.plans[0]).toMatchObject({
          taskId: task.id,
          startDate: "2026-10-20",
          durationDays: 3,
        });
        // 10:30 Hong Kong time kept on the plan's last day.
        expect(result.plan?.tasks[0].dueAt).toBe("2026-10-22T02:30:00.000Z");
        const again = await core.createSuggestion(agent, {
          taskId: task.id,
          kind: "reschedule",
          payload: { startDate: "2026-10-27", durationDays: 1 },
        });
        await expect(
          core.dismissSuggestion(bob, again.id, { version: 1 }),
        ).rejects.toMatchObject({ code: "forbidden" });
        const dismissed = await core.dismissSuggestion(alice, again.id, {
          version: 1,
        });
        expect(dismissed).toMatchObject({ status: "dismissed", version: 2 });
        const timeline = await core.getTimeline(alice, projectId);
        expect(timeline.items.find((x) => x.id === task.id)?.start).toBe(
          "2026-10-20",
        );
      });
    });

    describe("versioned suggestion undo", () => {
      it("archives an untouched split atomically, retains history and rejects stale/repeated/agent undo", async () => {
        const task = await create("Undo split");
        const made = await core.createSuggestion(agent, split(task.id));
        const applied = await core.applySuggestion(alice, made.id, {
          version: 1,
        });
        await expect(
          core.undoSuggestion(agent, made.id, { version: 2 }),
        ).rejects.toMatchObject({ code: "forbidden" });
        // Alice is an admin; Bob owns one child but cannot undo its parent's proposal.
        await expect(
          core.undoSuggestion(bob, made.id, { version: 2 }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          core.undoSuggestion(outsider, made.id, { version: 2 }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          core.undoSuggestion(alice, made.id, { version: 1 }),
        ).rejects.toMatchObject({ code: "conflict" });
        const undone = await core.undoSuggestion(alice, made.id, {
          version: applied.suggestion.version,
        });
        expect(undone).toMatchObject({
          status: "applied",
          version: 3,
          decidedBy: owner,
        });
        expect(undone.undoneAt).toBeTruthy();
        expect(await core.listTasks(alice, w, { parentId: task.id })).toEqual(
          [],
        );
        const archived = await connection.db
          .select()
          .from(tasks)
          .where(
            inArray(
              tasks.id,
              applied.tasks.map((x) => x.id),
            ),
          );
        expect(archived).toHaveLength(2);
        expect(
          archived.every(
            (x) => x.archivedAt && x.status === "todo" && x.version === 2,
          ),
        ).toBe(true);
        await expect(core.getTask(alice, archived[0].id)).rejects.toMatchObject(
          { code: "not_found" },
        );
        expect(
          (await core.getTimeline(alice, projectId)).items.some((x) =>
            archived.some((a) => a.id === x.id),
          ),
        ).toBe(false);
        expect(
          (await core.relationGraph(alice, w)).nodes.some((x) =>
            archived.some((a) => a.id === x.id),
          ),
        ).toBe(false);
        await expect(
          core.undoSuggestion(alice, made.id, { version: 3 }),
        ).rejects.toMatchObject({ code: "conflict" });
        const audited = await connection.db
          .select()
          .from(activity)
          .where(
            and(
              eq(activity.resourceId, made.id),
              eq(activity.action, "suggestions.update"),
            ),
          );
        expect(audited).toHaveLength(2);
        expect(
          audited.every(
            (x) => x.actorId === (alice.kind === "user" ? alice.userId : ""),
          ),
        ).toBe(true);
      });
      it("rejects edits and downstream use without archiving any of the split", async () => {
        for (const change of ["title", "comment"] as const) {
          const task = await create(`Conflict split ${change}`);
          const made = await core.createSuggestion(agent, split(task.id));
          const applied = await core.applySuggestion(alice, made.id, {
            version: 1,
          });
          const child = applied.tasks[1];
          if (change === "title")
            await core.updateTask(alice, child.id, {
              version: child.version,
              title: "User work",
            });
          else
            await core.addTaskComment(bob, child.id, {
              body: "Keep this work",
            });
          await expect(
            core.undoSuggestion(alice, made.id, { version: 2 }),
          ).rejects.toMatchObject({ code: "conflict" });
          expect(
            await core.listTasks(alice, w, { parentId: task.id }),
          ).toHaveLength(2);
        }
      });
      it.each([false, true])(
        "restores exact prior due date and plan (existing plan: %s), then allows a new plan",
        async (withPlan) => {
          const task = await create("Undo reschedule", {
            dueAt: "2026-10-10T02:30:00.000Z",
          });
          if (withPlan)
            await core.setTaskPlan(alice, task.id, {
              startDate: "2026-10-08",
              durationDays: 3,
            });
          const before = await core.getTask(alice, task.id);
          const made = await core.createSuggestion(agent, {
            taskId: task.id,
            kind: "reschedule",
            payload: { startDate: "2026-11-01", durationDays: 4 },
          });
          await core.applySuggestion(alice, made.id, { version: 1 });
          await core.undoSuggestion(alice, made.id, { version: 2 });
          expect((await core.getTask(alice, task.id)).dueAt).toBe(before.dueAt);
          const [plan] = await connection.db
            .select()
            .from(taskPlans)
            .where(eq(taskPlans.taskId, task.id));
          expect(!!plan.archivedAt).toBe(!withPlan);
          if (withPlan)
            expect(plan).toMatchObject({
              startDate: "2026-10-08",
              durationDays: 3,
            });
          const next = await core.setTaskPlan(alice, task.id, {
            startDate: "2026-12-01",
            durationDays: 2,
            ...(withPlan ? { version: plan.version } : {}),
          });
          expect(next.plans[0].version).toBe(plan.version + 1);
        },
      );
      it("refuses reschedule undo after a concurrent plan change and preserves it", async () => {
        const task = await create("Newer plan");
        const made = await core.createSuggestion(agent, {
          taskId: task.id,
          kind: "reschedule",
          payload: { startDate: "2026-11-01", durationDays: 4 },
        });
        const applied = await core.applySuggestion(alice, made.id, {
          version: 1,
        });
        await core.setTaskPlan(alice, task.id, {
          version: applied.plan!.plans[0].version,
          startDate: "2026-12-10",
          durationDays: 2,
        });
        const before = await core.getTask(alice, task.id);
        await expect(
          core.undoSuggestion(alice, made.id, { version: 2 }),
        ).rejects.toMatchObject({ code: "conflict" });
        expect((await core.getTask(alice, task.id)).dueAt).toBe(before.dueAt);
      });
    });

    describe("brief", () => {
      it("equals the timeline's risk and keeps finance for admins only", async () => {
        const brief = briefSchema.parse(
          await core.getBrief(alice, { scope: "workspace", workspaceId: w }),
        );
        const timeline = await core.getTimeline(alice, projectId);
        const project = brief.projects.find((p) => p.projectId === projectId);
        expect(project?.risk).toEqual(timeline.risk);
        expect(project?.risk.finance).toMatchObject({ collectedPercent: 40 });
        expect(brief.timeZone).toBe("Asia/Hong_Kong");
        const asBob = await core.getBrief(bob, { workspaceId: w });
        expect(asBob.scope).toBe("workspace");
        expect(
          asBob.projects.find((p) => p.projectId === projectId)?.risk.finance,
        ).toBeNull();
        const asAgent = await core.getBrief(agent, {});
        expect(asAgent.workspaceIds).toEqual([w]);
        expect(asAgent.projects.every((p) => p.risk.finance === null)).toBe(
          true,
        );
        expect(asAgent.actions).toEqual([]);
      });
      it("lists pending proposals and grants for the person who decides", async () => {
        const task = await create("Needs a grant");
        const made = await core.createSuggestion(agent, split(task.id));
        const grant = await core.requestGrant(agent, agentId, {
          capability: "staging.write",
          taskId: task.id,
          reason: "Deploy to staging",
        });
        const brief = await core.getBrief(alice, { workspaceId: w });
        expect(brief.actions).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: "suggestion",
              suggestionId: made.id,
            }),
            expect.objectContaining({ kind: "grant", grantId: grant.id }),
          ]),
        );
        expect(brief.counts.blockedAgents).toBe(1);
        expect(brief.counts.agentsWorking).toBe(1);
        const forBob = await core.getBrief(bob, { workspaceId: w });
        expect(forBob.actions).toEqual([]);
        expect(forBob.counts.blockedAgents).toBe(1);
        const answer = askAnswerSchema.parse(
          await core.ask(alice, { question: "What needs me?", workspaceId: w }),
        );
        expect(answer).toMatchObject({ intent: "needs_me", source: "rules" });
        expect(answer.items.map((item) => item.id)).toEqual(
          expect.arrayContaining([made.id, grant.id]),
        );
        const blocked = await core.ask(bob, { question: "what's blocked" });
        expect(blocked.items.map((item) => item.id)).toContain(grant.id);
        expect(blocked.labels).toBeUndefined();
      });
      it("labels the mentioned ids for the web only, never for MCP", async () => {
        const task = await create("Label me");
        const grant = await core.requestGrant(agent, agentId, {
          capability: "staging.write",
          taskId: task.id,
          reason: "Deploy to staging",
        });
        expect((await core.getBrief(alice, { workspaceId: w })).labels).toBe(
          undefined,
        );
        const brief = briefSchema.parse(
          await core.getBrief(alice, { workspaceId: w }, { labels: true }),
        );
        expect(brief.labels?.workspaces.map((item) => item.id)).toEqual([w]);
        expect(brief.labels?.tasks).toContainEqual(
          expect.objectContaining({ id: task.id, title: "Label me" }),
        );
        expect(brief.labels?.agents).toContainEqual(
          expect.objectContaining({ id: agentId }),
        );
        expect(brief.labels?.projects.map((item) => item.id)).toContain(
          projectId,
        );
        const answer = askAnswerSchema.parse(
          await core.ask(
            alice,
            { question: "what's blocked", workspaceId: w },
            { labels: true },
          ),
        );
        expect(answer.items.map((item) => item.id)).toContain(grant.id);
        expect(answer.labels?.tasks.map((item) => item.id)).toContain(task.id);
        // An outsider's brief never names this workspace's records.
        const theirs = await core.getBrief(
          outsider,
          { scope: "all" },
          { labels: true },
        );
        expect(theirs.labels?.workspaces.map((item) => item.id)).not.toContain(
          w,
        );
        expect(theirs.labels?.tasks).toEqual([]);
      });
      it("spans only the caller's memberships", async () => {
        const all = await core.getBrief(alice, { scope: "all" });
        expect(all.workspaceIds).toContain(w);
        expect(all.workspaceIds).not.toContain(outsiderW);
        await expect(
          core.getBrief(outsider, { workspaceId: w }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          core.getBrief(agent, { workspaceId: outsiderW }),
        ).rejects.toMatchObject({ code: "forbidden" });
        await expect(
          core.getBrief(alice, { scope: "workspace" }),
        ).rejects.toMatchObject({ code: "invalid_input" });
      });
    });

    describe("model path (D6)", () => {
      it("sends nothing without a provider or while the workspace is opted out", async () => {
        expect(await core.getAiSettings(alice, w)).toEqual({
          enabled: false,
          available: false,
        });
        expect(await aiCore.getAiSettings(bob, w)).toEqual({
          enabled: false,
          available: true,
        });
        const answer = await aiCore.ask(alice, {
          question: "What's at risk?",
          workspaceId: w,
        });
        expect(answer).toMatchObject({ source: "rules", text: null });
        expect(fetch).not.toHaveBeenCalled();
      });
      it("lets only admins opt in, then sends the minimum context", async () => {
        await expect(
          core.setAiSettings(bob, w, { enabled: true }),
        ).rejects.toMatchObject({ code: "forbidden" });
        expect(await core.setAiSettings(alice, w, { enabled: true })).toEqual({
          enabled: true,
          available: false,
        });
        try {
          // The core without a provider still never sends.
          expect(
            await core.ask(alice, {
              question: "What needs me?",
              workspaceId: w,
            }),
          ).toMatchObject({ source: "rules" });
          // Across every membership the question never leaves.
          await aiCore.ask(alice, { question: "What needs me?" });
          // An unknown question has no structured answer to phrase.
          await aiCore.ask(alice, { question: "Write a poem", workspaceId: w });
          expect(fetch).not.toHaveBeenCalled();
          const answer = await aiCore.ask(alice, {
            question: "What needs me?",
            workspaceId: w,
          });
          expect(answer).toMatchObject({
            intent: "needs_me",
            source: "model",
            text: "One review waits for you.",
          });
          expect(fetch).toHaveBeenCalledTimes(1);
          const body = (
            fetch.mock.calls[0] as unknown as [string, RequestInit]
          )[1].body as string;
          expect(body).toContain("What needs me?");
          expect(body).not.toContain(w);
          // Ids are random UUIDs and can contain any digit run (a task id like
          // aefe0170-1000-… once matched "1000"); the contract amount must not
          // appear anywhere else in the request.
          const withoutIds = body.replace(
            /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
            "<id>",
          );
          for (const secret of [
            "Checkout v2",
            "Needs a grant",
            "Alex Chen",
            "Bob Lee",
            "Split Agent",
            "1000",
          ])
            expect(withoutIds).not.toContain(secret);
        } finally {
          await core.setAiSettings(alice, w, { enabled: false });
        }
      });
    });
  },
);
