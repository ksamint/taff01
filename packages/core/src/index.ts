import { createHash, randomBytes, randomUUID } from "node:crypto";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  agentPermissions,
  agentProfiles,
  agentTokens,
  connectDatabase,
  grants,
  mcpCalls,
  members,
  runs,
  type Transaction,
  tasks,
  user,
  workspaces,
} from "@taff/db";
import * as schema from "@taff/db/schema";
import {
  type AgentToken,
  type AssignTask,
  assignTaskSchema,
  type ChangeEvent,
  type CreateAgentToken,
  type CreateTask,
  changeEventSchema,
  createAgentTokenSchema,
  createTaskSchema,
  type IssuedAgentToken,
  idSchema,
  type McpCall,
  type Me,
  type Member,
  mcpCallEntrySchema,
  type Profile,
  profileSchema,
  SchemaError,
  type Scope,
  scheduleTaskSchema,
  sendPhoneOtpSchema,
  type Task,
  type TaskFilter,
  type TaskStatus,
  taskFilterSchema,
  updateTaskStatusSchema,
  updateTaskWorkSchema,
  verifyPhoneOtpSchema,
} from "@taff/schemas";
import { betterAuth } from "better-auth";
import { createSmsAuth } from "./sms-auth";
import type { SmsProvider } from "./tencent-sms";

export type { SmsProvider } from "./tencent-sms";
export {
  createTencentSmsProvider,
  createTencentSmsProviderFromEnv,
  SmsProviderError,
} from "./tencent-sms";

import { and, desc, eq, isNull, max, sql } from "drizzle-orm";
import { createCalendarOperations } from "./calendar";
import { createNotificationOperations } from "./notifications";
import { type Action, type Actor, can, type Resource } from "./permissions";
import { createPlanningOperations } from "./planning";
import { createRunOperations } from "./runs";

