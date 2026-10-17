import {
  type Database,
  members,
  type Transaction,
  user,
  workspaces,
} from "@taff/db";
import {
  type DefaultWorkspaceInput,
  defaultWorkspaceInputSchema,
  idSchema,
} from "@taff/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import { type Actor, can } from "./permissions";

export function createWorkspaceLifecycle({
  db,
  mutation,
}: {
  db: Database;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
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
        if (!joined || (joined.owner && joined.owner !== targetUserId))
          throw new CoreError("forbidden", 403);
      }
      await tx
        .update(user)
        .set({ defaultWorkspaceId: body.workspaceId, updatedAt: new Date() })
        .where(eq(user.id, targetUserId));
      return body;
    });
  }
  async function archiveWorkspace(p: Principal, id: string) {
    idSchema.parse(id);
    return mutation(p, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('taff:system-administration',0))`,
      );
      const actor = await identity(tx, p);
      const [membership] = await tx
        .select()
        .from(members)
        .where(
          and(eq(members.workspaceId, id), eq(members.userId, actor.userId!)),
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
      if (!row.archivedAt) {
        await tx
          .update(workspaces)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(workspaces.id, id));
        await tx
          .update(user)
          .set({ defaultWorkspaceId: null, updatedAt: new Date() })
          .where(eq(user.defaultWorkspaceId, id));
      }
      return { id, archived: true };
    });
  }
  async function listWorkspaceAdministration(p: Principal) {
    const actor = await identity(db, p);
    if (!can(actor, "workspace:archive", { workspaceId: "" }))
      throw new CoreError("forbidden", 403);
    return db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        personalOwnerId: workspaces.personalOwnerId,
        archivedAt: workspaces.archivedAt,
      })
      .from(workspaces)
      .orderBy(workspaces.createdAt, workspaces.id);
  }
  return { setDefaultWorkspace, archiveWorkspace, listWorkspaceAdministration };
}
