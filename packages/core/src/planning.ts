import { randomBytes } from "node:crypto";
import {
  companies,
  type Database,
  members,
  projectContacts,
  projectPayments,
  projects,
  reviewComments,
  type Transaction,
  taskComments,
  taskContacts,
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
  mcpProjectsCreateArgs,
  mcpProjectsEditArgs,
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
import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  ne,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { zoneOf } from "./actor-timezone";
import { ensureDefaultAgent } from "./default-agents";
import { deliverEmail, type EmailStatus, type EmailTransport } from "./email";
import { emailMessage } from "./email-messages";
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
export function decimalCents(amount: string) {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function collectionDelta(amount: string, current: string) {
  const delta = decimalCents(amount) - decimalCents(current);
  if (delta < 0n) throw new CoreError("invalid_input", 400);
  return delta;
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
/** Finance stays null unless the reader may see it (finance:read, ADR 0021). */
export function dtoProject(
  row: typeof projects.$inferSelect & { receivedAmount?: string },
  finance = false,
): Project {
  return {
    ...row,
    dueAt: row.dueAt?.toISOString() ?? null,
    deliveryProgress: row.deliveryProgress,
    receivedAmount: finance ? (row.receivedAmount ?? null) : null,
    contractAmount: finance ? row.contractAmount : null,
    currency: finance ? row.currency : null,
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
  approvedProjects?: boolean;
  db: Database;
  tokenPepper: string;
  authUrl: string;
  email?: EmailTransport;
  onEmailStatus?: (status: EmailStatus) => void;
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
  authUrl,
  email: emailTransport,
  onEmailStatus,
  mutation,
  requireMember,
  lockTask,
  validateAssignees,
  currentRunId,
  approvedProjects = false,
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
  /**
   * Task contacts follow their task's project (ADR 0015, plan §4.2).
   * task_contacts_task_fk cascades tasks.project_id onto the links, and
   * task_contacts_stakeholder_fk then needs every contact to be a stakeholder
   * of the new project, so add those first. A task without a project holds no
   * contacts: its links (and their roles, by cascade) are removed instead.
   * Runs before tasks.project_id changes.
   */
  async function moveTaskContacts(
    tx: Transaction,
    task: typeof tasks.$inferSelect,
    projectId: string | null,
  ) {
    const where = and(
      eq(taskContacts.workspaceId, task.workspaceId),
      eq(taskContacts.taskId, task.id),
    );
    if (!projectId) {
      await tx.delete(taskContacts).where(where);
      return;
    }
    const linked = await tx
      .select({ contactId: taskContacts.contactId })
      .from(taskContacts)
      .where(where);
    if (linked.length)
      await tx
        .insert(projectContacts)
        .values(
          linked.map(({ contactId }) => ({
            workspaceId: task.workspaceId,
            projectId,
            contactId,
          })),
        )
        .onConflictDoNothing();
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
      // Plans follow task:schedule per task; this says whether any edit is possible.
      canEditPlan: actor.kind === "person" && actor.role !== "guest",
      canReadFinance: can(actor, "finance:read", { workspaceId: w }),
      canReadCrm: can(actor, "contact:read", { workspaceId: w }),
      canManageCrm: can(actor, "contact:manage", { workspaceId: w }),
      canArchiveCrm: can(actor, "crm:archive", { workspaceId: w }),
    };
  }
  async function readTask(p: Principal, id: string) {
    parse(idSchema, id);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task || task.archivedAt) throw new CoreError("not_found", 404);
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
          .where(
            and(
              isNull(tasks.archivedAt),
              eq(tasks.parentId, id),
              sql`${tasks.status}<>'done'`,
            ),
          )
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
      if (body.projectId !== undefined && body.projectId !== task.projectId) {
        await validateProject(tx, task.workspaceId, body.projectId);
        await moveTaskContacts(tx, task, body.projectId);
      }
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
    const actor = await requireMember(db, p, w, "workspace:read");
    const finance = can(actor, "finance:read", { workspaceId: w });
    return (
      await db
        .select({
          ...getTableColumns(projects),
          // Drizzle unqualifies interpolated columns in this projection; keep the outer references explicit.
          receivedAmount: sql<string>`(select coalesce(sum(pp.amount),0)::text from project_payments pp where pp.workspace_id = "projects"."workspace_id" and pp.project_id = "projects"."id")`,
        })
        .from(projects)
        .where(eq(projects.workspaceId, w))
        .orderBy(projects.createdAt, projects.id)
    ).map((row) => dtoProject(row, finance));
  }
  async function createProject(
    p: Principal,
    w: string,
    input: ProjectInput,
  ): Promise<Project> {
    parse(idSchema, w);
    const body = parse(projectInputSchema, input);
    if (p.kind === "agent" && !approvedProjects)
      throw new CoreError("forbidden", 403);
    const { dueAt, receivedAmount, ...fields } = body;
    if (
      (body.contractAmount != null || receivedAmount !== undefined) &&
      !body.currency
    )
      invalid();
    return mutation(p, async (tx) => {
      const actor = await requireMember(tx, p, w, "project:manage", {
        workspaceId: w,
        approvedProjectOperation: approvedProjects,
      });
      if (body.clientCompanyId)
        await requireCompany(tx, w, body.clientCompanyId);
      if (body.leadId) await requireLead(tx, w, body.leadId);
      const [row] = await tx
        .insert(projects)
        .values({
          ...fields,
          dueAt: dueAt ? new Date(dueAt) : null,
          workspaceId: w,
        })
        .returning();
      if (receivedAmount !== undefined)
        await collectTo(tx, p, actor, row, receivedAmount);
      return dtoProject(
        { ...row, receivedAmount: receivedAmount ?? "0.00" },
        true,
      );
    });
  }
  async function updateProject(
    p: Principal,
    id: string,
    input: ProjectUpdate,
  ): Promise<Project> {
    parse(idSchema, id);
    const body = parse(projectUpdateSchema, input);
    if (p.kind === "agent" && !approvedProjects)
      throw new CoreError("forbidden", 403);
    const { dueAt, receivedAmount, ...fields } = body;
    return mutation(p, async (tx) => {
      const [row] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .for("update");
      if (!row) throw new CoreError("not_found", 404);
      const stageOnly = Object.keys(body).every(
        (key) => key === "stage" || key === "version",
      );
      const actor = await requireMember(
        tx,
        p,
        row.workspaceId,
        stageOnly && p.kind !== "agent" ? "project:stage" : "project:manage",
        {
          workspaceId: row.workspaceId,
          leadId: row.leadId,
          approvedProjectOperation: approvedProjects,
        },
      );
      if (row.version !== body.version) conflict();
      if (
        p.kind !== "agent" &&
        (body.receivedAmount !== undefined ||
          body.contractAmount !== undefined ||
          body.currency !== undefined ||
          body.clientCompanyId !== undefined)
      )
        await requireMember(tx, p, row.workspaceId, "finance:manage");
      const currency =
        body.currency === undefined ? row.currency : body.currency;
      const amount =
        body.contractAmount === undefined
          ? row.contractAmount
          : body.contractAmount;
      if (
        (amount !== null || receivedAmount !== undefined) &&
        currency === null
      )
        invalid();
      const received = await receivedTotal(tx, id, row.workspaceId);
      if (currency !== row.currency && decimalCents(received) > 0n) invalid();
      if (body.leadId && body.leadId !== row.leadId)
        await requireLead(tx, row.workspaceId, body.leadId);
      if (body.clientCompanyId)
        await requireCompany(tx, row.workspaceId, body.clientCompanyId);
      if (receivedAmount !== undefined)
        await collectTo(tx, p, actor, { ...row, currency }, receivedAmount);
      const [updated] = await tx
        .update(projects)
        .set({
          ...fields,
          ...(dueAt !== undefined
            ? { dueAt: dueAt ? new Date(dueAt) : null }
            : {}),
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return dtoProject(
        { ...updated, receivedAmount: receivedAmount ?? received },
        true,
      );
    });
  }
  async function receivedTotal(
    tx: Database | Transaction,
    id: string,
    workspaceId: string,
  ) {
    const [total] = await tx
      .select({
        value: sql<string>`coalesce(sum(${projectPayments.amount}),0)::text`,
      })
      .from(projectPayments)
      .where(
        and(
          eq(projectPayments.projectId, id),
          eq(projectPayments.workspaceId, workspaceId),
        ),
      );
    return total.value;
  }
  async function collectTo(
    tx: Transaction,
    p: Principal,
    actor: Actor,
    row: typeof projects.$inferSelect,
    amount: string,
  ) {
    const delta = collectionDelta(
      amount,
      await receivedTotal(tx, row.id, row.workspaceId),
    );
    if (!row.currency) invalid();
    if (delta === 0n) return;
    await tx.insert(projectPayments).values({
      workspaceId: row.workspaceId,
      projectId: row.id,
      amount: `${delta / 100n}.${String(delta % 100n).padStart(2, "0")}`,
      paidOn: localDate(new Date(), await zoneOf(tx, p, actor)),
      createdBy: actor.id,
    });
  }
  async function requireCompany(tx: Transaction, w: string, id: string) {
    const [company] = await tx
      .select({ archivedAt: companies.archivedAt })
      .from(companies)
      .where(and(eq(companies.id, id), eq(companies.workspaceId, w)));
    if (!company || company.archivedAt) invalid();
  }
  async function prepareProjectOperation(
    p: Principal,
    tool: "projects.create" | "projects.edit",
    input: unknown,
  ) {
    if (p.kind !== "agent") throw new CoreError("forbidden", 403);
    const args =
      tool === "projects.create"
        ? parse(mcpProjectsCreateArgs, input)
        : parse(mcpProjectsEditArgs, input);
    await requireMember(db, p, p.workspaceId, "capability:use", {
      workspaceId: p.workspaceId,
      capability: "projects.manage",
    });
    if ("projectId" in args) {
      const [row] = await db
        .select()
        .from(projects)
        .where(eq(projects.id, args.projectId));
      if (!row || row.workspaceId !== p.workspaceId)
        throw new CoreError("forbidden", 403);
      if (row.version !== args.version) conflict();
    }
    return {
      requires_confirmation: true,
      tool,
      arguments: args,
      expected_version: "version" in args ? args.version : null,
    };
  }
  /** The person in charge is a person of the project's workspace. */
  async function requireLead(tx: Transaction, w: string, leadId: string) {
    const [lead] = await tx
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.id, leadId),
          eq(members.workspaceId, w),
          eq(members.kind, "person"),
          ne(members.role, "guest"),
        ),
      );
    if (!lead) invalid();
  }
  async function lockWorkspace(tx: Transaction, w: string) {
    parse(idSchema, w);
    const [row] = await tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, w))
      .for("update");
    if (!row || row.archivedAt) throw new CoreError("not_found", 404);
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
      await ensureDefaultAgent(tx, workspace.id);
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
        .orderBy(desc(workspaceInvites.createdAt), desc(workspaceInvites.id))
    ).map(dtoInvite);
  }
  async function createWorkspaceInvite(
    p: Principal,
    w: string,
    input: WorkspaceInviteInput,
  ): Promise<IssuedWorkspaceInvite> {
    const body = parse(workspaceInviteInputSchema, input);
    const { issued, locale } = await mutation(p, async (tx) => {
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
      const [recipient] = await tx
        .select({ locale: user.locale })
        .from(user)
        .where(sql`lower(${user.email})=${email}`);
      const [inviter] = await tx
        .select({ locale: user.locale })
        .from(user)
        .where(eq(user.id, actor.userId!));
      return {
        issued: { ...dtoInvite(row), token },
        locale: recipient?.locale ?? inviter?.locale ?? "en",
      };
    });
    const emailDelivery = await deliverEmail(
      emailTransport,
      "invitation",
      {
        to: issued.email,
        ...emailMessage(
          "invitation",
          locale,
          `${new URL(authUrl).origin}/#invite=${encodeURIComponent(issued.token)}`,
        ),
      },
      onEmailStatus,
    );
    return { ...issued, emailDelivery };
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
        .where(eq(user.id, p.userId))
        .for("share");
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
      if (!person.emailVerified)
        throw new CoreError("email_verification_required", 403);
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
    return parseQuickAddText(body.text, {
      members: roster,
      projects: projectRows,
      ownerId: actor.kind === "person" ? actor.id : null,
      tz: await zoneOf(db, p, actor),
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
            .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
            .innerJoin(user, eq(user.id, members.userId))
            .where(
              and(
                eq(members.userId, p.userId),
                isNull(workspaces.archivedAt),
                or(
                  eq(user.systemAdmin, false),
                  isNull(workspaces.personalOwnerId),
                  eq(workspaces.personalOwnerId, p.userId),
                ),
              ),
            )
        : [];
    const ids = memberships.length
      ? memberships.map((m) => m.workspaceId)
      : [w];
    const filter = body.filters ?? {};
    const conditions: SQL[] = [
      inArray(tasks.workspaceId, ids),
      isNull(tasks.archivedAt),
    ];
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
      const tz = await zoneOf(
        db,
        p,
        await requireMember(db, p, w, "workspace:read"),
      );
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
      prepareProjectOperation,
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
