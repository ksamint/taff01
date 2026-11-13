import {
  activity,
  type Database,
  members,
  type Transaction,
  user,
  workspaces,
} from "@taff/db";
import {
  changeEventSchema,
  type DefaultWorkspaceInput,
  defaultWorkspaceInputSchema,
  idSchema,
  workspaceAdministrationListSchema,
  workspaceLifecycleSchema,
} from "@taff/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import { type Actor, can } from "./permissions";

export function createWorkspaceLifecycle({
  db,
  mutation,
}: {
  db: Database;
  mutation<T>(
    p: Principal,
    run: (tx: Transaction) => Promise<T>,
    lifecycle?: "archive",
  ): Promise<T>;
}) {
  async function identity(
    tx: Database | Transaction,
    p: Principal,
  ): Promise<Actor> {
    if (p.kind !== "user") throw new CoreError("forbidden", 403);
    const [person] = await tx.select().from(user).where(eq(user.id, p.userId));
    if (!person) throw new CoreError("unauthorized", 401);
    return {
      id: person.id,
      userId: person.id,
      name: person.name,
      workspaceId: "",
      kind: "person",
      role: "member",
      systemAdmin: person.systemAdmin,
    };
  }
  async function setDefaultWorkspace(
    p: Principal,
    targetUserId: string,
    input: DefaultWorkspaceInput,
  ) {
    const body = defaultWorkspaceInputSchema.parse(input);
    return mutation(p, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('taff:system-administration',0))`,
      );
      const actor = await identity(tx, p);
      if (!can(actor, "workspace:default", { userId: targetUserId }))
        throw new CoreError("forbidden", 403);
      const [target] = await tx
        .select()
        .from(user)
        .where(eq(user.id, targetUserId))
        .for("update");
      if (!target) throw new CoreError("not_found", 404);
      if (body.workspaceId) {
        const [joined] = await tx
          .select({ owner: workspaces.personalOwnerId })
          .from(members)
          .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
          .where(
            and(
              eq(members.userId, targetUserId),
              eq(workspaces.id, body.workspaceId),
              isNull(workspaces.archivedAt),
            ),
          );
        if (
          !joined ||
          (target.systemAdmin && joined.owner && joined.owner !== targetUserId)
        )
          throw new CoreError("forbidden", 403);
      }
      await tx
        .update(user)
        .set({ defaultWorkspaceId: body.workspaceId, updatedAt: new Date() })
        .where(eq(user.id, targetUserId));
      // The generic users trigger attributes identity changes to their subject.
      // Preserve the actual administrator for this delegated preference change.
      const [change] = await tx
        .insert(activity)
        .values({
          actorId: actor.userId!,
          workspaceId: null,
          action: "users.update",
          resourceId: targetUserId,
          details: {
            operation: "default_workspace",
            previousWorkspaceId: target.defaultWorkspaceId,
            workspaceId: body.workspaceId,
          },
        })
        .returning({ id: activity.id });
      const event = changeEventSchema.parse({
        activityId: change.id,
        workspaceId: null,
        resourceId: targetUserId,
        action: "users.update",
        actorId: actor.userId!,
        userId: targetUserId,
        recipientOnly: true,
      });
      await tx.execute(
        sql`select pg_notify('taff_changes', ${JSON.stringify(event)})`,
      );
      return body;
    });
  }
  async function setWorkspaceArchived(
    p: Principal,
    id: string,
    archived: boolean,
  ) {
    idSchema.parse(id);
    return mutation(
      p,
      async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended('taff:system-administration',0))`,
        );
        const actor = await identity(tx, p);
        const [membership] = await tx
          .select()
          .from(members)
          .where(
            and(
              eq(members.workspaceId, id),
              eq(members.userId, actor.userId!),
              eq(members.kind, "person"),
            ),
          );
        if (
          !can(
            { ...actor, role: membership?.role ?? "member", workspaceId: id },
            "workspace:archive",
            { workspaceId: id },
          )
        )
          throw new CoreError("forbidden", 403);
        const [row] = await tx
          .select()
          .from(workspaces)
          .where(eq(workspaces.id, id))
          .for("update");
        if (!row) throw new CoreError("not_found", 404);
        if (row.personalOwnerId) throw new CoreError("conflict", 409);
        if (Boolean(row.archivedAt) !== archived) {
          await tx
            .update(workspaces)
            .set({
              archivedAt: archived ? new Date() : null,
              updatedAt: new Date(),
            })
            .where(eq(workspaces.id, id));
          if (archived)
            await tx
              .update(user)
              .set({ defaultWorkspaceId: null, updatedAt: new Date() })
              .where(eq(user.defaultWorkspaceId, id));
        }
        return workspaceLifecycleSchema.parse({ id, archived });
      },
      "archive",
    );
  }
  const archiveWorkspace = (p: Principal, id: string) =>
    setWorkspaceArchived(p, id, true);
  const restoreWorkspace = (p: Principal, id: string) =>
    setWorkspaceArchived(p, id, false);
  const listFields = {
    id: workspaces.id,
    name: workspaces.name,
    personalOwnerId: workspaces.personalOwnerId,
    archivedAt: workspaces.archivedAt,
  };
  const serialize = (
    rows: {
      id: string;
      name: string;
      personalOwnerId: string | null;
      archivedAt: Date | null;
    }[],
  ) =>
    workspaceAdministrationListSchema.parse(
      rows.map((row) => ({
        ...row,
        archivedAt: row.archivedAt?.toISOString() ?? null,
      })),
    );
  async function listArchivedWorkspaces(p: Principal) {
    // Resolve identity under the administration lock, then query current memberships.
    return mutation(p, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('taff:system-administration',0))`,
      );
      const actor = await identity(tx, p);
      const all = can(actor, "workspace:archive", { workspaceId: "" });
      const rows = all
        ? await tx
            .select(listFields)
            .from(workspaces)
            .where(isNull(workspaces.personalOwnerId))
            .orderBy(workspaces.createdAt, workspaces.id)
        : await tx
            .select(listFields)
            .from(workspaces)
            .innerJoin(members, eq(members.workspaceId, workspaces.id))
            .where(
              and(
                isNull(workspaces.personalOwnerId),
                eq(members.userId, actor.userId!),
                eq(members.kind, "person"),
                eq(members.role, "admin"),
              ),
            )
            .orderBy(workspaces.createdAt, workspaces.id);
      if (!all && !rows.length) throw new CoreError("forbidden", 403);
      return serialize(
        rows.filter(
          (row) =>
            row.archivedAt &&
            can(
              { ...actor, role: "admin", workspaceId: row.id },
              "workspace:archive",
              { workspaceId: row.id },
            ),
        ),
      );
    });
  }
  async function listWorkspaceAdministration(p: Principal) {
    const actor = await identity(db, p);
    if (!can(actor, "workspace:archive", { workspaceId: "" }))
      throw new CoreError("forbidden", 403);
    return serialize(
      await db
        .select(listFields)
        .from(workspaces)
        .orderBy(workspaces.createdAt, workspaces.id),
    );
  }
  return {
    setDefaultWorkspace,
    archiveWorkspace,
    restoreWorkspace,
    listArchivedWorkspaces,
    listWorkspaceAdministration,
  };
}
