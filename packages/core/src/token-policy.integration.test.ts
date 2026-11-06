import { randomUUID } from "node:crypto";
import {
  activity,
  agentTokens,
  agentTokenWorkspaces,
  connectDatabase,
  members,
  user,
  workspaces,
} from "@taff/db";
import type { ChangeEvent } from "@taff/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import { createCore, type Principal, userPrincipal } from "./index";

const url = process.env.TEST_DATABASE_URL;
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("isolated _test database required");
describe.skipIf(!url)("organization token access matrix", () => {
  const c = url ? connectDatabase(url) : null;
  const core = url
    ? createCore({
        databaseUrl: url,
        authUrl: "http://localhost:3000",
        authSecret: "policy-test-secret-at-least-32-characters",
        tokenPepper: "policy-test-pepper-long-enough",
      })
    : null;
  let system: Principal,
    owner: Principal,
    guest: Principal,
    agent: Principal,
    org: string,
    personal: string,
    sysId: string,
    ownerId: string,
    guestId: string,
    tokenId: string,
    version: number;
  const twinName = `Twin policy test ${randomUUID()}`;
  const ownedWorkspaces: string[] = [];
  const extraTokenIds: string[] = [];
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
      return r.user.id;
    }
    sysId = await signup("Policy system");
    ownerId = await signup("Policy owner");
    guestId = await signup("Policy guest");
    ownedWorkspaces.push(
      ...(
        await c!.db
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(inArray(workspaces.personalOwnerId, [sysId, ownerId, guestId]))
      ).map((w) => w.id),
    );
    system = userPrincipal(sysId);
    owner = userPrincipal(ownerId);
    guest = userPrincipal(guestId);
    await c!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${sysId},true)`);
      await tx
        .update(user)
        .set({ systemAdmin: true })
        .where(eq(user.id, sysId));
    });
    personal = (await core!.getMe(ownerId)).workspaces[0].id;
    org = (
      await core!.createWorkspace(owner, { name: `Policy org ${randomUUID()}` })
    ).id;
    ownedWorkspaces.push(org);
    const twin = await core!.createWorkspaceAgent(owner, personal, {
      name: twinName,
      kind: "agent",
    });
    const issued = await core!.createAgentToken(owner, {
      workspaceId: personal,
      memberId: twin.id,
      name: "Policy test",
      scopes: ["tasks:read"],
    });
    tokenId = issued.id;
    version = issued.version;
    agent = (await core!.authenticateAgentToken(issued.token))!;
    await c!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${ownerId},true)`);
      await tx.insert(members).values({
        workspaceId: org,
        userId: guestId,
        name: "Policy guest",
        kind: "person",
        role: "guest",
      });
    });
  });
  afterAll(async () => {
    if (c && sysId)
      await c.db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id','system:test-cleanup',true)`,
        );
        if (tokenId)
          await tx
            .delete(agentTokens)
            .where(inArray(agentTokens.id, [tokenId, ...extraTokenIds]));
        await tx
          .delete(members)
          .where(and(eq(members.kind, "agent"), eq(members.name, twinName)));
        const userIds = [sysId, ownerId, guestId].filter(Boolean);
        await tx
          .update(user)
          .set({ systemAdmin: false })
          .where(inArray(user.id, userIds));
        await tx.delete(user).where(inArray(user.id, userIds));
        if (ownedWorkspaces.length)
          await tx
            .delete(workspaces)
            .where(inArray(workspaces.id, ownedWorkspaces));
      });
    await core?.close();
    await c?.close();
  });
  it("only system admins set policy; enrolls active organizations, preserves manual home and excludes every personal workspace", async () => {
    for (const p of [owner, guest, agent])
      await expect(
        core!.setTokenOrganizationPolicy(p, tokenId, {
          version,
          policy: "all_organizations",
        }),
      ).rejects.toMatchObject({ status: 403 });
    const result = await core!.setTokenOrganizationPolicy(system, tokenId, {
      version,
      policy: "all_organizations",
    });
    version = result.version;
    const rows = await c!.db
      .select({
        grant: agentTokenWorkspaces,
        personal: workspaces.personalOwnerId,
        archived: workspaces.archivedAt,
      })
      .from(agentTokenWorkspaces)
      .innerJoin(
        workspaces,
        eq(workspaces.id, agentTokenWorkspaces.workspaceId),
      )
      .where(eq(agentTokenWorkspaces.tokenId, tokenId));
    expect(
      rows
        .filter((r) => r.grant.origin === "policy")
        .every((r) => !r.personal && !r.archived),
    ).toBe(true);
    expect(
      rows.find((r) => r.grant.workspaceId === personal)?.grant.origin,
    ).toBe("manual");
    expect((await core!.resolveAgentWorkspace(agent, org)).workspaceId).toBe(
      org,
    );
    await expect(
      core!.setTokenOrganizationPolicy(system, tokenId, {
        version: version - 1,
        policy: "explicit",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("new organizations enroll in their creation transaction and audit their creator", async () => {
    const next = await core!.createWorkspace(owner, {
      name: `Future policy org ${randomUUID()}`,
    });
    ownedWorkspaces.push(next.id);
    expect(
      (await core!.resolveAgentWorkspace(agent, next.id)).workspaceId,
    ).toBe(next.id);
    const [grant] = await c!.db
      .select()
      .from(agentTokenWorkspaces)
      .where(
        and(
          eq(agentTokenWorkspaces.tokenId, tokenId),
          eq(agentTokenWorkspaces.workspaceId, next.id),
        ),
      );
    const [change] = await c!.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.resourceId, grant.id),
          eq(activity.action, "agent_token_workspaces.insert"),
        ),
      );
    expect(change.actorId).toBe(ownerId);
  });

  it("home administrators propagate token scopes only to active policy grants, preserving provenance and demotion boundaries", async () => {
    async function organization(label: string, creator: Principal = owner) {
      const workspace = await core!.createWorkspace(creator, {
        name: `Scope ${label} ${randomUUID()}`,
      });
      ownedWorkspaces.push(workspace.id);
      return workspace.id;
    }
    const home = await organization("home"),
      manual = await organization("manual"),
      active = await organization("active", guest),
      revoked = await organization("revoked");
    const homeAgent = (await core!.listMembers(owner, home)).find(
      (m) => m.kind === "agent" && m.name === twinName,
    )!;
    const issued = await core!.createAgentToken(owner, {
      workspaceId: home,
      memberId: homeAgent.id,
      name: "Scope propagation",
      scopes: ["tasks:read"],
    });
    extraTokenIds.push(issued.id);
    const manualAgent = (await core!.listMembers(owner, manual)).find(
      (m) => m.kind === "agent" && m.name === twinName,
    )!;
    await core!.setAgentTokenWorkspace(owner, issued.id, {
      workspaceId: manual,
      memberId: manualAgent.id,
      scopes: ["tasks:read"],
    });
    const policy = await core!.setTokenOrganizationPolicy(system, issued.id, {
      version: issued.version,
      policy: "all_organizations",
    });
    const rows = () =>
      c!.db
        .select()
        .from(agentTokenWorkspaces)
        .where(eq(agentTokenWorkspaces.tokenId, issued.id));
    const revokedGrant = (await rows()).find((g) => g.workspaceId === revoked)!;
    await core!.setAgentTokenWorkspace(owner, issued.id, {
      workspaceId: revoked,
      memberId: revokedGrant.memberId,
      scopes: ["tasks:read"],
      revoked: true,
    });
    const before = await rows();
    const activeBefore = before.find((g) => g.workspaceId === active)!;
    await expect(core!.listMembers(owner, active)).rejects.toMatchObject({
      status: 403,
    });
    const scopes = ["tasks:read", "summaries:read"] as const;
    const notices: ChangeEvent[] = [];
    const unsubscribe = await core!.subscribeChanges((event) => {
      notices.push(event);
    });
    try {
      await core!.setAgentTokenWorkspace(owner, issued.id, {
        workspaceId: home,
        memberId: homeAgent.id,
        scopes: [...scopes],
      });
      await vi.waitFor(() =>
        expect(notices).toContainEqual(
          expect.objectContaining({
            resourceId: activeBefore.id,
            workspaceId: active,
            actorId: ownerId,
            action: "agent_token_workspaces.update",
          }),
        ),
      );
    } finally {
      await unsubscribe();
    }
    const after = await rows();
    for (const grant of after.filter(
      (g) => g.origin === "policy" && !g.revokedAt,
    )) {
      expect(grant.scopes).toEqual(scopes);
      expect(grant.grantedBy).toBe(
        before.find((g) => g.id === grant.id)!.grantedBy,
      );
      const [change] = await c!.db
        .select()
        .from(activity)
        .where(
          and(
            eq(activity.resourceId, grant.id),
            eq(activity.action, "agent_token_workspaces.update"),
            eq(activity.actorId, ownerId),
          ),
        );
      expect(change).toBeTruthy();
    }
    expect(after.find((g) => g.workspaceId === manual)).toEqual(
      before.find((g) => g.workspaceId === manual),
    );
    expect(after.find((g) => g.workspaceId === revoked)).toEqual(
      before.find((g) => g.workspaceId === revoked),
    );
    const reader = (await core!.authenticateAgentToken(issued.token))!;
    expect((await core!.resolveAgentWorkspace(reader, active)).scopes).toEqual(
      scopes,
    );
    expect((await core!.resolveAgentWorkspace(reader, manual)).scopes).toEqual([
      "tasks:read",
    ]);
    await expect(
      core!.resolveAgentWorkspace(reader, revoked),
    ).rejects.toMatchObject({ status: 403 });
    const [token] = await c!.db
      .select()
      .from(agentTokens)
      .where(eq(agentTokens.id, issued.id));
    expect(token.version).toBe(policy.version + 1);
    const homeOwner = (await core!.listMembers(system, home)).find(
      (m) => m.userId === ownerId,
    )!;
    await core!.updateMemberRole(system, home, homeOwner.id, {
      role: "member",
    });
    await expect(
      core!.setAgentTokenWorkspace(owner, issued.id, {
        workspaceId: home,
        memberId: homeAgent.id,
        scopes: ["tasks:read"],
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await rows()).toEqual(after);
    await c!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${sysId},true)`);
      await tx
        .update(agentTokenWorkspaces)
        .set({ scopes: ["tasks:read"] })
        .where(eq(agentTokenWorkspaces.id, activeBefore.id));
    });
    await core!.setTokenOrganizationPolicy(system, issued.id, {
      version: token.version,
      policy: "all_organizations",
    });
    const reconciled = (await rows()).find((g) => g.id === activeBefore.id)!;
    expect(reconciled.scopes).toEqual(scopes);
    expect(reconciled.grantedBy).toBe(activeBefore.grantedBy);
    expect((await rows()).find((g) => g.workspaceId === revoked)).toEqual(
      before.find((g) => g.workspaceId === revoked),
    );
    const future = await organization("future");
    expect((await core!.resolveAgentWorkspace(reader, future)).scopes).toEqual(
      scopes,
    );
  });
  it("target admin lists/revokes/restores, loses all management on demotion, and agents cannot manage grants", async () => {
    const rows = await core!.listAgentTokenWorkspaces(owner, tokenId, org);
    const grant = rows[0];
    expect(grant.origin).toBe("policy");
    const body = {
      workspaceId: org,
      memberId: grant.memberId,
      scopes: ["tasks:read"],
      revoked: true,
    };
    for (const p of [guest, agent]) {
      await expect(
        core!.listAgentTokenWorkspaces(p, tokenId, org),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        core!.setAgentTokenWorkspace(p, tokenId, body),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        core!.restoreTokenWorkspaceGrant(p, grant.id),
      ).rejects.toMatchObject({ status: 403 });
    }
    await core!.setAgentTokenWorkspace(owner, tokenId, body);
    await expect(core!.resolveAgentWorkspace(agent, org)).rejects.toMatchObject(
      { status: 403 },
    );
    const [revoked] = await c!.db
      .select()
      .from(agentTokenWorkspaces)
      .where(eq(agentTokenWorkspaces.id, grant.id));
    expect(revoked.revokedBy).toBeTruthy();
    await c!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${sysId},true)`);
      await tx
        .update(members)
        .set({ role: "admin" })
        .where(and(eq(members.userId, guestId), eq(members.workspaceId, org)));
    });
    await core!.restoreTokenWorkspaceGrant(guest, grant.id);
    const [restoredAudit] = await c!.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.resourceId, grant.id),
          eq(activity.actorId, guestId),
          eq(activity.action, "agent_token_workspaces.update"),
        ),
      );
    expect(restoredAudit).toBeTruthy();
    await c!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${sysId},true)`);
      await tx
        .update(members)
        .set({ role: "guest" })
        .where(and(eq(members.userId, guestId), eq(members.workspaceId, org)));
    });
    await expect(
      core!.restoreTokenWorkspaceGrant(guest, grant.id),
    ).rejects.toMatchObject({ status: 403 });
    await core!.archiveWorkspace(owner, org);
    await expect(core!.resolveAgentWorkspace(agent, org)).rejects.toMatchObject(
      { status: 403 },
    );
    await c!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${ownerId},true)`);
      await tx
        .update(workspaces)
        .set({ archivedAt: null })
        .where(eq(workspaces.id, org));
    });
    await core!.restoreTokenWorkspaceGrant(owner, grant.id);
    await core!.resolveAgentWorkspace(agent, org);
    await c!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${sysId},true)`);
      await tx
        .update(members)
        .set({ role: "member" })
        .where(and(eq(members.userId, ownerId), eq(members.workspaceId, org)));
    });
    await expect(
      core!.listAgentTokenWorkspaces(owner, tokenId, org),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      core!.setAgentTokenWorkspace(owner, tokenId, body),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      core!.restoreTokenWorkspaceGrant(owner, grant.id),
    ).rejects.toMatchObject({ status: 403 });
    await expect(core!.archiveWorkspace(owner, org)).rejects.toMatchObject({
      status: 403,
    });
    await core!.setAgentTokenWorkspace(system, tokenId, body);
  });
  it("policy toggles preserve tombstones and revoke policy grants only; archive gates restore and resolution", async () => {
    const rows = await core!.listAgentTokenWorkspaces(system, tokenId, org);
    const grant = rows[0];
    await core!.setTokenOrganizationPolicy(system, tokenId, {
      version,
      policy: "explicit",
    });
    version++;
    expect(
      (
        await c!.db
          .select()
          .from(agentTokenWorkspaces)
          .where(
            and(
              eq(agentTokenWorkspaces.tokenId, tokenId),
              eq(agentTokenWorkspaces.workspaceId, personal),
            ),
          )
      )[0].revokedAt,
    ).toBeNull();
    await core!.setTokenOrganizationPolicy(system, tokenId, {
      version,
      policy: "all_organizations",
    });
    version++;
    await expect(core!.resolveAgentWorkspace(agent, org)).rejects.toMatchObject(
      { status: 403 },
    );
    await core!.restoreTokenWorkspaceGrant(system, grant.id);
    await core!.archiveWorkspace(system, org);
    await expect(core!.resolveAgentWorkspace(agent, org)).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(
      core!.restoreTokenWorkspaceGrant(system, grant.id),
    ).rejects.toMatchObject({ status: 403 });
    await c!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${sysId},true)`);
      await tx
        .update(workspaces)
        .set({ archivedAt: null })
        .where(eq(workspaces.id, org));
    });
    await core!.resolveAgentWorkspace(agent, org);
    await core!.revokeAgentToken(owner, tokenId);
    await expect(
      core!.restoreTokenWorkspaceGrant(system, grant.id),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("system policy authority and token inventory disappear immediately on system demotion", async () => {
    expect(
      await core!.listSystemAgentTokens(system, "all_organizations"),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: tokenId })]),
    );
    await c!.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id',${sysId},true)`);
      await tx
        .update(user)
        .set({ systemAdmin: false })
        .where(eq(user.id, sysId));
    });
    await expect(core!.listSystemAgentTokens(system)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      core!.setTokenOrganizationPolicy(system, tokenId, {
        version,
        policy: "explicit",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
