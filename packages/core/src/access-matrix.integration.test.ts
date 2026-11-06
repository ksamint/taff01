import { randomUUID } from "node:crypto";
import {
  agentPermissions,
  agentTokens,
  agentTokenWorkspaces,
  connectDatabase,
  grants,
  members,
  oauthClients,
  user,
  workspaces,
} from "@taff/db";
import { accessMatrixSchema, systemAccessMatrixSchema } from "@taff/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { createCore, type Principal, userPrincipal } from "./index";
import { exportPermissionRows } from "./permissions";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("isolated _test database required");
describe.skipIf(!url)("access matrix", () => {
  const connection = url ? connectDatabase(url) : null;
  const core = url
    ? createCore({
        databaseUrl: url,
        authUrl: "http://localhost:3000",
        authSecret: "matrix-test-secret-longer-than-32-characters",
        tokenPepper: "matrix-test-pepper-longer-than-16",
      })
    : null;
  const userIds: string[] = [],
    ownedWorkspaces: string[] = [],
    tokenIds: string[] = [];
  const twinName = `Matrix Twin ${randomUUID()}`;
  let owner: Principal,
    system: Principal,
    member: Principal,
    guest: Principal,
    outsider: Principal,
    agent: Principal;
  let org: string,
    secondOrg: string,
    ownerId: string,
    systemId: string,
    agentId: string,
    tokenId: string,
    clientId: string;
  beforeAll(async () => {
    await migrateDatabase(url!);
    async function signup(name: string) {
      const r = await core!.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
      userIds.push(r.user.id);
      ownedWorkspaces.push(
        ...(await core!.getMe(r.user.id)).workspaces.map((w) => w.id),
      );
      return r.user.id;
    }
    ownerId = await signup("Matrix owner");
    systemId = await signup("Matrix system");
    const memberId = await signup("Matrix member"),
      guestId = await signup("Matrix guest"),
      outsiderId = await signup("Matrix outsider");
    owner = userPrincipal(ownerId);
    system = userPrincipal(systemId);
    member = userPrincipal(memberId);
    guest = userPrincipal(guestId);
    outsider = userPrincipal(outsiderId);
    org = (
      await core!.createWorkspace(owner, { name: `Matrix org ${randomUUID()}` })
    ).id;
    ownedWorkspaces.push(org);
    secondOrg = (
      await core!.createWorkspace(owner, {
        name: `Matrix other ${randomUUID()}`,
      })
    ).id;
    ownedWorkspaces.push(secondOrg);
    agentId = (
      await core!.createWorkspaceAgent(owner, org, {
        name: twinName,
        kind: "agent",
      })
    ).id;
    const issued = await core!.createAgentToken(owner, {
      workspaceId: org,
      memberId: agentId,
      name: "Matrix manual",
      scopes: ["tasks:read", "tasks:write"],
    });
    tokenIds.push(issued.id);
    agent = (await core!.authenticateAgentToken(issued.token))!;
    await connection!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${ownerId},true)`);
      await tx.insert(members).values([
        {
          workspaceId: org,
          userId: memberId,
          name: "Matrix member",
          kind: "person",
          role: "member",
        },
        {
          workspaceId: org,
          userId: guestId,
          name: "Matrix guest",
          kind: "person",
          role: "guest",
        },
      ]);
      await tx
        .update(user)
        .set({ systemAdmin: true })
        .where(eq(user.id, systemId));
      await tx.insert(agentPermissions).values({
        workspaceId: org,
        agentId,
        capability: "repo.read",
        decision: "allow",
      });
      await tx.insert(grants).values({
        workspaceId: org,
        agentId,
        capability: "repo.pr",
        reason: "Matrix pending",
        status: "pending",
      });
      clientId = `matrix-${randomUUID()}`;
      await tx.insert(oauthClients).values({
        id: clientId,
        name: "Matrix app",
        redirectUris: ["https://example.test/callback"],
      });
      const [creator] = await tx
        .select()
        .from(members)
        .where(and(eq(members.workspaceId, org), eq(members.userId, ownerId)));
      const [oauth] = await tx
        .insert(agentTokens)
        .values({
          workspaceId: org,
          memberId: agentId,
          createdBy: creator.id,
          name: "Matrix OAuth",
          hash: randomUUID(),
          prefix: "test",
          scopes: ["tasks:read"],
          oauthClientId: clientId,
          expiresAt: new Date(Date.now() + 60000),
          refreshExpiresAt: new Date(Date.now() + 60000),
        })
        .returning();
      tokenIds.push(oauth.id);
    });
    const personal = (await core!.getMe(ownerId)).workspaces.find(
      (w) => w.id !== org && w.id !== secondOrg,
    )!.id;
    const twin = (
      await core!.createWorkspaceAgent(owner, personal, {
        name: twinName,
        kind: "agent",
      })
    ).id;
    const policy = await core!.createAgentToken(owner, {
      workspaceId: personal,
      memberId: twin,
      name: "Matrix policy",
      scopes: ["tasks:read"],
    });
    tokenId = policy.id;
    tokenIds.push(policy.id);
    await core!.setTokenOrganizationPolicy(system, policy.id, {
      version: policy.version,
      policy: "all_organizations",
    });
  });
  afterAll(async () => {
    if (connection && systemId)
      await connection.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id','system:test-cleanup',true)`,
        );
        if (tokenIds.length)
          await tx.delete(agentTokens).where(inArray(agentTokens.id, tokenIds));
        if (ownedWorkspaces.length) {
          await tx
            .delete(grants)
            .where(inArray(grants.workspaceId, ownedWorkspaces));
          await tx
            .delete(agentPermissions)
            .where(inArray(agentPermissions.workspaceId, ownedWorkspaces));
        }
        await tx
          .delete(members)
          .where(and(eq(members.kind, "agent"), eq(members.name, twinName)));
        await tx
          .update(user)
          .set({ systemAdmin: false })
          .where(inArray(user.id, userIds));
        await tx.delete(user).where(inArray(user.id, userIds));
        await tx
          .delete(workspaces)
          .where(inArray(workspaces.id, ownedWorkspaces));
        if (clientId)
          await tx.delete(oauthClients).where(eq(oauthClients.id, clientId));
      });
    await core?.close();
    await connection?.close();
  });
  it("shows every role, effective defaults, manual/policy grants and pending/OAuth grants without credential material", async () => {
    const matrix = accessMatrixSchema.parse(
      await core!.getAccessMatrix(owner, org),
    );
    expect(matrix.people.map((p) => p.role)).toEqual(
      expect.arrayContaining(["admin", "member", "guest"]),
    );
    expect(
      matrix.agents.find((a) => a.member.id === agentId)?.permissions,
    ).toContainEqual({ capability: "repo.read", decision: "allow" });
    expect(
      matrix.agents.find((a) => a.member.id === agentId)?.reviewPolicy,
    ).toBe("always_review");
    expect(matrix.tokens.flatMap((t) => t.grants.map((g) => g.origin))).toEqual(
      expect.arrayContaining(["manual", "policy"]),
    );
    expect(
      matrix.tokens.every((t) => t.grants.every((g) => g.workspaceId === org)),
    ).toBe(true);
    expect(matrix.pendingGrants).toContainEqual(
      expect.objectContaining({ capability: "repo.pr", status: "pending" }),
    );
    expect(matrix.oauthGrants).toContainEqual(
      expect.objectContaining({ clientName: "Matrix app" }),
    );
    expect(matrix.actions).toEqual(exportPermissionRows());
    for (const field of ['"hash"', "refreshHash", "refreshExpiresAt"])
      expect(JSON.stringify(matrix)).not.toContain(field);
  });
  it("system matrix includes organization grant states only and no personal organizations", async () => {
    const matrix = systemAccessMatrixSchema.parse(
      await core!.getSystemAccessMatrix(system),
    );
    expect(matrix.organizations.map((w) => w.id)).toEqual(
      expect.arrayContaining([org, secondOrg]),
    );
    expect(
      matrix.organizations.some(
        (w) =>
          ownedWorkspaces.includes(w.id) && ![org, secondOrg].includes(w.id),
      ),
    ).toBe(false);
    expect(matrix.tokens.find((t) => t.id === tokenId)?.grants).toContainEqual(
      expect.objectContaining({ workspaceId: org, origin: "policy" }),
    );
  });
  it("workspace reads deny members, guests, agents and outsiders, and current admin authority is required after demotion", async () => {
    for (const p of [member, guest, agent, outsider])
      await expect(core!.getAccessMatrix(p, org)).rejects.toMatchObject({
        status: 403,
      });
    const [person] = await connection!.db
      .select()
      .from(members)
      .where(and(eq(members.workspaceId, org), eq(members.userId, ownerId)));
    await core!.updateMemberRole(system, org, person.id, { role: "member" });
    await expect(core!.getAccessMatrix(owner, org)).rejects.toMatchObject({
      status: 403,
    });
  });
  it("cross-workspace token explanation uses the target member and loses active scopes after revoke", async () => {
    const explanation = await core!.explainIntegrationPermission(system, {
      workspaceId: org,
      tokenId,
    });
    expect(explanation.active).toBe(true);
    const [grant] = await connection!.db
      .select()
      .from(agentTokenWorkspaces)
      .where(
        and(
          eq(agentTokenWorkspaces.tokenId, tokenId),
          eq(agentTokenWorkspaces.workspaceId, org),
        ),
      );
    expect(explanation.member_id).toBe(grant.memberId);
    await core!.setAgentTokenWorkspace(system, tokenId, {
      workspaceId: org,
      memberId: grant.memberId,
      scopes: grant.scopes,
      revoked: true,
    });
    expect(
      await core!.explainIntegrationPermission(system, {
        workspaceId: org,
        tokenId,
      }),
    ).toMatchObject({ active: false, scopes: [] });
  });
  it("system reads reject every lower role and immediately reflect system demotion", async () => {
    for (const p of [owner, member, guest, agent, outsider])
      await expect(core!.getSystemAccessMatrix(p)).rejects.toMatchObject({
        status: 403,
      });
    await connection!.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${systemId},true)`,
      );
      await tx
        .update(user)
        .set({ systemAdmin: false })
        .where(eq(user.id, systemId));
    });
    await expect(core!.getSystemAccessMatrix(system)).rejects.toMatchObject({
      status: 403,
    });
  });
});
