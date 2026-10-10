import { randomBytes } from "node:crypto";
import {
  type Database,
  members,
  projects,
  reviewComments,
  type Transaction,
  taskComments,
  tasks,
  user,
  workspaceInvites,
  workspaces,
} from "@taff/db";
import {
  type IssuedWorkspaceInvite,
  idSchema,
  type Member,
  type MemberRoleInput,
  memberRoleInputSchema,
  type Project,
  type ProjectInput,
  type ProjectUpdate,
  projectInputSchema,
  projectUpdateSchema,
  type QuickAddInput,
  type QuickAddResult,
  quickAddInputSchema,
  SchemaError,
  type SearchInput,
  type SearchResult,
  searchInputSchema,
  type Task,
  type TaskAccess,
  type TaskComment,
  type TaskCommentInput,
  taskCommentInputSchema,
  type UpdateTask,
  updateTaskSchema,
  type Workspace,
  type WorkspaceAccess,
  type WorkspaceCreate,
  type WorkspaceInvite,
  type WorkspaceInviteAccept,
  type WorkspaceInviteInput,
  workspaceCreateSchema,
  workspaceInviteAcceptSchema,
  workspaceInviteInputSchema,
  workspaceKeyFromName,
} from "@taff/schemas";
import { and, desc, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { CoreError, hashToken, type Principal } from "./index";
import { type Action, type Actor, can, type Resource } from "./permissions";
import { localDate, parseQuickAddText } from "./quick-add";

function parse<T>(schema: { parse(v: unknown): T }, v: unknown): T {
  try {
    return schema.parse(v);
  } catch (e) {
    if (e instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw e;
  }
}
function invalid(): never {
  throw new CoreError("invalid_input", 400);
}
function conflict(): never {
  throw new CoreError("conflict", 409);
}
function snippet(value: string, query: string): string {
  const index = query ? value.toLowerCase().indexOf(query) : 0;
  const start = Math.max(0, index - 80);
  return value.slice(start, start + 300);
}
function dtoTask(row: typeof tasks.$inferSelect): Task {
  return {
    ...row,
    dueAt: row.dueAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function dtoProject(row: typeof projects.$inferSelect): Project {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function dtoComment(row: typeof taskComments.$inferSelect): TaskComment {
  return { ...row, createdAt: row.createdAt.toISOString() };
}
function dtoInvite(row: typeof workspaceInvites.$inferSelect): WorkspaceInvite {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role,
    status:
      row.status === "pending" && row.expiresAt.getTime() <= Date.now()
        ? "expired"
        : (row.status as WorkspaceInvite["status"]),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}
type Dependencies = {
  db: Database;
  tokenPepper: string;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
  lockTask(tx: Transaction, id: string): Promise<typeof tasks.$inferSelect>;
  validateAssignees(
    tx: Transaction,
    w: string,
    owner: string,
    worker: string | null,
  ): Promise<void>;
  currentRunId(
    tx: Database | Transaction,
    id: string,
  ): Promise<string | undefined>;
};
export function createPlanningOperations({
  db,
  tokenPepper,
  mutation,
  requireMember,
  lockTask,
  validateAssignees,
  currentRunId,
}: Dependencies) {
  async function validateProject(
    tx: Transaction,
    workspaceId: string,
    id: string | null,
  ) {
    if (!id) return;
    const [row] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, workspaceId)))
      .for("share");
    if (!row || row.archived) invalid();
  }
  async function getWorkspaceAccess(
    p: Principal,
    w: string,
  ): Promise<WorkspaceAccess> {
    parse(idSchema, w);
    const actor = await requireMember(db, p, w, "workspace:read");
    return {
      canCreateTasks: can(actor, "task:create", { workspaceId: w }),
      canManageProjects: can(actor, "project:manage", { workspaceId: w }),
      canInvite: can(actor, "workspace:manage", { workspaceId: w }),
      canManageRoles: can(actor, "workspace:manage", { workspaceId: w }),
    };
  }
  async function readTask(p: Principal, id: string) {
    parse(idSchema, id);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) throw new CoreError("not_found", 404);
    const actor = await requireMember(
      db,
      p,
      task.workspaceId,
      "workspace:read",
      { workspaceId: task.workspaceId, taskId: id },
    );
    return { task, actor };
  }
  async function getTaskAccess(p: Principal, id: string): Promise<TaskAccess> {
    const { task, actor } = await readTask(p, id);
    const active = await currentRunId(db, id);
    const resource = {
      workspaceId: task.workspaceId,
      ownerId: task.ownerId,
      workerId: task.workerId,
      taskId: id,
      runId: active,
    };
    const assignedAgent = task.workerId
      ? (
          await db.select().from(members).where(eq(members.id, task.workerId))
        )[0]?.kind === "agent"
      : false;
    const parentDone = task.parentId
      ? (
          await db
            .select({ status: tasks.status })
            .from(tasks)
            .where(eq(tasks.id, task.parentId))
        )[0]?.status === "done"
      : false;
    const incompleteChildren =
      (
        await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.parentId, id), sql`${tasks.status}<>'done'`))
          .limit(1)
      ).length > 0;
    return {
      canEdit: !active && can(actor, "task:edit", resource),
      canEditMetadata:
        can(actor, "task:edit", resource) ||
        can(actor, "task:schedule", resource),
      canComment: can(actor, "task:comment", resource),
      canAssign:
        !active &&
        can(actor, "task:assign", { ...resource, toWorkerId: task.workerId }),
      allowedStatuses: active
        ? []
        : (["todo", "in_progress", "done"] as const).filter(
            (to) =>
              !(to === "done" && (assignedAgent || incompleteChildren)) &&
              !(parentDone && to !== "done") &&
              can(actor, to === "done" ? "task:review" : "task:status", {
                ...resource,
                to,
              }),
          ),
    };
  }
  async function updateTask(
    p: Principal,
    id: string,
    input: UpdateTask,
  ): Promise<Task> {
    const body = parse(updateTaskSchema, input);
    return mutation(p, async (tx) => {
      const task = await lockTask(tx, id);
      const runId = await currentRunId(tx, id);
      const resource = {
        workspaceId: task.workspaceId,
        ownerId: task.ownerId,
        workerId: task.workerId,
        taskId: id,
        runId,
      };
      if (body.version !== task.version) conflict();
      const keys = Object.keys(body).filter(
        (k) => k !== "version" && k !== "dueAt" && k !== "status",
      );
      if (keys.length)
        await requireMember(tx, p, task.workspaceId, "task:edit", resource);
      if (body.dueAt !== undefined)
        await requireMember(tx, p, task.workspaceId, "task:schedule", resource);
      if (body.ownerId !== undefined) {
        await requireMember(tx, p, task.workspaceId, "task:owner", resource);
        await validateAssignees(
          tx,
          task.workspaceId,
          body.ownerId,
          task.workerId,
        );
      }
      if (
        runId &&
        (body.title !== undefined ||
          body.description !== undefined ||
          body.ownerId !== undefined)
      )
        conflict();
      if (body.projectId !== undefined && body.projectId !== task.projectId)
        await validateProject(tx, task.workspaceId, body.projectId);
      if (body.status !== undefined) {
        await requireMember(
          tx,
          p,
          task.workspaceId,
          body.status === "done" ? "task:review" : "task:status",
          { ...resource, to: body.status },
        );
        if (runId || body.status === "needs_review") conflict();
        if (
          body.status === "done" &&
          task.workerId &&
          (
            await tx.select().from(members).where(eq(members.id, task.workerId))
          )[0]?.kind === "agent"
        )
          conflict();
      }
      const { version: _, dueAt, ...fields } = body;
      const [row] = await tx
        .update(tasks)
        .set({
          ...fields,
          ...(dueAt !== undefined
            ? { dueAt: dueAt ? new Date(dueAt) : null }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, id))
        .returning();
      return dtoTask(row);
    });
  }
  async function listTaskComments(
    p: Principal,
    id: string,
  ): Promise<TaskComment[]> {
    await readTask(p, id);
    return (
      await db
        .select()
        .from(taskComments)
        .where(eq(taskComments.taskId, id))
        .orderBy(taskComments.createdAt, taskComments.id)
    ).map(dtoComment);
  }
  async function addTaskComment(
    p: Principal,
    id: string,
    input: TaskCommentInput,
  ): Promise<TaskComment> {
    const body = parse(taskCommentInputSchema, input);
    return mutation(p, async (tx) => {
      const task = await lockTask(tx, id);
      const actor = await requireMember(
        tx,
        p,
        task.workspaceId,
        "task:comment",
        {
          workspaceId: task.workspaceId,
          ownerId: task.ownerId,
          workerId: task.workerId,
          taskId: id,
          runId: await currentRunId(tx, id),
        },
      );
      const [row] = await tx
        .insert(taskComments)
        .values({
          ...body,
          workspaceId: task.workspaceId,
          taskId: id,
          authorId: actor.id,
        })
        .returning();
      return dtoComment(row);
    });
  }
  async function listProjects(p: Principal, w: string): Promise<Project[]> {
    parse(idSchema, w);
    await requireMember(db, p, w, "workspace:read");
    return (
      await db
        .select()
        .from(projects)
        .where(eq(projects.workspaceId, w))
        .orderBy(projects.createdAt, projects.id)
    ).map(dtoProject);
  }
  async function createProject(
    p: Principal,
    w: string,
    input: ProjectInput,
  ): Promise<Project> {
    parse(idSchema, w);
    const body = parse(projectInputSchema, input);
    return mutation(p, async (tx) => {
      await requireMember(tx, p, w, "project:manage");
      const [row] = await tx
        .insert(projects)
        .values({ ...body, workspaceId: w })
        .returning();
      return dtoProject(row);
    });
  }
  async function updateProject(
    p: Principal,
    id: string,
    input: ProjectUpdate,
  ): Promise<Project> {
    parse(idSchema, id);
    const body = parse(projectUpdateSchema, input);
    return mutation(p, async (tx) => {
      const [row] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .for("update");
      if (!row) throw new CoreError("not_found", 404);
      await requireMember(tx, p, row.workspaceId, "project:manage");
      if (row.version !== body.version) conflict();
      const [updated] = await tx
        .update(projects)
        .set({ ...body, version: row.version + 1, updatedAt: new Date() })
        .where(eq(projects.id, id))
        .returning();
      return dtoProject(updated);
    });
  }
  async function lockWorkspace(tx: Transaction, w: string) {
    parse(idSchema, w);
    const [row] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, w))
      .for("update");
    if (!row) throw new CoreError("not_found", 404);
    return row;
  }
  async function createWorkspace(
    p: Principal,
    input: WorkspaceCreate,
  ): Promise<Workspace> {
    const body = parse(workspaceCreateSchema, input);
    if (p.kind !== "user") throw new CoreError("forbidden", 403);
    return mutation(p, async (tx) => {
      const [person] = await tx
        .select()
        .from(user)
        .where(eq(user.id, p.userId));
      if (!person) throw new CoreError("unauthorized", 401);
      const [identity] = await tx
        .select()
        .from(members)
        .where(eq(members.userId, p.userId))
        .limit(1);
      if (!can(identity ?? null, "workspace:create", { userId: p.userId }))
        throw new CoreError("forbidden", 403);
      const copied: (typeof members.$inferSelect)[] = [];
      for (const id of body.agentIds ?? []) {
        const [agent] = await tx
          .select()
          .from(members)
          .where(eq(members.id, id));
        if (!agent || agent.kind !== "agent") invalid();
        await requireMember(tx, p, agent.workspaceId, "workspace:manage");
        if (copied.some((a) => a.name === agent.name)) invalid();
        copied.push(agent);
      }
      const [workspace] = await tx
        .insert(workspaces)
        .values({ name: body.name, key: workspaceKeyFromName(body.name) })
        .returning();
      const [member] = await tx
        .insert(members)
        .values({
          workspaceId: workspace.id,
          userId: p.userId,
          name: person.name,
          kind: "person",
          role: "admin",
        })
        .onConflictDoUpdate({
          target: [members.workspaceId, members.userId],
          set: { role: "admin", updatedAt: new Date() },
        })
        .returning();
      for (const agent of copied)
        await tx.insert(members).values({
          workspaceId: workspace.id,
          name: agent.name,
          kind: "agent",
          role: "member",
        });
      return {
        id: workspace.id,
        name: workspace.name,
        key: workspace.key,
        memberId: member.id,
      };
    });
  }
  async function listWorkspaceInvites(
    p: Principal,
    w: string,
  ): Promise<WorkspaceInvite[]> {
    parse(idSchema, w);
    await requireMember(db, p, w, "workspace:manage");
    return (
      await db
        .select()
        .from(workspaceInvites)
        .where(eq(workspaceInvites.workspaceId, w))
        .orderBy(desc(workspaceInvites.createdAt))
    ).map(dtoInvite);
  }
  async function createWorkspaceInvite(
    p: Principal,
    w: string,
    input: WorkspaceInviteInput,
  ): Promise<IssuedWorkspaceInvite> {
    const body = parse(workspaceInviteInputSchema, input);
    return mutation(p, async (tx) => {
      await lockWorkspace(tx, w);
      const actor = await requireMember(tx, p, w, "workspace:manage");
      const email = body.email.trim().toLowerCase();
      const [existing] = await tx
        .select()
        .from(members)
        .innerJoin(user, eq(members.userId, user.id))
        .where(
          and(eq(members.workspaceId, w), sql`lower(${user.email})=${email}`),
        );
      if (existing) conflict();
      const [pending] = await tx
        .select()
        .from(workspaceInvites)
        .where(
          and(
            eq(workspaceInvites.workspaceId, w),
            eq(workspaceInvites.email, email),
            eq(workspaceInvites.status, "pending"),
            sql`${workspaceInvites.expiresAt}>now()`,
          ),
        );
      if (pending) conflict();
      const token = randomBytes(32).toString("base64url");
      const [row] = await tx
        .insert(workspaceInvites)
        .values({
          workspaceId: w,
          email,
          role: body.role,
          hash: hashToken(token, tokenPepper),
          createdBy: actor.id,
          expiresAt: new Date(Date.now() + 7 * 86400000),
        })
        .returning();
      return { ...dtoInvite(row), token };
    });
  }
  async function findInvite(tx: Transaction, id: string) {
    parse(idSchema, id);
    const [row] = await tx
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.id, id));
    if (!row) throw new CoreError("not_found", 404);
    await lockWorkspace(tx, row.workspaceId);
    const [locked] = await tx
      .select()
      .from(workspaceInvites)
      .where(eq(workspaceInvites.id, id))
      .for("update");
    return locked;
  }
  async function revokeWorkspaceInvite(
    p: Principal,
    id: string,
  ): Promise<WorkspaceInvite> {
    return mutation(p, async (tx) => {
      const row = await findInvite(tx, id);
      await requireMember(tx, p, row.workspaceId, "workspace:manage");
      if (row.status === "accepted") conflict();
      if (row.status === "revoked") return dtoInvite(row);
      const [updated] = await tx
        .update(workspaceInvites)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(workspaceInvites.id, id))
        .returning();
      return dtoInvite(updated);
    });
  }
  async function acceptWorkspaceInvite(
    p: Principal,
    input: WorkspaceInviteAccept,
  ): Promise<Workspace> {
    const body = parse(workspaceInviteAcceptSchema, input);
    if (p.kind !== "user") throw new CoreError("forbidden", 403);
    return mutation(p, async (tx) => {
      const [first] = await tx
        .select()
        .from(workspaceInvites)
        .where(eq(workspaceInvites.hash, hashToken(body.token, tokenPepper)));
      if (!first) throw new CoreError("not_found", 404);
      const row = await findInvite(tx, first.id);
      const [person] = await tx
        .select()
        .from(user)
        .where(eq(user.id, p.userId));
      if (!person) throw new CoreError("unauthorized", 401);
      const [identity] = await tx
        .select()
        .from(members)
        .where(eq(members.userId, p.userId))
        .limit(1);
      if (!can(identity ?? null, "workspace:join", { userId: p.userId }))
        throw new CoreError("forbidden", 403);
      if (person.email.trim().toLowerCase() !== row.email)
        throw new CoreError("forbidden", 403);
      if (row.status !== "pending" || row.expiresAt.getTime() <= Date.now())
        conflict();
      const [existing] = await tx
        .select()
        .from(members)
        .where(
          and(
            eq(members.workspaceId, row.workspaceId),
            eq(members.userId, p.userId),
          ),
        );
      if (existing) conflict();
      const [member] = await tx
        .insert(members)
        .values({
          workspaceId: row.workspaceId,
          userId: p.userId,
          name: person.name,
          kind: "person",
          role: row.role,
        })
        .returning();
      await tx
        .update(workspaceInvites)
        .set({
          status: "accepted",
          acceptedBy: p.userId,
          updatedAt: new Date(),
        })
        .where(eq(workspaceInvites.id, row.id));
      const [workspace] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, row.workspaceId));
      return {
        id: workspace.id,
        name: workspace.name,
        key: workspace.key,
        memberId: member.id,
      };
    });
  }
  async function updateMemberRole(
    p: Principal,
    w: string,
    id: string,
    input: MemberRoleInput,
  ): Promise<Member> {
    parse(idSchema, id);
    const body = parse(memberRoleInputSchema, input);
    return mutation(p, async (tx) => {
      await lockWorkspace(tx, w);
      await requireMember(tx, p, w, "workspace:manage");
      const [row] = await tx
        .select()
        .from(members)
        .where(and(eq(members.id, id), eq(members.workspaceId, w)))
        .for("update");
      if (!row || row.kind !== "person") invalid();
      if (row.role === "admin" && body.role !== "admin") {
        const admins = await tx
          .select({ id: members.id })
          .from(members)
          .where(
            and(
              eq(members.workspaceId, w),
              eq(members.kind, "person"),
              eq(members.role, "admin"),
            ),
          );
        if (admins.length <= 1) conflict();
      }
      const [updated] = await tx
        .update(members)
        .set({ role: body.role, updatedAt: new Date() })
        .where(eq(members.id, id))
        .returning();
      return updated;
    });
  }
  async function parseQuickAdd(
    p: Principal,
    w: string,
    input: QuickAddInput,
  ): Promise<QuickAddResult> {
    const body = parse(quickAddInputSchema, input);
    parse(idSchema, w);
    const actor = await requireMember(db, p, w, "workspace:read");
    const roster = await db
      .select()
      .from(members)
      .where(eq(members.workspaceId, w));
    const projectRows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.workspaceId, w), eq(projects.archived, false)));
    const person =
      p.kind === "user"
        ? (await db.select().from(user).where(eq(user.id, p.userId)))[0]
        : null;
    return parseQuickAddText(body.text, {
      members: roster,
      projects: projectRows,
      ownerId: actor.kind === "person" ? actor.id : null,
      tz: person?.tz ?? "UTC",
      now: new Date(),
    });
  }
  async function search(
    p: Principal,
    w: string,
    input: SearchInput,
  ): Promise<SearchResult[]> {
    const body = parse(searchInputSchema, input);
    parse(idSchema, w);
    await requireMember(db, p, w, "workspace:read");
    const memberships =
      p.kind === "user" && body.scope === "all"
        ? await db
            .select({ workspaceId: members.workspaceId, id: members.id })
            .from(members)
            .where(eq(members.userId, p.userId))
        : [];
    const ids = memberships.length
      ? memberships.map((m) => m.workspaceId)
      : [w];
    const filter = body.filters ?? {};
    const conditions: SQL[] = [inArray(tasks.workspaceId, ids)];
    let text = body.query;
    const statusMap: Record<string, Task["status"]> = {
      todo: "todo",
      doing: "in_progress",
      working: "in_progress",
      review: "needs_review",
      done: "done",
    };
    let mine = false,
      agentOnly = false,
      today = false;
    const flags = [
      ...text.matchAll(
        /\bis:(todo|doing|working|review|done|mine|agent|today)\b/gi,
      ),
    ];
    for (const flag of flags) {
      const value = flag[1].toLowerCase();
      text = text.replace(flag[0], "");
      if (statusMap[value]) conditions.push(eq(tasks.status, statusMap[value]));
      else if (value === "mine") mine = true;
      else if (value === "agent") agentOnly = true;
      else if (value === "today") today = true;
    }
    const agentMatches = [...text.matchAll(/\bagent:("[^"]+"|[^\s]+)/gi)];
    for (const match of agentMatches) {
      const name = match[1].replace(/^"|"$/g, "").toLowerCase();
      conditions.push(
        sql`${tasks.workerId} IN (SELECT id FROM members WHERE kind='agent' AND (lower(name)=${name} OR lower(split_part(name,' ',1))=${name}))`,
      );
      text = text.replace(match[0], "");
    }
    if (mine) {
      if (p.kind !== "user") conditions.push(sql`false`);
      else
        conditions.push(
          sql`${tasks.ownerId} IN (SELECT id FROM members WHERE user_id=${p.userId})`,
        );
    }
    if (agentOnly)
      conditions.push(
        sql`${tasks.workerId} IN (SELECT id FROM members WHERE kind='agent')`,
      );
    if (today) {
      const person =
        p.kind === "user"
          ? (await db.select().from(user).where(eq(user.id, p.userId)))[0]
          : null;
      const tz = person?.tz ?? "UTC";
      const day = localDate(new Date(), tz);
      const offset = /^([+-])(\d{2})(?::?(\d{2}))?$/.exec(tz);
      const local = offset
        ? sql`${tasks.dueAt} AT TIME ZONE ${`${offset[1]}${offset[2]}:${offset[3] ?? "00"}`}::interval`
        : sql`${tasks.dueAt} AT TIME ZONE ${tz}`;
      conditions.push(sql`(${local})::date = ${day}::date`);
    }
    if (filter.status) conditions.push(eq(tasks.status, filter.status));
    for (const key of [
      "projectId",
      "parentId",
      "ownerId",
      "workerId",
      "priority",
    ] as const) {
      const value = filter[key];
      if (value !== undefined)
        conditions.push(
          value === null ? isNull(tasks[key]) : sql`${tasks[key]}=${value}`,
        );
    }
    if (filter.label)
      conditions.push(sql`${filter.label}=ANY(${tasks.labels})`);
    text = text.trim().toLowerCase();
    const found: SearchResult[] = [];
    const kinds = body.types ?? ["task", "comment"];
    const literal = (column: SQL) =>
      text ? sql`position(${text} in lower(${column}))>0` : sql`true`;
    if (kinds.includes("task")) {
      const rows = await db
        .select({
          task: tasks,
          workspaceName: workspaces.name,
          workspaceKey: workspaces.key,
        })
        .from(tasks)
        .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
        .where(
          and(
            ...conditions,
            sql`(${literal(sql`${tasks.title}`)} OR ${literal(sql`${tasks.description}`)} OR ${literal(sql`${tasks.id}::text`)})`,
          ),
        )
        .orderBy(
          sql`CASE WHEN ${literal(sql`${tasks.title}`)} THEN 0 ELSE 1 END`,
          desc(tasks.updatedAt),
          tasks.id,
        )
        .limit(body.limit);
      for (const row of rows) {
        const titleMatch =
          !text ||
          row.task.title.toLowerCase().includes(text) ||
          row.task.id.includes(text);
        found.push({
          id: row.task.id,
          type: "task",
          workspaceId: row.task.workspaceId,
          workspaceName: row.workspaceName,
          workspaceKey: row.workspaceKey,
          taskId: row.task.id,
          title: row.task.title,
          snippet: snippet(
            titleMatch ? row.task.title : row.task.description,
            text,
          ),
          match: titleMatch ? "title" : "description",
          task: dtoTask(row.task),
        });
      }
    }
    if (kinds.includes("comment")) {
      for (const table of [taskComments, reviewComments] as const) {
        const join =
          table === taskComments
            ? eq(taskComments.taskId, tasks.id)
            : sql`${reviewComments.runId} IN (SELECT id FROM runs WHERE task_id=${tasks.id})`;
        const rows = await db
          .select({
            id: table.id,
            body: table.body,
            task: tasks,
            workspaceName: workspaces.name,
            workspaceKey: workspaces.key,
          })
          .from(table)
          .innerJoin(tasks, join)
          .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
          .where(and(...conditions, literal(sql`${table.body}`)))
          .orderBy(desc(table.createdAt), table.id)
          .limit(body.limit);
        for (const row of rows)
          found.push({
            id: row.id,
            type: "comment",
            workspaceId: row.task.workspaceId,
            workspaceName: row.workspaceName,
            workspaceKey: row.workspaceKey,
            taskId: row.task.id,
            title: row.task.title,
            snippet: snippet(row.body, text),
            match: "comment",
            task: dtoTask(row.task),
          });
      }
    }
    return found
      .sort(
        (a, b) =>
          ({ title: 0, description: 1, comment: 2 })[a.match] -
          { title: 0, description: 1, comment: 2 }[b.match],
      )
      .slice(0, body.limit);
  }
  return {
    validateProject,
    operations: {
      getTaskAccess,
      getWorkspaceAccess,
      updateTask,
      listTaskComments,
      addTaskComment,
      listProjects,
      createProject,
      updateProject,
      createWorkspace,
      listWorkspaceInvites,
      createWorkspaceInvite,
      revokeWorkspaceInvite,
      acceptWorkspaceInvite,
      updateMemberRole,
      search,
      parseQuickAdd,
    },
  };
}