export class CoreError extends Error {
  constructor(
    public code:
      | "unauthorized"
      | "forbidden"
      | "not_found"
      | "invalid_input"
      | "conflict",
    public status: number,
  ) {
    super(code);
  }
}
function parse<T>(validate: { parse(input: unknown): T }, input: unknown): T {
  try {
    return validate.parse(input);
  } catch (error) {
    if (error instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw error;
  }
}
function toTask(row: typeof tasks.$inferSelect): Task {
  return {
    ...row,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
/** Who is calling core: a signed-in person, or an agent through a token. */
export type Principal =
  | { kind: "user"; userId: string }
  | {
      kind: "agent";
      tokenId: string;
      memberId: string;
      workspaceId: string;
      scopes: Scope[];
    };
export function userPrincipal(userId: string): Principal {
  return { kind: "user", userId };
}
function toAgentToken(
  row: typeof agentTokens.$inferSelect,
  lastUsedAt: Date | null,
): AgentToken {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    memberId: row.memberId,
    createdBy: row.createdBy,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes as Scope[],
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: lastUsedAt?.toISOString() ?? null,
  };
}
function toMcpCall(row: typeof mcpCalls.$inferSelect): McpCall {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
export function hashToken(token: string, pepper: string): string {
  return createHash("sha256")
    .update(token + pepper)
    .digest("hex");
}
export function createCore(options: {
  databaseUrl: string;
  authUrl: string;
  authSecret: string;
  tokenPepper: string;
  sms?: SmsProvider;
}) {
  if (options.tokenPepper.length < 16)
    throw new Error("TOKEN_PEPPER must be at least 16 characters");
  const connection = connectDatabase(options.databaseUrl);
  const { db } = connection;
  type Subscriber = {
    listener: (event: ChangeEvent) => void | Promise<void>;
    onReconnect?: () => void | Promise<void>;
  };
  const subscribers = new Set<Subscriber>();
  let listening: ReturnType<typeof connection.client.listen> | undefined;
  let started = false;
  let closing = false;
  let closed: Promise<void> | undefined;
  function safely(callback: () => void | Promise<void>) {
    try {
      void Promise.resolve(callback()).catch(() => {});
    } catch {
      /* A consumer cannot disrupt other subscribers or the database listener. */
    }
  }
  async function subscribeChanges(
    listener: Subscriber["listener"],
    onReconnect?: Subscriber["onReconnect"],
  ): Promise<() => Promise<void>> {
    if (closing) throw new Error("Core is closed");
    const subscriber = { listener, onReconnect };
    subscribers.add(subscriber);
    // Postgres.js recreates listener identities on reconnect. Keep one owned
    // dispatcher so local unsubscribe still works after a connection is replaced.
    listening ??= connection.client.listen(
      "taff_changes",
      (payload) => {
        let event: ChangeEvent;
        try {
          const parsed = changeEventSchema.safeParse(JSON.parse(payload));
          if (!parsed.success) return;
          event = parsed.data;
        } catch {
          return;
        }
        for (const current of subscribers)
          safely(() => current.listener(event));
      },
      () => {
        if (started)
          for (const current of subscribers)
            if (current.onReconnect) safely(current.onReconnect);
        started = true;
      },
    );
    try {
      await listening;
    } catch {
      subscribers.delete(subscriber);
      listening = undefined;
      started = false;
      throw new Error("Realtime subscription unavailable");
    }
    if (closing) subscribers.delete(subscriber);
    return async () => {
      subscribers.delete(subscriber);
    };
  }
  async function close(): Promise<void> {
    if (closed) return closed;
    closing = true;
    subscribers.clear();
    closed = (async () => {
      await listening?.catch(() => {});
      await connection.close();
    })();
    return closed;
  }
  const sms = options.sms
    ? createSmsAuth(db, options.authSecret, options.sms)
    : undefined;
  const auth = betterAuth({
    plugins: sms ? [sms.plugin] : [],
    logger: { disabled: true },
    baseURL: options.authUrl,
    secret: options.authSecret,
    trustedOrigins: [options.authUrl],
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    user: {
      additionalFields: {
        locale: {
          type: "string",
          required: false,
          defaultValue: "en",
          input: false,
        },
        tz: {
          type: "string",
          required: false,
          defaultValue: "UTC",
          input: false,
        },
      },
    },
    advanced: { database: { generateId: () => randomUUID() } },
  });
  async function loadActor(
    query: typeof db | Transaction,
    principal: Principal,
    workspaceId: string,
  ): Promise<Actor | null> {
    if (principal.kind === "agent") {
      if (principal.workspaceId !== workspaceId) return null;
      const [member] = await query
        .select()
        .from(members)
        .where(
          and(
            eq(members.id, principal.memberId),
            eq(members.workspaceId, workspaceId),
          ),
        )
        .limit(1);
      if (!member || member.kind !== "agent") return null;
      const [token] = await query
        .select()
        .from(agentTokens)
        .where(
          and(
            eq(agentTokens.id, principal.tokenId),
            eq(agentTokens.workspaceId, workspaceId),
            eq(agentTokens.memberId, member.id),
            isNull(agentTokens.revokedAt),
          ),
        )
        .for("share");
      if (!token) return null;
      const [profile] = await query
        .select()
        .from(agentProfiles)
        .where(eq(agentProfiles.id, member.id));
      const permissions = await query
        .select()
        .from(agentPermissions)
        .where(eq(agentPermissions.agentId, member.id));
      const grantRows = await query
        .select()
        .from(grants)
        .where(eq(grants.agentId, member.id));
      return {
        ...member,
        scopes: token.scopes as Scope[],
        reviewPolicy: profile?.reviewPolicy ?? "always_review",
        permissions: permissions as Actor["permissions"],
        grants: grantRows.map((row) => ({
          ...row,
          expiresAt: row.expiresAt?.toISOString() ?? null,
        })) as Actor["grants"],
      };
    }
    const [member] = await query
      .select()
      .from(members)
      .where(
        and(
          eq(members.userId, principal.userId),
          eq(members.workspaceId, workspaceId),
        ),
      )
      .limit(1)
      .for("share");
    return member ?? null;
  }
  async function requireMember(
    query: typeof db | Transaction,
    principal: Principal,
    workspaceId: string,
    action: Action,
    resource: Resource = { workspaceId },
  ): Promise<Actor> {
    const actor = await loadActor(query, principal, workspaceId);
    if (!actor || !can(actor, action, resource))
      throw new CoreError("forbidden", 403);
    return actor;
  }
  async function mutation<T>(
    principal: Principal,
    run: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const actorId =
      principal.kind === "user"
        ? principal.userId
        : `agent:${principal.memberId}`;
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id', ${actorId}, true)`,
        );
        return run(tx);
      });
    } catch (error) {
      const cause =
        error instanceof Error && "cause" in error ? error.cause : error;
      if (cause instanceof Error && cause.message === "taff_conflict")
        throw new CoreError("conflict", 409);
      if (cause instanceof Error && cause.message === "taff_invalid")
        throw new CoreError("invalid_input", 400);
      throw error;
    }
  }
  async function getMe(userId: string): Promise<Me> {
    const [person] = await db
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!person) throw new CoreError("unauthorized", 401);
    const joined = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        memberId: members.id,
        role: members.role,
      })
      .from(members)
      .innerJoin(workspaces, eq(members.workspaceId, workspaces.id))
      .where(eq(members.userId, userId))
      .orderBy(
        sql`CASE WHEN ${workspaces.seedKey} IS NOT NULL THEN 0 ELSE 1 END`,
        workspaces.createdAt,
      );
    return {
      user: {
        id: person.id,
        name: person.name,
        email: person.email,
        locale: person.locale as Me["user"]["locale"],
        tz: person.tz,
      },
      workspaces: joined.map((row) => ({
        ...row,
        role: row.role as Member["role"],
      })),
    };
  }
  async function listMembers(
    principal: Principal,
    workspaceId: string,
  ): Promise<Member[]> {
    parse(idSchema, workspaceId);
    await requireMember(db, principal, workspaceId, "workspace:read");
    return db
      .select()
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.createdAt);
  }
  async function listTasks(
    principal: Principal,
    workspaceId: string,
    filter: TaskFilter = {},
  ): Promise<Task[]> {
    parse(idSchema, workspaceId);
    await requireMember(db, principal, workspaceId, "workspace:read");
    const body = parse(taskFilterSchema, filter);
    const where = [eq(tasks.workspaceId, workspaceId)];
    if (body.status) where.push(eq(tasks.status, body.status));
    for (const key of [
      "projectId",
      "parentId",
      "ownerId",
      "workerId",
      "priority",
    ] as const) {
      const value = body[key];
      if (value !== undefined)
        where.push(
          value === null ? isNull(tasks[key]) : sql`${tasks[key]} = ${value}`,
        );
    }
    if (body.label) where.push(sql`${body.label} = ANY(${tasks.labels})`);
    const sort =
      body.sort === "priority"
        ? tasks.priority
        : body.sort === "title"
          ? tasks.title
          : body.sort === "due"
            ? tasks.dueAt
            : body.sort === "updated"
              ? desc(tasks.updatedAt)
              : desc(tasks.createdAt);
    const rows = await db
      .select()
      .from(tasks)
      .where(and(...where))
      .orderBy(sort, tasks.id);
    return rows.map(toTask);
  }
  async function validateAssignees(
    tx: Transaction,
    workspaceId: string,
    ownerId: string,
    workerId: string | null,
  ) {
    const [owner] = await tx
      .select()
      .from(members)
      .where(and(eq(members.workspaceId, workspaceId), eq(members.id, ownerId)))
      .limit(1);
    if (!owner || owner.kind !== "person")
      throw new CoreError("invalid_input", 400);
    if (workerId) {
      const [worker] = await tx
        .select()
        .from(members)
        .where(
          and(eq(members.workspaceId, workspaceId), eq(members.id, workerId)),
        )
        .limit(1);
      if (!worker) throw new CoreError("invalid_input", 400);
    }
  }
  async function createTask(
    principal: Principal,
    input: CreateTask,
  ): Promise<Task> {
    const body = parse(createTaskSchema, input);
    const { calendar: initialCalendar, ...fields } = body;
    return mutation(principal, async (tx) => {
      await requireMember(tx, principal, body.workspaceId, "task:create", {
        workspaceId: body.workspaceId,
        taskId: body.parentId ?? undefined,
        toWorkerId: body.workerId,
      });
      let parent: typeof tasks.$inferSelect | undefined;
      if (body.parentId) {
        parent = await lockTask(tx, body.parentId);
        if (parent.workspaceId !== body.workspaceId)
          throw new CoreError("invalid_input", 400);
        if (parent.status === "done" || (await currentRunId(tx, parent.id)))
          throw new CoreError("conflict", 409);
      }
      const projectId =
        body.projectId === undefined
          ? (parent?.projectId ?? null)
          : body.projectId;
      await planning.validateProject(tx, body.workspaceId, projectId);
      await validateAssignees(
        tx,
        body.workspaceId,
        body.ownerId,
        body.workerId,
      );
      const [task] = await tx
        .insert(tasks)
        .values({
          ...fields,
          projectId,
          priority: body.priority ?? parent?.priority ?? 3,
          dueAt: body.dueAt
            ? new Date(body.dueAt)
            : body.dueAt === undefined
              ? (parent?.dueAt ?? null)
              : null,
        })
        .returning();
      if (initialCalendar)
        await calendar.storeOnCreate(tx, principal, task, initialCalendar);
      return toTask(task);
    });
  }
  async function lockTask(tx: Transaction, taskId: string) {
    parse(idSchema, taskId);
    const [task] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId))
      .limit(1)
      .for("update");
    if (!task) throw new CoreError("not_found", 404);
    return task;
  }
  /** Locks a task the principal belongs to; outsiders see not_found, never a version or 403. */
  async function lockTaskAs(
    tx: Transaction,
    principal: Principal,
    taskId: string,
  ) {
    const task = await lockTask(tx, taskId);
    if (!(await loadActor(tx, principal, task.workspaceId)))
      throw new CoreError("not_found", 404);
    return task;
  }
  async function applyAssignment(
    tx: Transaction,
    principal: Principal,
    task: typeof tasks.$inferSelect,
    workerId: string | null,
  ) {
    await requireMember(tx, principal, task.workspaceId, "task:assign", {
      workspaceId: task.workspaceId,
      ownerId: task.ownerId,
      workerId: task.workerId,
      taskId: task.id,
      runId: await currentRunId(tx, task.id),
      toWorkerId: workerId,
    });
    const active = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(
          eq(runs.taskId, task.id),
          sql`${runs.status} IN ('running','paused','needs_review','changes_requested')`,
        ),
      );
    if (active.length) throw new CoreError("conflict", 409);
    await validateAssignees(tx, task.workspaceId, task.ownerId, workerId);
    const [updated] = await tx
      .update(tasks)
      .set({ workerId, updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    return updated;
  }
  async function applyStatus(
    tx: Transaction,
    principal: Principal,
    task: typeof tasks.$inferSelect,
    status: TaskStatus,
  ) {
    const resource = {
      workspaceId: task.workspaceId,
      ownerId: task.ownerId,
      workerId: task.workerId,
      taskId: task.id,
      runId: await currentRunId(tx, task.id),
      to: status,
    };
    await requireMember(
      tx,
      principal,
      task.workspaceId,
      status === "done" ? "task:review" : "task:status",
      resource,
    );
    const active = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(
          eq(runs.taskId, task.id),
          sql`${runs.status} IN ('running','paused','needs_review','changes_requested')`,
        ),
      );
    if (
      active.length ||
      status === "needs_review" ||
      (status === "done" &&
        task.workerId !== null &&
        (
          await tx.select().from(members).where(eq(members.id, task.workerId))
        )[0]?.kind === "agent")
    )
      throw new CoreError("conflict", 409);
    const [updated] = await tx
      .update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(eq(tasks.id, task.id))
      .returning();
    return updated;
  }
  /** Worker and status change in one transaction: both apply or neither. */
  async function updateTaskWork(
    principal: Principal,
    taskId: string,
    input: { workerId?: string | null; status?: TaskStatus; version?: number },
  ): Promise<Task> {
    const body = parse(updateTaskWorkSchema, input);
    if (body.workerId === undefined && body.status === undefined)
      throw new CoreError("invalid_input", 400);
    return mutation(principal, async (tx) => {
      let task = await lockTaskAs(tx, principal, taskId);
      if (body.version !== undefined && body.version !== task.version)
        throw new CoreError("conflict", 409);
      if (body.workerId !== undefined)
        task = await applyAssignment(tx, principal, task, body.workerId);
      if (body.status !== undefined)
        task = await applyStatus(tx, principal, task, body.status);
      return toTask(task);
    });
  }
  async function currentRunId(
    tx: typeof db | Transaction,
    taskId: string,
  ): Promise<string | undefined> {
    const [run] = await tx
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(
          eq(runs.taskId, taskId),
          sql`${runs.status} IN ('running','paused','needs_review','changes_requested')`,
        ),
      );
    return run?.id;
  }
  async function assignTask(
    principal: Principal,
    taskId: string,
    input: AssignTask,
  ): Promise<Task> {
    const body = parse(assignTaskSchema, input);
    return mutation(principal, async (tx) => {
      const task = await lockTaskAs(tx, principal, taskId);
      if (body.version !== undefined && body.version !== task.version)
        throw new CoreError("conflict", 409);
      return toTask(await applyAssignment(tx, principal, task, body.workerId));
    });
  }
  async function updateTaskStatus(
    principal: Principal,
    taskId: string,
    input: { status: TaskStatus; version?: number },
  ): Promise<Task> {
    const body = parse(updateTaskStatusSchema, input);
    return mutation(principal, async (tx) => {
      const task = await lockTaskAs(tx, principal, taskId);
      if (body.version !== undefined && body.version !== task.version)
        throw new CoreError("conflict", 409);
      return toTask(await applyStatus(tx, principal, task, body.status));
    });
  }
  async function scheduleTask(
    principal: Principal,
    taskId: string,
    input: { dueAt: string | null; version?: number },
  ): Promise<Task> {
    const body = parse(scheduleTaskSchema, input);
    return mutation(principal, async (tx) => {
      const task = await lockTaskAs(tx, principal, taskId);
      if (body.version !== undefined && body.version !== task.version)
        throw new CoreError("conflict", 409);
      await requireMember(tx, principal, task.workspaceId, "task:schedule", {
        workspaceId: task.workspaceId,
        ownerId: task.ownerId,
        workerId: task.workerId,
        taskId: task.id,
        runId: await currentRunId(tx, task.id),
      });
      const [updated] = await tx
        .update(tasks)
        .set({
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId))
        .returning();
      return toTask(updated);
    });
  }
  async function updateProfile(
    userId: string,
    input: Profile,
  ): Promise<Me["user"]> {
    const body = parse(profileSchema, input);
    return mutation(userPrincipal(userId), async (tx) => {
      const [person] = await tx
        .select()
        .from(user)
        .where(eq(user.id, userId))
        .for("update");
      const [actor] = await tx
        .select()
        .from(members)
        .where(eq(members.userId, userId))
        .limit(1);
      if (!can(actor ?? null, "profile:update", { userId }))
        throw new CoreError("forbidden", 403);
      const [updated] = await tx
        .update(user)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(user.id, userId))
        .returning();
      if (person?.tz !== body.tz)
        await notifications.rescheduleForProfile(tx, userId, body.tz);
      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        ...body,
      };
    });
  }
  async function createAgentToken(
    principal: Principal,
    input: CreateAgentToken,
  ): Promise<IssuedAgentToken> {
    const body = parse(createAgentTokenSchema, input);
    if (principal.kind !== "user") throw new CoreError("forbidden", 403);
    return mutation(principal, async (tx) => {
      const actor = await requireMember(
        tx,
        principal,
        body.workspaceId,
        "token:manage",
      );
      const [agent] = await tx
        .select()
        .from(members)
        .where(
          and(
            eq(members.workspaceId, body.workspaceId),
            eq(members.id, body.memberId),
          ),
        )
        .limit(1);
      if (!agent || agent.kind !== "agent")
        throw new CoreError("invalid_input", 400);
      const token = `taff_${randomBytes(32).toString("base64url")}`;
      const [row] = await tx
        .insert(agentTokens)
        .values({
          workspaceId: body.workspaceId,
          memberId: body.memberId,
          createdBy: actor.id,
          name: body.name,
          hash: hashToken(token, options.tokenPepper),
          prefix: token.slice(0, 12),
          scopes: [...new Set(body.scopes)],
        })
        .returning();
      return { ...toAgentToken(row, null), token };
    });
  }
  async function listAgentTokens(
    principal: Principal,
    workspaceId: string,
  ): Promise<AgentToken[]> {
    parse(idSchema, workspaceId);
    await requireMember(db, principal, workspaceId, "token:manage");
    const lastUsed = db
      .select({
        tokenId: mcpCalls.tokenId,
        lastUsedAt: max(mcpCalls.createdAt).as("last_used_at"),
      })
      .from(mcpCalls)
      .groupBy(mcpCalls.tokenId)
      .as("last_used");
    const rows = await db
      .select({ token: agentTokens, lastUsedAt: lastUsed.lastUsedAt })
      .from(agentTokens)
      .leftJoin(lastUsed, eq(lastUsed.tokenId, agentTokens.id))
      .where(eq(agentTokens.workspaceId, workspaceId))
      .orderBy(desc(agentTokens.createdAt));
    return rows.map(({ token, lastUsedAt }) =>
      toAgentToken(token, lastUsedAt ? new Date(lastUsedAt) : null),
    );
  }
  async function revokeAgentToken(
    principal: Principal,
    tokenId: string,
  ): Promise<AgentToken> {
    parse(idSchema, tokenId);
    return mutation(principal, async (tx) => {
      const [row] = await tx
        .select()
        .from(agentTokens)
        .where(eq(agentTokens.id, tokenId))
        .limit(1)
        .for("update");
      if (!row) throw new CoreError("not_found", 404);
      await requireMember(tx, principal, row.workspaceId, "token:manage");
      if (row.revokedAt) return toAgentToken(row, null);
      const [updated] = await tx
        .update(agentTokens)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(eq(agentTokens.id, tokenId))
        .returning();
      return toAgentToken(updated, null);
    });
  }
  /** Resolves a raw bearer token to an agent principal, or null. */
  async function authenticateAgentToken(
    token: string,
  ): Promise<Principal | null> {
    if (!token.startsWith("taff_") || token.length > 200) return null;
    const [row] = await db
      .select()
      .from(agentTokens)
      .where(
        and(
          eq(agentTokens.hash, hashToken(token, options.tokenPepper)),
          isNull(agentTokens.revokedAt),
        ),
      )
      .limit(1);
    if (!row) return null;
    return {
      kind: "agent",
      tokenId: row.id,
      memberId: row.memberId,
      workspaceId: row.workspaceId,
      scopes: row.scopes as Scope[],
    };
  }
  async function recordMcpCall(entry: {
    tokenId: string;
    workspaceId: string;
    method: string;
    tool: string | null;
    status: McpCall["status"];
    durationMs: number;
  }): Promise<void> {
    const row = parse(mcpCallEntrySchema, entry);
    await db.transaction(async (tx) => {
      const [token] = await tx
        .select()
        .from(agentTokens)
        .where(
          and(
            eq(agentTokens.id, row.tokenId),
            eq(agentTokens.workspaceId, row.workspaceId),
          ),
        );
      if (!token) throw new CoreError("forbidden", 403);
      await tx.execute(
        sql`select set_config('taff.actor_id', ${`agent:${token.memberId}`}, true)`,
      );
      await tx.insert(mcpCalls).values(row);
    });
  }
  async function listMcpCalls(
    principal: Principal,
    workspaceId: string,
  ): Promise<McpCall[]> {
    parse(idSchema, workspaceId);
    await requireMember(db, principal, workspaceId, "token:manage");
    const rows = await db
      .select()
      .from(mcpCalls)
      .where(eq(mcpCalls.workspaceId, workspaceId))
      .orderBy(desc(mcpCalls.createdAt))
      .limit(200);
    return rows.map(toMcpCall);
  }
  function getSession(headers: Headers, disableRefresh = false) {
    return auth.api.getSession({
      headers,
      query: { disableRefresh },
      returnHeaders: true,
    });
  }
  const notifications = createNotificationOperations({
    db,
    mutation,
    requireMember,
  });
  const calendar = createCalendarOperations({
    db,
    mutation,
    requireMember,
    lockTask,
    currentRunId,
  });
  const planning = createPlanningOperations({
    db,
    mutation,
    requireMember,
    lockTask,
    validateAssignees,
    currentRunId,
    tokenPepper: options.tokenPepper,
  });
  return {
    ...notifications.operations,
    ...calendar.operations,
    ...planning.operations,
    ...createRunOperations({
      db,
      mutation,
      loadActor,
      requireMember,
      lockTask,
    }),
    auth,
    getAuthMethods: () => ({ smsEnabled: Boolean(sms) }),
    handlePhoneAuth: async (request: Request, peerAddress: string) => {
      const path = new URL(request.url).pathname;
      const validator =
        path === "/api/auth/phone-number/send-otp"
          ? sendPhoneOtpSchema
          : path === "/api/auth/phone-number/verify"
            ? verifyPhoneOtpSchema
            : null;
      if (request.method !== "POST" || !validator)
        return new Response(null, { status: 404 });
      validator.parse(await request.clone().json());
      if (!sms)
        return Response.json({ error: "sms_unavailable" }, { status: 503 });
      return auth.handler(sms.request(request, peerAddress));
    },
    getSession,
    getMe,
    listMembers,
    listTasks,
    createTask,
    assignTask,
    updateTaskStatus,
    updateTaskWork,
    scheduleTask,
    updateProfile,
    createAgentToken,
    listAgentTokens,
    revokeAgentToken,
    authenticateAgentToken,
    recordMcpCall,
    listMcpCalls,
    subscribeChanges,
    close,
  };
}
export type Core = ReturnType<typeof createCore>;
