import {
  agentTokens,
  agentTokenWorkspaces,
  type Database,
  members,
  type Transaction,
  user,
  workspaces,
} from "@taff/db";
import {
  idSchema,
  tokenOrganizationPolicyInputSchema,
  tokenOrganizationPolicySchema,
} from "@taff/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ensureNamedAgent } from "./default-agents";
import { CoreError, type Principal } from "./index";
import { type Actor, can } from "./permissions";

type Token = {
  id: string;
  organizationPolicy: "explicit" | "all_organizations";
  revokedAt: unknown;
  name: string;
};
type Workspace = {
  id: string;
  personalOwnerId: string | null;
  archivedAt: unknown;
};
type Grant = {
  id: string;
  workspaceId: string;
  origin: "manual" | "policy";
  revokedAt: unknown;
};
type Member = { id: string; workspaceId: string; name: string; kind: string };
/** Existing revoked rows are tombstones; policy changes never silently restore them. */
export function planPolicyEnrollment({
  token,
  workspaces,
  grants,
  members,
}: {
  token: Token;
  workspaces: Workspace[];
  grants: Grant[];
  members: Member[];
}) {
  const insertGrants: { workspaceId: string; memberId: string | null }[] = [];
  const createMembers: { workspaceId: string; name: string }[] = [];
  const revokeGrantIds: string[] = [];
  if (token.revokedAt) return { insertGrants, createMembers, revokeGrantIds };
  if (token.organizationPolicy === "explicit") {
    revokeGrantIds.push(
      ...grants
        .filter((g) => g.origin === "policy" && !g.revokedAt)
        .map((g) => g.id)
        .sort(),
    );
  } else {
    for (const workspace of [...workspaces].sort((a, b) =>
      a.id.localeCompare(b.id),
    )) {
      if (
        workspace.personalOwnerId ||
        workspace.archivedAt ||
        grants.some((g) => g.workspaceId === workspace.id)
      )
        continue;
      const member = members
        .filter(
          (m) =>
            m.workspaceId === workspace.id &&
            m.kind === "agent" &&
            m.name === token.name,
        )
        .sort((a, b) => a.id.localeCompare(b.id))[0];
      if (!member)
        createMembers.push({ workspaceId: workspace.id, name: token.name });
      insertGrants.push({
        workspaceId: workspace.id,
        memberId: member?.id ?? null,
      });
    }
  }
  return { insertGrants, createMembers, revokeGrantIds };
}

