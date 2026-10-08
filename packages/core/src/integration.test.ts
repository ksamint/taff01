import { randomUUID } from "node:crypto";
import {
  activity,
  agentTokens,
  connectDatabase,
  members,
  session,
  tasks,
  user,
  workspaces,
} from "@taff/db";
import type { ChangeEvent } from "@taff/schemas";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { type Core, createCore, userPrincipal } from "./index";
import { seedDemo } from "./seed";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl)
  console.warn(
    "SKIP core PostgreSQL integration tests: TEST_DATABASE_URL is not configured",
  );
if (databaseUrl && !new URL(databaseUrl).pathname.endsWith("_test"))
  throw new Error(
    "TEST_DATABASE_URL must point to a separate database ending in _test",
  );
const options = {
  databaseUrl: databaseUrl ?? "",
  authUrl: "http://localhost:3000",
  authSecret: "integration-test-secret-minimum-32-characters",
  tokenPepper: "integration-test-pepper-16-chars",
};
const password = `test-${randomUUID()}`;

describe.skipIf(!databaseUrl)("core PostgreSQL integration", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let userId: string;
  let workspaceId: string;
  let ownerId: string;
  let outsiderId: string;
  let outsiderMemberId: string;
  let agentId: string;
  const notifications: { resourceId: string; action: string }[] = [];
  beforeAll(async () => {
    await migrateDatabase(options.databaseUrl);
    core = createCore(options);
    connection = connectDatabase(options.databaseUrl);
    await core.subscribeChanges((event) => {
      notifications.push(event);
    });
    const signup = await core.auth.api.signUpEmail({
      body: {
        name: "Test Person",
        email: `${randomUUID()}@test.local`,
        password,
      },
    });
    userId = signup.user.id;
    const me = await core.getMe(userId);
    workspaceId = me.workspaces[0].id;
    ownerId = me.workspaces[0].memberId;
    const outsider = await core.auth.api.signUpEmail({
      body: { name: "Outsider", email: `${randomUUID()}@test.local`, password },
    });
    outsiderId = outsider.user.id;
    outsiderMemberId = (await core.getMe(outsiderId)).workspaces[0].memberId;
    const [agent] = await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', ${userId}, true)`,
      );
      return tx
        .insert(members)
        .values({ workspaceId, name: "Test Agent", kind: "agent" })
        .returning();
    });
    agentId = agent.id;
  }, 30000);
  afterAll(async () => {
    if (core) await core.close();
    if (connection) await connection.close();
  });

  it("signup provisions an audited personal workspace and auth defaults", async () => {
    const me = await core.getMe(userId);
    expect(me.user).toMatchObject({ locale: "en", tz: "UTC" });
    expect(me.workspaces).toHaveLength(1);
    expect(
      await core.listMembers(userPrincipal(userId), workspaceId),
    ).toMatchObject([
      { id: ownerId, kind: "person", role: "admin" },
      { id: agentId, kind: "agent" },
    ]);
    const rows = await connection.db
      .select()
      .from(activity)
      .where(eq(activity.actorId, userId));
    expect(rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "users.insert",
        "accounts.insert",
        "sessions.insert",
        "workspaces.insert",
        "members.insert",
      ]),
    );
    expect(rows.every((row) => JSON.stringify(row.details) === "{}")).toBe(
      true,
    );
  });
  it("creates and assigns a task with activity and notifications", async () => {
    const created = await core.createTask(userPrincipal(userId), {
      workspaceId,
      ownerId,
      workerId: null,
      dueAt: null,
      title: "Integration task",
    });
    const assigned = await core.assignTask(userPrincipal(userId), created.id, {
      workerId: agentId,
    });
    expect(assigned).toMatchObject({
      ownerId,
      workerId: agentId,
      status: "todo",
    });
    expect(
      await core.listTasks(userPrincipal(userId), workspaceId),
    ).toContainEqual(assigned);
    const rows = await connection.db
      .select()
      .from(activity)
      .where(eq(activity.resourceId, created.id));
    expect(rows.map((row) => [row.actorId, row.action])).toEqual([
      [userId, "tasks.insert"],
      [userId, "tasks.update"],
    ]);
    await vi.waitFor(() =>
      expect(
        notifications
          .filter((event) => event.resourceId === created.id)
          .map((event) => event.action),
      ).toEqual(["tasks.insert", "tasks.update"]),
    );
  });
  it("rejects outsiders and invalid owners/assignments without audit changes", async () => {
    const before = await connection.db
      .select()
      .from(activity)
      .where(eq(activity.workspaceId, workspaceId));
    await expect(
      core.listTasks(userPrincipal(outsiderId), workspaceId),
    ).rejects.toMatchObject({ code: "forbidden", status: 403 });
    await expect(
      core.createTask(userPrincipal(outsiderId), {
        workspaceId,
        ownerId,
        workerId: null,
        dueAt: null,
        title: "Forbidden",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.createTask(userPrincipal(userId), {
        workspaceId,
        ownerId: agentId,
        workerId: null,
        dueAt: null,
        title: "Agent owner",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.createTask(userPrincipal(userId), {
        workspaceId,
        ownerId,
        workerId: outsiderMemberId,
        dueAt: null,
        title: "Cross workspace",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.workspaceId, workspaceId)),
    ).toHaveLength(before.length);
  });
  it("database constraints reject agent owners and cross-workspace workers", async () => {
    await expect(
      connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id', ${userId}, true)`,
        );
        await tx
          .insert(tasks)
          .values({ workspaceId, ownerId: agentId, title: "Invalid DB owner" });
      }),
    ).rejects.toThrow();
    await expect(
      connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id', ${userId}, true)`,
        );
        await tx.insert(tasks).values({
          workspaceId,
          ownerId,
          workerId: outsiderMemberId,
          title: "Invalid DB worker",
        });
      }),
    ).rejects.toThrow();
  });
  it("rolls back task, audit, and notification on transaction failure", async () => {
    const id = randomUUID();
    await expect(
      connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id', ${userId}, true)`,
        );
        await tx
          .insert(tasks)
          .values({ id, workspaceId, ownerId, title: "Rollback" });
        throw new Error("intentional rollback");
      }),
    ).rejects.toThrow("intentional rollback");
    expect(
      await connection.db.select().from(tasks).where(eq(tasks.id, id)),
    ).toHaveLength(0);
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.resourceId, id)),
    ).toHaveLength(0);
    expect(notifications.some((event) => event.resourceId === id)).toBe(false);
  });
  it("rolls back signup provisioning and audit with a failed user transaction", async () => {
    const id = randomUUID();
    await expect(
      connection.db.transaction(async (tx) => {
        await tx
          .insert(user)
          .values({ id, name: "Rollback user", email: `${id}@test.local` });
        throw new Error("rollback provisioning");
      }),
    ).rejects.toThrow("rollback provisioning");
    expect(
      await connection.db.select().from(user).where(eq(user.id, id)),
    ).toHaveLength(0);
    expect(
      await connection.db.select().from(members).where(eq(members.userId, id)),
    ).toHaveLength(0);
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.actorId, id)),
    ).toHaveLength(0);
    expect(notifications.some((event) => event.resourceId === id)).toBe(false);
  });
  it("updates locale/time zone and audits sign-in and sign-out", async () => {
    const updated = await core.updateProfile(userId, {
      locale: "zh-CN",
      tz: "Asia/Shanghai",
    });
    expect(updated).toMatchObject({ locale: "zh-CN", tz: "Asia/Shanghai" });
    await expect(
      core.updateProfile(userId, { locale: "en", tz: "Invalid/Zone" }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const before = await connection.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.actorId, userId),
          eq(activity.action, "sessions.delete"),
        ),
      );
    const response = await core.auth.api.signInEmail({
      body: { email: updated.email, password },
      asResponse: true,
    });
    expect(response.status).toBe(200);
    const cookies = response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    expect(
      (
        await core.auth.api.getSession({
          headers: new Headers({ cookie: cookies }),
        })
      )?.user.id,
    ).toBe(userId);
    await core.auth.api.signOut({ headers: new Headers({ cookie: cookies }) });
    expect(
      await core.auth.api.getSession({
        headers: new Headers({ cookie: cookies }),
      }),
    ).toBeNull();
    const after = await connection.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.actorId, userId),
          eq(activity.action, "sessions.delete"),
        ),
      );
    expect(after).toHaveLength(before.length + 1);
  });
  it("renews an aged session with a cookie, committed expiry, audit and notification", async () => {
    const me = await core.getMe(userId);
    const signedIn = await core.auth.api.signInEmail({
      body: { email: me.user.email, password },
      asResponse: true,
    });
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const headers = new Headers({ cookie });
    const authenticated = await core.auth.api.getSession({ headers });
    expect(authenticated?.user.id).toBe(userId);
    if (!authenticated) throw new Error("Expected an authenticated session");
    const sessionId = authenticated.session.id;
    const { sessionConfig } = await core.auth.$context;
    const agedUpdatedAt = new Date(
      Date.now() - (sessionConfig.updateAge + 60) * 1000,
    );
    const agedExpiresAt = new Date(
      agedUpdatedAt.getTime() + sessionConfig.expiresIn * 1000,
    );
    expect(agedExpiresAt.getTime()).toBeGreaterThan(Date.now());
    await connection.db
      .update(session)
      .set({ updatedAt: agedUpdatedAt, expiresAt: agedExpiresAt })
      .where(eq(session.id, sessionId));
    await vi.waitFor(() =>
      expect(
        notifications.filter(
          (event) =>
            event.resourceId === sessionId &&
            event.action === "sessions.update",
        ),
      ).toHaveLength(1),
    );
    const before = await connection.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.resourceId, sessionId),
          eq(activity.action, "sessions.update"),
        ),
      );
    const renewed = await core.auth.api.getSession({
      headers,
      returnHeaders: true,
    });
    expect(renewed.response?.user.id).toBe(userId);
    expect(
      renewed.headers
        .getSetCookie()
        .some((value) => value.startsWith("better-auth.session_token=")),
    ).toBe(true);
    const [stored] = await connection.db
      .select()
      .from(session)
      .where(eq(session.id, sessionId));
    expect(stored.updatedAt.getTime()).toBeGreaterThan(agedUpdatedAt.getTime());
    expect(stored.expiresAt.getTime()).toBeGreaterThan(agedExpiresAt.getTime());
    expect(renewed.response?.session.expiresAt.getTime()).toBe(
      stored.expiresAt.getTime(),
    );
    const after = await connection.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.resourceId, sessionId),
          eq(activity.action, "sessions.update"),
        ),
      );
    expect(after).toHaveLength(before.length + 1);
    expect(after.at(-1)?.actorId).toBe(userId);
    await vi.waitFor(() =>
      expect(
        notifications.filter(
          (event) =>
            event.resourceId === sessionId &&
            event.action === "sessions.update",
        ),
      ).toHaveLength(2),
    );
  });
  it("delivers safe profile metadata, ignores malformed notifications and isolates subscriber failures", async () => {
    const received: ChangeEvent[] = [];
    const unsub = await core.subscribeChanges((event) => {
      received.push(event);
    });
    const failSync = await core.subscribeChanges(() => {
      throw new Error("consumer failure");
    });
    const failAsync = await core.subscribeChanges(async () => {
      throw new Error("async consumer failure");
    });
    try {
      const malformedId = randomUUID();
      await connection.client.notify("taff_changes", "not json");
      await connection.client.notify(
        "taff_changes",
        JSON.stringify({
          activityId: randomUUID(),
          workspaceId,
          resourceId: malformedId,
          action: "tasks.insert",
          actorId: userId,
          userId: null,
          token: "must not be forwarded",
        }),
      );
      await core.updateProfile(userId, { locale: "en", tz: "Asia/Singapore" });
      await vi.waitFor(() =>
        expect(
          received.some(
            (event) =>
              event.action === "users.update" && event.userId === userId,
          ),
        ).toBe(true),
      );
      const profile = received.find(
        (event) => event.action === "users.update" && event.userId === userId,
      );
      expect(profile).toMatchObject({
        workspaceId: null,
        resourceId: userId,
        actorId: userId,
        userId,
      });
      expect(Object.keys(profile!).sort()).toEqual([
        "action",
        "activityId",
        "actorId",
        "resourceId",
        "userId",
        "workspaceId",
      ]);
      expect(received.some((event) => event.resourceId === malformedId)).toBe(
        false,
      );
      await unsub();
      const before = received.length;
      const task = await core.createTask(userPrincipal(userId), {
        workspaceId,
        ownerId,
        workerId: null,
        dueAt: null,
        title: "After unsubscribe",
      });
      await vi.waitFor(() =>
        expect(
          notifications.some((event) => event.resourceId === task.id),
        ).toBe(true),
      );
      expect(received).toHaveLength(before);
    } finally {
      await unsub();
      await failSync();
      await failAsync();
    }
  });
  it("resubscribes after a dropped listener connection and keeps unsubscribe/close reliable", async () => {
    const database = new URL(options.databaseUrl);
    const applicationName = `taff-realtime-test-${randomUUID()}`;
    database.searchParams.set("application_name", applicationName);
    const subscribingCore = createCore({
      ...options,
      databaseUrl: database.toString(),
    });
    const received: ChangeEvent[] = [];
    let reconnected = 0;
    const unsubscribe = await subscribingCore.subscribeChanges(
      (event) => {
        received.push(event);
      },
      () => {
        reconnected++;
      },
    );
    try {
      expect(reconnected).toBe(0);
      const [backend] = await connection.client<
        { pid: number }[]
      >`select pid from pg_stat_activity where application_name=${applicationName} and query='listen "taff_changes"'`;
      expect(backend).toBeDefined();
      await connection.client`select pg_terminate_backend(${backend.pid})`;
      await vi.waitFor(() => expect(reconnected).toBe(1), { timeout: 5000 });
      const task = await core.createTask(userPrincipal(userId), {
        workspaceId,
        ownerId,
        workerId: null,
        dueAt: null,
        title: "After reconnect",
      });
      await vi.waitFor(() =>
        expect(received.some((event) => event.resourceId === task.id)).toBe(
          true,
        ),
      );
      await unsubscribe();
      const before = received.length;
      const next = await core.createTask(userPrincipal(userId), {
        workspaceId,
        ownerId,
        workerId: null,
        dueAt: null,
        title: "After reconnect unsubscribe",
      });
      await vi.waitFor(() =>
        expect(
          notifications.some((event) => event.resourceId === next.id),
        ).toBe(true),
      );
      expect(received).toHaveLength(before);
      await subscribingCore.close();
      await subscribingCore.close();
      await expect(subscribingCore.subscribeChanges(() => {})).rejects.toThrow(
        "Core is closed",
      );
    } finally {
      await unsubscribe();
      await subscribingCore.close();
    }
  });
  it("seeds exactly five people and three agents idempotently without changing credentials", async () => {
    const first = await seedDemo({ ...options, password });
    const team = await core.listMembers(
      userPrincipal(
        (
          await connection.db
            .select()
            .from(user)
            .where(eq(user.email, first.email))
        )[0].id,
      ),
      first.workspaceId,
    );
    expect(team.filter((member) => member.kind === "person")).toHaveLength(5);
    expect(team.filter((member) => member.kind === "agent")).toHaveLength(3);
    const before = await connection.db
      .select()
      .from(activity)
      .where(eq(activity.workspaceId, first.workspaceId));
    expect(
      await seedDemo({ ...options, password: `another-${randomUUID()}` }),
    ).toEqual(first);
    expect(
      await connection.db
        .select()
        .from(activity)
        .where(eq(activity.workspaceId, first.workspaceId)),
    ).toHaveLength(before.length);
    expect(
      await connection.db
        .select()
        .from(tasks)
        .where(eq(tasks.workspaceId, first.workspaceId)),
    ).toHaveLength(3);
    expect(
      await connection.db
        .select()
        .from(workspaces)
        .where(eq(workspaces.seedKey, "demo-v1")),
    ).toHaveLength(1);
  }, 30000);
  it("issues, authenticates, scopes and revokes agent tokens", async () => {
    const asUser = userPrincipal(userId);
    const issued = await core.createAgentToken(asUser, {
      workspaceId,
      memberId: agentId,
      name: "Research client",
      scopes: ["tasks:read", "tasks:write"],
    });
    expect(issued.token.startsWith("taff_")).toBe(true);
    expect(issued.prefix).toBe(issued.token.slice(0, 12));
    const stored = await connection.db
      .select()
      .from(agentTokens)
      .where(eq(agentTokens.id, issued.id));
    expect(stored[0].hash).not.toContain(issued.token.slice(5, 20));
    expect(
      (await core.listAgentTokens(asUser, workspaceId)).map((t) => t.id),
    ).toContain(issued.id);
    await expect(
      core.createAgentToken(userPrincipal(outsiderId), {
        workspaceId,
        memberId: agentId,
        name: "Outsider",
        scopes: ["tasks:read"],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.createAgentToken(asUser, {
        workspaceId,
        memberId: ownerId,
        name: "Person token",
        scopes: ["tasks:read"],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const agent = await core.authenticateAgentToken(issued.token);
    expect(agent).toMatchObject({
      kind: "agent",
      memberId: agentId,
      workspaceId,
      scopes: ["tasks:read", "tasks:write"],
    });
    if (!agent) throw new Error("token did not authenticate");
    expect(await core.authenticateAgentToken("taff_wrong")).toBeNull();
    const task = await core.createTask(agent, {
      workspaceId,
      ownerId,
      workerId: agentId,
      dueAt: null,
      title: "Agent-created task",
    });
    expect(task.workerId).toBe(agentId);
    const started = await core.updateTaskStatus(agent, task.id, {
      status: "in_progress",
    });
    expect(started.status).toBe("in_progress");
    await expect(
      core.updateTaskStatus(agent, task.id, { status: "needs_review" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.updateTaskStatus(agent, task.id, { status: "done" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      core.scheduleTask(agent, task.id, { dueAt: "2026-10-09T09:00:00Z" }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const actorRows = await connection.db
      .select()
      .from(activity)
      .where(eq(activity.resourceId, task.id));
    expect(actorRows.map((row) => row.actorId)).toEqual([
      `agent:${agentId}`,
      `agent:${agentId}`,
    ]);
    await expect(
      core.updateTaskStatus(asUser, task.id, { status: "done" }),
    ).rejects.toMatchObject({ code: "conflict" });
    await core.recordMcpCall({
      tokenId: issued.id,
      workspaceId,
      method: "tools/call",
      tool: "tasks.list",
      status: "ok",
      durationMs: 12,
    });
    const [listed] = await core.listAgentTokens(asUser, workspaceId);
    expect(listed.lastUsedAt).not.toBeNull();
    expect(await core.listMcpCalls(asUser, workspaceId)).toMatchObject([
      { tool: "tasks.list", status: "ok" },
    ]);
    await expect(core.listMcpCalls(agent, workspaceId)).rejects.toMatchObject({
      code: "forbidden",
    });
    const revoked = await core.revokeAgentToken(asUser, issued.id);
    expect(revoked.revokedAt).not.toBeNull();
    expect(await core.authenticateAgentToken(issued.token)).toBeNull();
    await expect(core.listTasks(agent, workspaceId)).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
