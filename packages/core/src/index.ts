import { randomUUID } from "node:crypto";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import {
  connectDatabase,
  members,
  type Transaction,
  tasks,
  user,
  workspaces,
} from "@taff/db";
import * as schema from "@taff/db/schema";
import {
  type AssignTask,
  assignTaskSchema,
  type CreateTask,
  createTaskSchema,
  idSchema,
  type Me,
  type Member,
  type Profile,
  profileSchema,
  type Task,
} from "@taff/schemas";
import { betterAuth } from "better-auth";
import { and, desc, eq, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { type Action, can, type Resource } from "./permissions";

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
    if (error instanceof ZodError) throw new CoreError("invalid_input", 400);
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
export function createCore(options: {
  databaseUrl: string;
  authUrl: string;
  authSecret: string;
}) {
  const connection = connectDatabase(options.databaseUrl);
  const { db } = connection;
  const auth = betterAuth({
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
  async function requireMember(
    query: typeof db | Transaction,
    userId: string,
    workspaceId: string,
    action: Action,
    resource: Resource = { workspaceId },
  ): Promise<Member> {
    const [actor] = await query
      .select()
      .from(members)
      .where(
        and(eq(members.userId, userId), eq(members.workspaceId, workspaceId)),
      )
      .limit(1);
    if (!can(actor ?? null, action, resource))
      throw new CoreError("forbidden", 403);
    return actor;
  }
  async function mutation<T>(
    userId: string,
    run: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id', ${userId}, true)`,
      );
      return run(tx);
    });
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
      workspaces: joined,
    };
  }
  async function listMembers(
    userId: string,
    workspaceId: string,
  ): Promise<Member[]> {
    parse(idSchema, workspaceId);
    await requireMember(db, userId, workspaceId, "workspace:read");
    return db
      .select()
      .from(members)
      .where(eq(members.workspaceId, workspaceId))
      .orderBy(members.createdAt);
  }
  async function listTasks(
    userId: string,
    workspaceId: string,
  ): Promise<Task[]> {
    parse(idSchema, workspaceId);
    await requireMember(db, userId, workspaceId, "workspace:read");
    return (
      await db
        .select()
        .from(tasks)
        .where(eq(tasks.workspaceId, workspaceId))
        .orderBy(desc(tasks.createdAt), tasks.id)
    ).map(toTask);
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
  async function createTask(userId: string, input: CreateTask): Promise<Task> {
    const body = parse(createTaskSchema, input);
    return mutation(userId, async (tx) => {
      await requireMember(tx, userId, body.workspaceId, "task:create");
      await validateAssignees(
        tx,
        body.workspaceId,
        body.ownerId,
        body.workerId,
      );
      const [task] = await tx
        .insert(tasks)
        .values({ ...body, dueAt: body.dueAt ? new Date(body.dueAt) : null })
        .returning();
      return toTask(task);
    });
  }
  async function assignTask(
    userId: string,
    taskId: string,
    input: AssignTask,
  ): Promise<Task> {
    parse(idSchema, taskId);
    const body = parse(assignTaskSchema, input);
    return mutation(userId, async (tx) => {
      const [task] = await tx
        .select()
        .from(tasks)
        .where(eq(tasks.id, taskId))
        .limit(1)
        .for("update");
      if (!task) throw new CoreError("not_found", 404);
      await requireMember(tx, userId, task.workspaceId, "task:assign", {
        workspaceId: task.workspaceId,
        ownerId: task.ownerId,
      });
      await validateAssignees(
        tx,
        task.workspaceId,
        task.ownerId,
        body.workerId,
      );
      const [updated] = await tx
        .update(tasks)
        .set({ workerId: body.workerId, updatedAt: new Date() })
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
    return mutation(userId, async (tx) => {
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
      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        ...body,
      };
    });
  }
  function getSession(headers: Headers) {
    return auth.api.getSession({ headers, returnHeaders: true });
  }
  return {
    auth,
    getSession,
    getMe,
    listMembers,
    listTasks,
    createTask,
    assignTask,
    updateProfile,
    close: connection.close,
  };
}
export type Core = ReturnType<typeof createCore>;