// Shared with workspace creation: serialize policy writes and enrollment, then take row locks.
export async function lockTokenPolicy(tx: Transaction) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('taff:system-administration',0))`,
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('taff:token-policy',0))`,
  );
}
/** Caller holds the policy namespace lock; grant provenance and tombstones stay untouched. */
export async function reconcilePolicyGrantScopes(
  tx: Transaction,
  tokenId: string,
  scopes: string[],
) {
  await tx
    .update(agentTokenWorkspaces)
    .set({ scopes, updatedAt: new Date() })
    .where(
      and(
        eq(agentTokenWorkspaces.tokenId, tokenId),
        eq(agentTokenWorkspaces.origin, "policy"),
        isNull(agentTokenWorkspaces.revokedAt),
        sql`${agentTokenWorkspaces.scopes} IS DISTINCT FROM ARRAY[${sql.join(
          scopes.map((scope) => sql`${scope}`),
          sql`, `,
        )}]::text[]`,
      ),
    );
}
async function enroll(
  tx: Transaction,
  token: typeof agentTokens.$inferSelect,
  workspaceId?: string,
  grantedByUserId?: string,
) {
  const [source] = await tx
    .select()
    .from(members)
    .where(eq(members.id, token.memberId));
  const organizations = await tx
    .select()
    .from(workspaces)
    .where(workspaceId ? eq(workspaces.id, workspaceId) : undefined);
  const existing = await tx
    .select()
    .from(agentTokenWorkspaces)
    .where(eq(agentTokenWorkspaces.tokenId, token.id));
  const roster = await tx.select().from(members);
  const plan = planPolicyEnrollment({
    token: { ...token, name: source.name },
    workspaces: organizations,
    grants: existing,
    members: roster,
  });
  async function grantor(workspaceId: string) {
    const [identity] = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.workspaceId, workspaceId),
          grantedByUserId
            ? eq(members.userId, grantedByUserId)
            : sql`${members.userId} = current_setting('taff.actor_id', true)`,
        ),
      );
    if (!identity) throw new CoreError("forbidden", 403);
    return identity.id;
  }
  for (const target of plan.insertGrants) {
    const member = target.memberId
      ? { id: target.memberId }
      : await ensureNamedAgent(tx, target.workspaceId, source.name);
    await tx
      .insert(agentTokenWorkspaces)
      .values({
        tokenId: token.id,
        workspaceId: target.workspaceId,
        memberId: member.id,
        grantedBy: await grantor(target.workspaceId),
        scopes: token.scopes,
        origin: "policy",
      })
      .onConflictDoNothing();
  }
  for (const id of plan.revokeGrantIds)
    await tx
      .update(agentTokenWorkspaces)
      .set({
        revokedAt: new Date(),
        revokedBy: await grantor(
          existing.find((g) => g.id === id)!.workspaceId,
        ),
        updatedAt: new Date(),
      })
      .where(eq(agentTokenWorkspaces.id, id));
}
export async function enrollPolicyTokens(tx: Transaction, workspaceId: string) {
  await lockTokenPolicy(tx);
  const tokens = await tx
    .select()
    .from(agentTokens)
    .where(
      and(
        eq(agentTokens.organizationPolicy, "all_organizations"),
        isNull(agentTokens.revokedAt),
        isNull(agentTokens.oauthClientId),
      ),
    )
    .orderBy(agentTokens.id);
  for (const token of tokens) await enroll(tx, token, workspaceId);
}
export function createTokenPolicyOperations({
  db,
  mutation,
}: {
  db: Database;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
}) {
  async function actor(
    query: Database | Transaction,
    p: Principal,
    workspaceId: string,
    action: "token:policy" | "token:grant" | "token:grant_revoke",
  ) {
    if (p.kind !== "user") throw new CoreError("forbidden", 403);
    const [person] = await query
      .select()
      .from(user)
      .where(eq(user.id, p.userId))
      .for("share");
    if (!person) throw new CoreError("unauthorized", 401);
    const identities = await query
      .select()
      .from(members)
      .where(eq(members.userId, p.userId))
      .orderBy(members.id)
      .for("share");
    const identity =
      identities.find((m) => m.workspaceId === workspaceId) ?? identities[0];
    const acting: Actor | null = identity
      ? { ...identity, systemAdmin: person.systemAdmin }
      : null;
    if (!can(acting, action, { workspaceId }))
      throw new CoreError("forbidden", 403);
    return acting!;
  }
  async function setTokenOrganizationPolicy(
    p: Principal,
    tokenId: string,
    input: unknown,
  ) {
    idSchema.parse(tokenId);
    const body = tokenOrganizationPolicyInputSchema.parse(input);
    return mutation(p, async (tx) => {
      await lockTokenPolicy(tx);
      const acting = await actor(tx, p, "", "token:policy");
      const [token] = await tx
        .select()
        .from(agentTokens)
        .where(eq(agentTokens.id, tokenId))
        .for("update");
      if (!token) throw new CoreError("not_found", 404);
      if (token.revokedAt || token.oauthClientId)
        throw new CoreError("forbidden", 403);
      if (token.version !== body.version) throw new CoreError("conflict", 409);
      const [updated] = await tx
        .update(agentTokens)
        .set({
          organizationPolicy: body.policy,
          version: token.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(agentTokens.id, tokenId))
        .returning();
      if (updated.organizationPolicy === "all_organizations")
        await reconcilePolicyGrantScopes(tx, updated.id, updated.scopes);
      await enroll(tx, updated, undefined, acting.userId!);
      // Return the public token shape; credentials and refresh hashes never leave core.
      return {
        id: updated.id,
        workspaceId: updated.workspaceId,
        memberId: updated.memberId,
        createdBy: updated.createdBy,
        name: updated.name,
        prefix: updated.prefix,
        oauthClientId: updated.oauthClientId,
        scopes: updated.scopes,
        organizationPolicy: updated.organizationPolicy,
        version: updated.version,
        createdAt: updated.createdAt.toISOString(),
        revokedAt: null,
        lastUsedAt: null,
      };
    });
  }
  async function restoreTokenWorkspaceGrant(p: Principal, grantId: string) {
    idSchema.parse(grantId);
    return mutation(p, async (tx) => {
      await lockTokenPolicy(tx);
      const [grant] = await tx
        .select()
        .from(agentTokenWorkspaces)
        .where(eq(agentTokenWorkspaces.id, grantId))
        .for("update");
      if (!grant) throw new CoreError("not_found", 404);
      await actor(tx, p, grant.workspaceId, "token:grant");
      const [token] = await tx
        .select()
        .from(agentTokens)
        .where(eq(agentTokens.id, grant.tokenId))
        .for("share");
      const [workspace] = await tx
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, grant.workspaceId))
        .for("share");
      if (token.revokedAt || token.oauthClientId || workspace.archivedAt)
        throw new CoreError("forbidden", 403);
      return (
        await tx
          .update(agentTokenWorkspaces)
          .set({ revokedAt: null, revokedBy: null, updatedAt: new Date() })
          .where(eq(agentTokenWorkspaces.id, grantId))
          .returning()
      )[0];
    });
  }
  async function listSystemAgentTokens(p: Principal, policy?: string) {
    await actor(db, p, "", "token:policy");
    if (policy !== undefined) tokenOrganizationPolicySchema.parse(policy);
    const tokens = await db
      .select()
      .from(agentTokens)
      .where(
        policy
          ? eq(
              agentTokens.organizationPolicy,
              policy as "explicit" | "all_organizations",
            )
          : undefined,
      )
      .orderBy(agentTokens.id);
    const grants = await db.select().from(agentTokenWorkspaces);
    return tokens.map((t) => ({
      id: t.id,
      workspaceId: t.workspaceId,
      memberId: t.memberId,
      createdBy: t.createdBy,
      name: t.name,
      prefix: t.prefix,
      oauthClientId: t.oauthClientId,
      scopes: t.scopes,
      organizationPolicy: t.organizationPolicy,
      version: t.version,
      createdAt: t.createdAt.toISOString(),
      revokedAt: t.revokedAt?.toISOString() ?? null,
      lastUsedAt: null,
      grantCount: grants.filter((g) => g.tokenId === t.id && !g.revokedAt)
        .length,
    }));
  }
  return {
    setTokenOrganizationPolicy,
    restoreTokenWorkspaceGrant,
    listSystemAgentTokens,
    requireTokenGrantActor: actor,
  };
}
