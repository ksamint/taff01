import {
  agentTokens,
  agentTokenWorkspaces,
  type Database,
  grants,
  members,
  oauthClients,
  type Transaction,
  user,
  workspaces,
} from "@taff/db";
import {
  type AgentProfile,
  type AgentToken,
  accessMatrixSchema,
  idSchema,
  type Member,
  systemAccessMatrixSchema,
} from "@taff/schemas";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import {
  type Action,
  type Actor,
  can,
  exportPermissionRows,
  type Resource,
} from "./permissions";

export function createAccessMatrixOperations({
  db,
  requireMember,
  getAgentProfile,
  toAgentToken,
}: {
  db: Database;
  requireMember(
    query: Database | Transaction,
    p: Principal,
    workspaceId: string,
    action: Action,
    resource?: Resource,
  ): Promise<Actor>;
  getAgentProfile(p: Principal, id: string): Promise<AgentProfile>;
  toAgentToken(
    row: typeof agentTokens.$inferSelect,
    lastUsedAt: Date | null,
  ): AgentToken;
}) {
  const toGrant = (g: typeof agentTokenWorkspaces.$inferSelect) => ({
    ...g,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
    revokedAt: g.revokedAt?.toISOString() ?? null,
  });
  async function getAccessMatrix(p: Principal, workspaceId: string) {
    idSchema.parse(workspaceId);
    await requireMember(db, p, workspaceId, "workspace:manage");
    const [roster, workspaceGrants, homeTokens, pending, clients] =
      await Promise.all([
        db
          .select()
          .from(members)
          .where(eq(members.workspaceId, workspaceId))
          .orderBy(members.kind, members.name, members.id),
        db
          .select()
          .from(agentTokenWorkspaces)
          .where(eq(agentTokenWorkspaces.workspaceId, workspaceId))
          .orderBy(agentTokenWorkspaces.id),
        db
          .select()
          .from(agentTokens)
          .where(eq(agentTokens.workspaceId, workspaceId)),
        db
          .select()
          .from(grants)
          .where(
            and(
              eq(grants.workspaceId, workspaceId),
              eq(grants.status, "pending"),
            ),
          )
          .orderBy(grants.id),
        db.select().from(oauthClients),
      ]);
    const tokenIds = workspaceGrants.map((g) => g.tokenId);
    const tokens = await db
      .select()
      .from(agentTokens)
      .where(
        or(
          eq(agentTokens.workspaceId, workspaceId),
          tokenIds.length ? inArray(agentTokens.id, tokenIds) : undefined,
        ),
      )
      .orderBy(agentTokens.id);
    const profiles = await Promise.all(
      roster
        .filter((m) => m.kind === "agent")
        .map((m) => getAgentProfile(p, m.id)),
    );
    return accessMatrixSchema.parse({
      workspaceId,
      people: roster.filter((m) => m.kind === "person"),
      agents: profiles,
      tokens: tokens
        .filter((t) => !t.oauthClientId)
        .map((t) => ({
          ...toAgentToken(t, null),
          grants: workspaceGrants
            .filter((g) => g.tokenId === t.id)
            .map(toGrant),
        })),
      oauthGrants: homeTokens
        .filter((t) => t.oauthClientId)
        .map((t) => ({
          ...toAgentToken(t, null),
          scopes: t.refreshScopes ?? t.scopes,
          clientName:
            clients.find((c) => c.id === t.oauthClientId)?.name ??
            t.oauthClientId!,
        })),
      pendingGrants: pending.map((g) => ({
        ...g,
        expiresAt: g.expiresAt?.toISOString() ?? null,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      })),
      actions: exportPermissionRows(),
    });
  }
  async function getSystemAccessMatrix(p: Principal) {
    if (p.kind !== "user") throw new CoreError("forbidden", 403);
    const [person] = await db.select().from(user).where(eq(user.id, p.userId));
    const [member] = await db
      .select()
      .from(members)
      .where(eq(members.userId, p.userId))
      .limit(1);
    if (
      !can(
        member ? { ...member, systemAdmin: person?.systemAdmin } : null,
        "token:policy",
        { workspaceId: "" },
      )
    )
      throw new CoreError("forbidden", 403);
    const [organizations, tokens, allGrants] = await Promise.all([
      db
        .select()
        .from(workspaces)
        .where(isNull(workspaces.personalOwnerId))
        .orderBy(workspaces.name, workspaces.id),
      db
        .select()
        .from(agentTokens)
        .where(isNull(agentTokens.oauthClientId))
        .orderBy(agentTokens.id),
      db.select().from(agentTokenWorkspaces).orderBy(agentTokenWorkspaces.id),
    ]);
    const ids = new Set(organizations.map((w) => w.id));
    return systemAccessMatrixSchema.parse({
      organizations: organizations.map((w) => ({
        id: w.id,
        name: w.name,
        archivedAt: w.archivedAt?.toISOString() ?? null,
      })),
      tokens: tokens.map((t) => ({
        ...toAgentToken(t, null),
        grants: allGrants
          .filter((g) => g.tokenId === t.id && ids.has(g.workspaceId))
          .map(toGrant),
      })),
    });
  }
  return { getAccessMatrix, getSystemAccessMatrix };
}
