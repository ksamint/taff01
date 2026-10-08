import { randomUUID } from "node:crypto";
import {
  activity,
  connectDatabase,
  grants,
  inboxItems,
  members,
  reviewComments,
  runArtifacts,
  runEvents,
  runs,
} from "@taff/db";
import type {
  AppendRunEvent,
  AttachRunArtifact,
  ReviewRun,
  Run,
} from "@taff/schemas";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, type Principal, userPrincipal } from "./index";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  console.warn("SKIP M3 PostgreSQL tests: TEST_DATABASE_URL required");
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error("M3 tests require isolated _test database");
const checks = {
  matchesDescription: true,
  verifiable: true,
  withinPermissions: true,
};
describe.skipIf(!databaseUrl)("M3 PostgreSQL", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let person: Principal;
  let outsider: Principal;
  let agent: Principal;
  let workspaceId: string;
  let ownerId: string;
  let agentId: string;
  let supervisorId: string;
  let supervisor: Principal;
  let member: Principal;
  const events: { resourceId: string; action: string }[] = [];
  beforeAll(async () => {
    await migrateDatabase(databaseUrl!);
    connection = connectDatabase(databaseUrl!);
    const [version] = await connection.client`show server_version_num`;
    expect(Number(version.server_version_num)).toBeGreaterThanOrEqual(180000);
    expect(Number(version.server_version_num)).toBeLessThan(190000);
    core = createCore({
      databaseUrl: databaseUrl!,
      authUrl: "http://localhost:3000",
      authSecret: "m3-test-secret-longer-than-thirty-two-characters",
      tokenPepper: "m3-test-pepper-at-least-sixteen",
    });
    await connection.client.listen("taff_changes", (payload) =>
      events.push(JSON.parse(payload)),
    );
    const password = `test-${randomUUID()}`;
    const signup = await core.auth.api.signUpEmail({
      body: { name: "M3 owner", email: `${randomUUID()}@test.local`, password },
    });
    person = userPrincipal(signup.user.id);
    const me = await core.getMe(signup.user.id);
    workspaceId = me.workspaces[0].id;
    ownerId = me.workspaces[0].memberId;
    const other = await core.auth.api.signUpEmail({
      body: {
        name: "M3 outsider",
        email: `${randomUUID()}@test.local`,
        password,
      },
    });
    outsider = userPrincipal(other.user.id);
    const reviewer = await core.auth.api.signUpEmail({
      body: {
        name: "M3 supervisor",
        email: `${randomUUID()}@test.local`,
        password,
      },
    });
    supervisor = userPrincipal(reviewer.user.id);
    const bystander = await core.auth.api.signUpEmail({
      body: {
        name: "M3 member",
        email: `${randomUUID()}@test.local`,
        password,
      },
    });
    member = userPrincipal(bystander.user.id);
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', ${signup.user.id}, true)`,
      );
      const [worker] = await tx
        .insert(members)
        .values({ workspaceId, name: "Real test agent", kind: "agent" })
        .returning();
      agentId = worker.id;
      const [human] = await tx
        .insert(members)
        .values({
          workspaceId,
          userId: reviewer.user.id,
          name: "Supervisor",
          kind: "person",
        })
        .returning();
      supervisorId = human.id;
      await tx.insert(members).values({
        workspaceId,
        userId: bystander.user.id,
        name: "Member",
        kind: "person",
      });
    });
    const issued = await core.createAgentToken(person, {
      workspaceId,
      memberId: agentId,
      name: "M3 client",
      scopes: ["tasks:read", "tasks:write", "inbox:review", "files:write"],
    });
    const authenticated = await core.authenticateAgentToken(issued.token);
    if (!authenticated) throw new Error("test token did not authenticate");
    agent = authenticated;
  }, 30000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });
  async function start(): Promise<Run> {
    const task = await core.createTask(person, {
      workspaceId,
      ownerId,
      workerId: agentId,
      title: `Real run ${randomUUID()}`,
      dueAt: null,
    });
    return core.startRun(person, task.id, {});
  }
  async function attach(run: Run) {
    const input = {
      version: run.version,
      name: "output.md",
      mimeType: "text/markdown",
      content: "# Actual submitted deliverable\nMeasured report",
      diff: "- old\n+ new",
      sourceUrl: "https://example.org/source",
    } satisfies AttachRunArtifact;
    const artifact = await core.attachRunArtifact(agent, run.id, input);
    return { artifact, run: (await core.getRun(person, run.id)).run };
  }
  async function pending() {
    const first = await start();
    const { artifact, run } = await attach(first);
    return {
      artifact,
      run: await core.submitRun(agent, run.id, {
        version: run.version,
        summary: "External agent completed report",
        requestReview: false,
      }),
    };
  }
  function approval(run: Run, artifactId: string): ReviewRun {
    return {
      version: run.version,
      decision: "approve",
      checks,
      comment: "Reviewed source and test evidence",
      items: [{ artifactId, decision: "approve", comment: "" }],
    };
  }
  it("records actual steps, tool/source/test evidence, artifacts and metrics; defaults to review", async () => {
    let run = await start();
    await core.appendRunEvent(agent, run.id, {
      version: run.version,
      kind: "step",
      title: "Report generated",
      text: "External process event",
      sourceUrl: null,
      testStatus: null,
      durationMs: 1200,
      costMicros: 15000,
    } satisfies AppendRunEvent);
    run = (await core.getRun(person, run.id)).run;
    await core.appendRunEvent(agent, run.id, {
      version: run.version,
      kind: "tool_call",
      title: "Read tasks",
      text: "",
      sourceUrl: null,
      testStatus: null,
      durationMs: 100,
      costMicros: 1000,
      capability: "tasks.read",
    });
    run = (await core.getRun(person, run.id)).run;
    await core.appendRunEvent(agent, run.id, {
      version: run.version,
      kind: "source",
      title: "Reference",
      text: "",
      sourceUrl: "https://example.org/reference",
      testStatus: null,
      durationMs: 0,
      costMicros: 0,
    });
    run = (await core.getRun(person, run.id)).run;
    await core.appendRunEvent(agent, run.id, {
      version: run.version,
      kind: "test",
      title: "Check passed",
      text: "External test stdout",
      sourceUrl: null,
      testStatus: "passed",
      durationMs: 300,
      costMicros: 0,
    });
    run = (await core.getRun(person, run.id)).run;
    const attached = await attach(run);
    run = attached.run;
    const submitted = await core.submitRun(agent, run.id, {
      version: run.version,
      summary: "Actual result",
      requestReview: false,
    });
    expect(submitted).toMatchObject({
      status: "needs_review",
      durationMs: 1600,
      costMicros: 16000,
    });
    expect((await core.getTask(person, run.taskId)).status).toBe(
      "needs_review",
    );
    const review = await core.getReview(person, run.taskId);
    expect(review.events.map((item) => item.kind)).toEqual([
      "step",
      "tool_call",
      "source",
      "test",
    ]);
    expect(review.artifacts[0]).toMatchObject({
      content: "# Actual submitted deliverable\nMeasured report",
      diff: "- old\n+ new",
    });
    expect(review.checks).toEqual({
      matchesDescription: false,
      verifiable: false,
      withinPermissions: false,
    });
    expect(review.canReview).toBe(true);
    expect((await core.getReview(member, run.taskId)).canReview).toBe(false);
    const audited = await connection.db
      .select()
      .from(activity)
      .where(eq(activity.resourceId, attached.artifact.id));
    expect(audited[0]).toMatchObject({
      actorId: `agent:${agentId}`,
      workspaceId,
      action: "run_artifacts.insert",
    });
    await vi.waitFor(() =>
      expect(
        events.some(
          (event) =>
            event.resourceId === attached.artifact.id &&
            event.action === "run_artifacts.insert",
        ),
      ).toBe(true),
    );
  });
  it("serializes duplicate start, stale versions, pause/resume/cancel and denies terminal output", async () => {
    const run = await start();
    await expect(core.startRun(person, run.taskId, {})).rejects.toMatchObject({
      code: "conflict",
    });
    const attempts = await Promise.allSettled([
      core.controlRun(person, run.id, {
        version: run.version,
        action: "pause",
      }),
      core.controlRun(person, run.id, {
        version: run.version,
        action: "cancel",
      }),
    ]);
    expect(
      attempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    let updated = (await core.getRun(person, run.id)).run;
    if (updated.status === "canceled") return;
    await expect(
      core.attachRunArtifact(agent, run.id, {
        version: updated.version,
        name: "paused.txt",
        mimeType: "text/plain",
        content: "paused output",
        diff: null,
        sourceUrl: null,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    updated = await core.controlRun(person, run.id, {
      version: updated.version,
      action: "resume",
    });
    updated = await core.controlRun(person, run.id, {
      version: updated.version,
      action: "cancel",
    });
    expect(updated.status).toBe("canceled");
    expect((await core.getTask(person, run.taskId)).status).toBe("todo");
    await expect(
      core.controlRun(person, run.id, {
        version: updated.version,
        action: "resume",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
  it("does not permit blind or stale approvals, agent review, bypass status changes or foreign output", async () => {
    let { run, artifact } = await pending();
    await expect(
      core.reviewRun(agent, run.id, approval(run, artifact.id)),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.reviewRun(member, run.id, approval(run, artifact.id)),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(core.getRun(outsider, run.id)).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      core.updateTaskStatus(person, run.taskId, { status: "done" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      core.assignTask(person, run.taskId, { workerId: null }),
    ).rejects.toMatchObject({ code: "conflict" });
    await expect(
      core.reviewRun(person, run.id, {
        ...approval(run, artifact.id),
        checks: { ...checks, verifiable: false },
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.reviewRun(person, run.id, {
        ...approval(run, artifact.id),
        items: [],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.reviewRun(person, run.id, {
        ...approval(run, artifact.id),
        items: [{ artifactId: randomUUID(), decision: "approve", comment: "" }],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await core.addReviewComment(person, run.id, {
      version: run.version,
      body: "Line-specific feedback",
      artifactId: artifact.id,
      line: 2,
    });
    await expect(
      core.reviewRun(person, run.id, approval(run, artifact.id)),
    ).rejects.toMatchObject({ code: "conflict" });
    run = (await core.getRun(person, run.id)).run;
    expect((await core.getReview(person, run.taskId)).comments).toMatchObject([
      { body: "Line-specific feedback", line: 2, artifactId: artifact.id },
    ]);
    const results = await Promise.allSettled([
      core.reviewRun(person, run.id, approval(run, artifact.id)),
      core.reviewRun(person, run.id, approval(run, artifact.id)),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect((await core.getTask(person, run.taskId)).status).toBe("done");
    expect(
      (await core.listInbox(person, workspaceId)).items.some(
        (item) => item.runId === run.id,
      ),
    ).toBe(false);
  });
  it("requests changes with item comments, resumes and resets review checklist", async () => {
    let { run, artifact } = await pending();
    await expect(
      core.reviewRun(person, run.id, {
        version: run.version,
        decision: "request_changes",
        checks,
        comment: "",
        items: [],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    run = await core.reviewRun(person, run.id, {
      version: run.version,
      decision: "request_changes",
      checks,
      comment: "",
      items: [
        {
          artifactId: artifact.id,
          decision: "request_changes",
          comment: "Fix the source link",
        },
      ],
    });
    expect(run.status).toBe("changes_requested");
    expect((await core.getReview(person, run.taskId)).comments[0].body).toBe(
      "Fix the source link",
    );
    run = await core.controlRun(agent, run.id, {
      version: run.version,
      action: "resume",
    });
    const revised = await attach(run);
    run = revised.run;
    run = await core.submitRun(agent, run.id, {
      version: run.version,
      summary: "Revised report",
      requestReview: true,
    });
    expect((await core.getReview(person, run.taskId)).checks).toEqual({
      matchesDescription: false,
      verifiable: false,
      withinPermissions: false,
    });
    await expect(
      core.reviewRun(person, run.id, approval(run, artifact.id)),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("persists unread/snooze/grouping/badges and enforces recipient privacy", async () => {
    const { run } = await pending();
    let inbox = await core.listInbox(person, workspaceId, { tab: "reviews" });
    const item = inbox.items.find((item) => item.runId === run.id);
    expect(item).toBeDefined();
    if (!item) throw new Error("Missing review inbox");
    expect(inbox.groups.some((group) => group.taskId === run.taskId)).toBe(
      true,
    );
    const before = inbox.unreadCount;
    await expect(
      core.updateInboxItem(member, item.id, { read: true }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(core.listInbox(agent, workspaceId)).rejects.toMatchObject({
      code: "forbidden",
    });
    await core.updateInboxItem(person, item.id, { read: true });
    expect((await core.listInbox(person, workspaceId)).unreadCount).toBe(
      before - 1,
    );
    await core.updateInboxItem(person, item.id, {
      read: false,
      snoozedUntil: new Date(Date.now() + 3600000).toISOString(),
    });
    expect(
      (await core.listInbox(person, workspaceId)).items.some(
        (row) => row.id === item.id,
      ),
    ).toBe(false);
    await core.updateInboxItem(person, item.id, { snoozedUntil: null });
    inbox = await core.listInbox(person, workspaceId);
    expect(inbox.unreadCount).toBe(before);
  });
  it("requires scoped expiring grants, blocks pending requests and preserves decision history", async () => {
    let run = await start();
    await core.updateAgentProfile(person, agentId, {
      supervisorId,
      reviewPolicy: "always_review",
      maxDurationMs: null,
      maxCostMicros: null,
    });
    await core.setAgentPermission(person, agentId, {
      capability: "repo.read",
      decision: "ask",
    });
    const event: AppendRunEvent = {
      version: run.version,
      kind: "tool_call",
      title: "Read repository",
      text: "External tool",
      sourceUrl: null,
      testStatus: null,
      durationMs: 10,
      costMicros: 0,
      capability: "repo.read",
    };
    await expect(
      core.appendRunEvent(agent, run.id, event),
    ).rejects.toMatchObject({ code: "forbidden" });
    const grant = await core.requestGrant(agent, agentId, {
      capability: "repo.read",
      runId: run.id,
      taskId: run.taskId,
      reason: "Need repository evidence",
    });
    run = (await core.getRun(person, run.id)).run;
    expect(run.status).toBe("paused");
    await expect(
      core.controlRun(person, run.id, {
        version: run.version,
        action: "resume",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      (
        await core.listInbox(supervisor, workspaceId, { tab: "blockers" })
      ).items.some((item) => item.grantId === grant.id),
    ).toBe(true);
    await expect(
      core.decideGrant(member, grant.id, {
        decision: "allow",
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.decideGrant(supervisor, grant.id, { decision: "allow" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.decideGrant(supervisor, grant.id, {
        decision: "allow",
        expiresAt: new Date(0).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await core.decideGrant(supervisor, grant.id, {
      decision: "allow",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    expect(
      (
        await core.listInbox(supervisor, workspaceId, { tab: "blockers" })
      ).items.some((item) => item.grantId === grant.id),
    ).toBe(false);
    run = await core.controlRun(agent, run.id, {
      version: run.version,
      action: "resume",
    });
    await core.appendRunEvent(agent, run.id, {
      ...event,
      version: run.version,
    });
    run = (await core.getRun(person, run.id)).run;
    const other = await start();
    await expect(
      core.appendRunEvent(agent, other.id, {
        ...event,
        version: other.version,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await core.decideGrant(supervisor, grant.id, { decision: "revoke" });
    await expect(
      core.appendRunEvent(agent, run.id, { ...event, version: run.version }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const profile = await core.getAgentProfile(person, agentId);
    expect(
      profile.history.some(
        (row) =>
          row.resourceId === grant.id && row.details.status === "allowed",
      ),
    ).toBe(true);
    expect(
      profile.history.some(
        (row) =>
          row.resourceId === grant.id &&
          row.details.status === "revoked" &&
          row.details.previousStatus === "allowed",
      ),
    ).toBe(true);
    await core.setAgentPermission(person, agentId, {
      capability: "repo.read",
      decision: "deny",
    });
    await expect(
      core.requestGrant(agent, agentId, {
        capability: "repo.read",
        runId: run.id,
        reason: "Cannot override deny",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const attached = await attach(other);
    const pending = await core.submitRun(agent, other.id, {
      version: attached.run.version,
      summary: "For supervisor",
      requestReview: true,
    });
    await core.reviewRun(
      supervisor,
      pending.id,
      approval(pending, attached.artifact.id),
    );
  });
  it("keeps scoped calendar grants reachable and lets matching limited tokens request Ask access", async () => {
    const run = await start();
    await core.setAgentPermission(person, agentId, {
      capability: "calendar.schedule",
      decision: "ask",
    });
    const token = await core.createAgentToken(person, {
      workspaceId,
      memberId: agentId,
      name: "Calendar-only",
      scopes: ["calendar:write"],
    });
    const calendar = await core.authenticateAgentToken(token.token);
    if (!calendar) throw new Error("Calendar token failed");
    const grant = await core.requestGrant(calendar, agentId, {
      capability: "calendar.schedule",
      taskId: run.taskId,
      runId: run.id,
      reason: "Reschedule task",
    });
    await core.decideGrant(person, grant.id, {
      decision: "allow",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });
    expect(
      (
        await core.scheduleTask(calendar, run.taskId, {
          dueAt: "2026-10-10T09:00:00Z",
        })
      ).dueAt,
    ).toBe("2026-10-10T09:00:00.000Z");
    const other = await start();
    await expect(
      core.scheduleTask(calendar, other.taskId, { dueAt: null }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', 'system:test', true)`,
      );
      await tx
        .update(grants)
        .set({ expiresAt: new Date(0) })
        .where(eq(grants.id, grant.id));
    });
    await expect(
      core.scheduleTask(calendar, run.taskId, { dueAt: null }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await core.setAgentPermission(person, agentId, {
      capability: "files.attach",
      decision: "ask",
    });
    const filesToken = await core.createAgentToken(person, {
      workspaceId,
      memberId: agentId,
      name: "Files-only",
      scopes: ["files:write"],
    });
    const files = await core.authenticateAgentToken(filesToken.token);
    if (!files) throw new Error("Files token failed");
    expect(
      (
        await core.requestGrant(files, agentId, {
          capability: "files.attach",
          taskId: other.taskId,
          reason: "Submit artifact",
        })
      ).status,
    ).toBe("pending");
    await core.setAgentPermission(person, agentId, {
      capability: "files.attach",
      decision: "allow",
    });
    await core.setAgentPermission(person, agentId, {
      capability: "calendar.schedule",
      decision: "allow",
    });
  });
  it("only admins configure review policies; default review and explicit request both win", async () => {
    await expect(
      core.updateAgentProfile(member, agentId, {
        supervisorId: null,
        reviewPolicy: "ask_only",
        maxDurationMs: null,
        maxCostMicros: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.updateAgentProfile(person, agentId, {
        supervisorId: agentId,
        reviewPolicy: "ask_only",
        maxDurationMs: null,
        maxCostMicros: null,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await core.updateAgentProfile(person, agentId, {
      supervisorId,
      reviewPolicy: "ask_only",
      maxDurationMs: null,
      maxCostMicros: null,
    });
    const one = await start();
    const attached = await attach(one);
    const done = await core.submitRun(agent, one.id, {
      version: attached.run.version,
      summary: "Routine work",
      requestReview: false,
    });
    expect(done.status).toBe("completed");
    expect((await core.getTask(person, one.taskId)).status).toBe("done");
    const two = await start();
    const output = await attach(two);
    expect(
      (
        await core.submitRun(agent, two.id, {
          version: output.run.version,
          summary: "Please inspect",
          requestReview: true,
        })
      ).status,
    ).toBe("needs_review");
    await core.updateAgentProfile(person, agentId, {
      supervisorId,
      reviewPolicy: "always_review",
      maxDurationMs: null,
      maxCostMicros: null,
    });
  });
  it("rejects missing artifacts, forged scopes, non-own agents and cross-run comments", async () => {
    const run = await start();
    await expect(
      core.submitRun(agent, run.id, {
        version: run.version,
        summary: "No result",
        requestReview: true,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const narrow = await core.createAgentToken(person, {
      workspaceId,
      memberId: agentId,
      name: "Narrow",
      scopes: ["tasks:read"],
    });
    const readOnly = await core.authenticateAgentToken(narrow.token);
    if (!readOnly || readOnly.kind !== "agent") throw new Error("Narrow token");
    await expect(
      core.attachRunArtifact(
        { ...readOnly, scopes: ["tasks:write", "files:write"] },
        run.id,
        {
          version: run.version,
          name: "forged.txt",
          mimeType: "text/plain",
          content: "forged",
          diff: null,
          sourceUrl: null,
        },
      ),
    ).rejects.toMatchObject({ code: "forbidden" });
    const { artifact } = await attach(run);
    const other = await start();
    await expect(
      core.addReviewComment(person, other.id, {
        version: other.version,
        body: "Foreign artifact",
        artifactId: artifact.id,
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.attachRunArtifact(outsider, other.id, {
        version: other.version,
        name: "foreign",
        mimeType: "text/plain",
        content: "x",
        diff: null,
        sourceUrl: null,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
  it("caps artifacts at the reviewable 100-item boundary", async () => {
    const run = await start();
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', 'system:test', true)`,
      );
      await tx.insert(runArtifacts).values(
        Array.from({ length: 100 }, (_, index) => ({
          workspaceId,
          runId: run.id,
          name: `file${index}.txt`,
          mimeType: "text/plain",
          content: "Real fixture content",
        })),
      );
    });
    await expect(
      core.attachRunArtifact(agent, run.id, {
        version: run.version,
        name: "101.txt",
        mimeType: "text/plain",
        content: "Exceeds review limit",
        diff: null,
        sourceUrl: null,
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    const submitted = await core.submitRun(agent, run.id, {
      version: run.version,
      summary: "100 artifacts",
      requestReview: true,
    });
    const detail = await core.getRun(person, run.id);
    expect(
      (
        await core.reviewRun(person, run.id, {
          version: submitted.version,
          decision: "approve",
          checks,
          comment: "",
          items: detail.artifacts.map((item) => ({
            artifactId: item.id,
            decision: "approve",
            comment: "",
          })),
        })
      ).status,
    ).toBe("completed");
  });
  it("pauses at measured limits, requires admin change to resume, audits all new tables atomically", async () => {
    await core.updateAgentProfile(person, agentId, {
      supervisorId,
      reviewPolicy: "always_review",
      maxDurationMs: 1000,
      maxCostMicros: 2000,
    });
    const run = await start();
    await core.appendRunEvent(agent, run.id, {
      version: run.version,
      kind: "step",
      title: "Measured time",
      text: "",
      sourceUrl: null,
      testStatus: null,
      durationMs: 1000,
      costMicros: 100,
    });
    const paused = (await core.getRun(person, run.id)).run;
    expect(paused.status).toBe("paused");
    await expect(
      core.controlRun(person, run.id, {
        version: paused.version,
        action: "resume",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(
      (
        await core.listInbox(supervisor, workspaceId, { tab: "blockers" })
      ).items.some((item) => item.runId === run.id),
    ).toBe(true);
    await core.updateAgentProfile(person, agentId, {
      supervisorId,
      reviewPolicy: "always_review",
      maxDurationMs: null,
      maxCostMicros: null,
    });
    expect(
      (
        await core.controlRun(person, run.id, {
          version: paused.version,
          action: "resume",
        })
      ).status,
    ).toBe("running");
    const id = randomUUID();
    await expect(
      connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id', 'system:test', true)`,
        );
        await tx.insert(runEvents).values({
          id,
          workspaceId,
          runId: run.id,
          kind: "step",
          title: "Rollback",
        });
        throw new Error("rollback M3");
      }),
    ).rejects.toThrow("rollback M3");
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.resourceId, id)),
    ).toHaveLength(0);
    expect(events.some((event) => event.resourceId === id)).toBe(false);
    const tables = await connection.db
      .select({ action: activity.action })
      .from(activity)
      .where(eq(activity.workspaceId, workspaceId));
    for (const table of [
      "agent_profiles",
      "agent_permissions",
      "grants",
      "runs",
      "run_events",
      "run_artifacts",
      "review_checks",
      "review_comments",
      "review_items",
      "inbox_items",
    ])
      expect(tables.some((row) => row.action.startsWith(`${table}.`))).toBe(
        true,
      );
  });
});
