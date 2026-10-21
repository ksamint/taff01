import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  activity,
  agentProfiles,
  agentTokens,
  connectDatabase,
  members,
} from "@taff/db";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../db/src/migrate";
import {
  type Core,
  createCore,
  OAuthError,
  type Principal,
  userPrincipal,
} from "./index";

const url = process.env.TEST_DATABASE_URL;
if (!url)
  console.warn("SKIP MCP OAuth PostgreSQL tests: TEST_DATABASE_URL required");
if (url && !new URL(url).pathname.endsWith("_test"))
  throw new Error("MCP OAuth tests require isolated _test database");

const AUTH_URL = "http://localhost:3000";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return {
    verifier,
    challenge: createHash("sha256").update(verifier).digest("base64url"),
  };
};

describe.skipIf(!url)("MCP OAuth 2.1 authorization server (ADR 0022)", () => {
  let core: Core;
  let connection: ReturnType<typeof connectDatabase>;
  let alice: Principal;
  let bob: Principal;
  let w: string;
  let agentId: string;
  let bobMember: string;
  let clientId: string;

  /** Consent as Alice, then the code from the redirect. */
  async function approve(
    challenge: string,
    extra: Partial<{ scopes: string[]; state: string }> = {},
  ) {
    const { redirectTo } = await core.oauth.decide(alice, {
      request: {
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: extra.state ?? "s1",
      },
      decision: "approve",
      workspaceId: w,
      memberId: agentId,
      scopes: (extra.scopes ?? ["tasks:read"]) as never,
    });
    const target = new URL(redirectTo);
    expect(target.origin + target.pathname).toBe(REDIRECT);
    expect(target.searchParams.get("iss")).toBe(AUTH_URL);
    return target.searchParams.get("code")!;
  }
  const exchange = (code: string, verifier: string) =>
    core.oauth.token({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
    });

  beforeAll(async () => {
    await migrateDatabase(url!);
    connection = connectDatabase(url!);
    core = createCore({
      databaseUrl: url!,
      authUrl: AUTH_URL,
      authSecret: "oauth-test-secret-longer-than-thirty-two-characters",
      tokenPepper: "oauth-test-pepper-sixteen",
    });
    const signup = (name: string) =>
      core.auth.api.signUpEmail({
        body: {
          name,
          email: `${randomUUID()}@test.local`,
          password: `test-${randomUUID()}`,
        },
      });
    const a = await signup("Olivia Owner");
    alice = userPrincipal(a.user.id);
    w = (await core.getMe(a.user.id)).workspaces[0].id;
    const b = await signup("Bob Member");
    bob = userPrincipal(b.user.id);
    await connection.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('taff.actor_id',${a.user.id},true)`,
      );
      const [agent] = await tx
        .insert(members)
        .values({ workspaceId: w, name: "Claude", kind: "agent" })
        .returning();
      agentId = agent.id;
      const [member] = await tx
        .insert(members)
        .values({
          workspaceId: w,
          userId: b.user.id,
          name: "Bob Member",
          kind: "person",
        })
        .returning();
      bobMember = member.id;
    });
    clientId = (
      await core.oauth.registerClient({
        client_name: "Claude",
        redirect_uris: [REDIRECT],
        grant_types: ["authorization_code", "refresh_token"],
        token_endpoint_auth_method: "none",
      })
    ).client_id;
  });
  afterAll(async () => {
    await connection?.close();
    await core?.close();
  });

  it("publishes protected-resource and authorization-server metadata", () => {
    const meta = core.oauthMetadata();
    expect(meta.protectedResource).toMatchObject({
      resource: `${AUTH_URL}/mcp`,
      authorization_servers: [AUTH_URL],
    });
    expect(meta.authorizationServer).toMatchObject({
      issuer: AUTH_URL,
      authorization_endpoint: `${AUTH_URL}/oauth/authorize`,
      token_endpoint: `${AUTH_URL}/api/oauth/token`,
      registration_endpoint: `${AUTH_URL}/api/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  it("registers public clients with safe redirect URIs only", async () => {
    for (const redirect of [
      "http://evil.example/cb",
      "javascript:alert(1)",
      "https://claude.ai/cb#frag",
    ])
      await expect(
        core.oauth.registerClient({ redirect_uris: [redirect] }),
      ).rejects.toBeTruthy();
    const loopback = await core.oauth.registerClient({
      redirect_uris: ["http://127.0.0.1:33418/callback"],
    });
    expect(loopback).toMatchObject({
      client_name: "MCP client",
      token_endpoint_auth_method: "none",
    });
    await expect(
      core.oauth.registerClient({
        redirect_uris: [REDIRECT],
        grant_types: ["client_credentials"],
      }),
    ).rejects.toBeInstanceOf(OAuthError);
  });

  it("offers consent only for organizations the person may issue tokens in", async () => {
    const request = {
      response_type: "code" as const,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: pkce().challenge,
      code_challenge_method: "S256" as const,
      scope: "tasks:read calendar:write unknown:scope",
    };
    const consent = await core.oauth.getConsent(alice, request);
    expect(consent.client).toEqual({
      id: clientId,
      name: "Claude",
      redirectHost: "claude.ai",
    });
    const mine = consent.workspaces.find((item) => item.id === w);
    expect(mine?.agents).toEqual([{ id: agentId, name: "Claude" }]);
    expect(consent.scopes).toEqual(["tasks:read", "calendar:write"]);
    // Bob is a member, not an admin, of Alice's organization.
    const bobs = await core.oauth.getConsent(bob, request);
    expect(bobs.workspaces).toEqual([]);
    // A redirect URI that was not registered is an error page, not a redirect.
    await expect(
      core.oauth.getConsent(alice, {
        ...request,
        redirect_uri: "https://evil.example/cb",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      core.oauth.getConsent(alice, { ...request, client_id: "mcp_unknown" }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      core.oauth.getConsent(alice, {
        ...request,
        resource: "https://other.example/mcp",
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("denies with access_denied and refuses non-admin approval", async () => {
    const request = {
      response_type: "code" as const,
      client_id: clientId,
      redirect_uri: REDIRECT,
      code_challenge: pkce().challenge,
      code_challenge_method: "S256" as const,
      state: "keep me",
    };
    const denied = new URL(
      (await core.oauth.decide(alice, { request, decision: "deny" }))
        .redirectTo,
    );
    expect(denied.searchParams.get("error")).toBe("access_denied");
    expect(denied.searchParams.get("state")).toBe("keep me");
    expect(denied.searchParams.has("code")).toBe(false);
    await expect(
      core.oauth.decide(bob, {
        request,
        decision: "approve",
        workspaceId: w,
        memberId: agentId,
        scopes: ["tasks:read"],
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    // The agent must be an agent: a person member is refused.
    await expect(
      core.oauth.decide(alice, {
        request,
        decision: "approve",
        workspaceId: w,
        memberId: bobMember,
        scopes: ["tasks:read"],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("exchanges a code once with PKCE and authenticates the agent", async () => {
    const { verifier, challenge } = pkce();
    const code = await approve(challenge, {
      scopes: ["tasks:read", "tasks:write"],
    });
    await expect(exchange(code, pkce().verifier)).rejects.toMatchObject({
      error: "invalid_grant",
    });
    const issued = await exchange(code, verifier);
    expect(issued).toMatchObject({
      token_type: "Bearer",
      expires_in: 3600,
      scope: "tasks:read tasks:write",
    });
    expect(issued.access_token.startsWith("taff_")).toBe(true);
    const principal = await core.authenticateAgentToken(issued.access_token);
    expect(principal).toMatchObject({
      kind: "agent",
      memberId: agentId,
      workspaceId: w,
      scopes: ["tasks:read", "tasks:write"],
    });
    const listed = await core.listAgentTokens(alice, w);
    expect(
      listed.find(
        (item) => item.id === (principal as { tokenId: string }).tokenId,
      ),
    ).toMatchObject({ name: "Claude", memberId: agentId });
    // Replaying a used code fails and ends the grant it produced.
    await expect(exchange(code, verifier)).rejects.toMatchObject({
      error: "invalid_grant",
    });
    expect(await core.authenticateAgentToken(issued.access_token)).toBeNull();
  });

  it("rotates refresh tokens and expires access tokens", async () => {
    const { verifier, challenge } = pkce();
    const first = await exchange(await approve(challenge), verifier);
    const refresh = (token: string) =>
      core.oauth.token({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: token,
      });
    const second = await refresh(first.refresh_token);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(await core.authenticateAgentToken(first.access_token)).toBeNull();
    const principal = await core.authenticateAgentToken(second.access_token);
    expect(principal).not.toBeNull();
    // The old refresh token worked exactly once.
    await expect(refresh(first.refresh_token)).rejects.toMatchObject({
      error: "invalid_grant",
    });
    await expect(
      core.oauth.token({
        grant_type: "refresh_token",
        client_id: "mcp_someone_else",
        refresh_token: second.refresh_token,
      }),
    ).rejects.toMatchObject({ error: "invalid_client" });
    // An expired access token is refused while refreshing still works.
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id','test',true)`);
      await tx
        .update(agentTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(agentTokens.id, (principal as { tokenId: string }).tokenId));
    });
    expect(await core.authenticateAgentToken(second.access_token)).toBeNull();
    const third = await refresh(second.refresh_token);
    expect(
      await core.authenticateAgentToken(third.access_token),
    ).not.toBeNull();
    // RFC 7009 revocation by refresh token ends the grant.
    await core.oauth.revoke({
      token: third.refresh_token,
      client_id: clientId,
    });
    expect(await core.authenticateAgentToken(third.access_token)).toBeNull();
    await expect(refresh(third.refresh_token)).rejects.toMatchObject({
      error: "invalid_grant",
    });
  });

  it("refuses a code whose approver is no longer an admin, and expired codes", async () => {
    const { verifier, challenge } = pkce();
    const code = await approve(challenge);
    const [aliceMember] = await connection.db
      .select()
      .from(members)
      .where(eq(members.userId, (alice as { userId: string }).userId));
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id','test',true)`);
      await tx
        .update(members)
        .set({ role: "member" })
        .where(eq(members.id, aliceMember.id));
    });
    try {
      await expect(exchange(code, verifier)).rejects.toMatchObject({
        error: "invalid_grant",
      });
    } finally {
      await connection.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('taff.actor_id','test',true)`);
        await tx
          .update(members)
          .set({ role: "admin" })
          .where(eq(members.id, aliceMember.id));
      });
    }
    const late = pkce();
    const stale = await approve(late.challenge);
    await connection.client`update oauth_codes set expires_at = now() - interval '1 minute' where used_at is null`;
    await expect(exchange(stale, late.verifier)).rejects.toMatchObject({
      error: "invalid_grant",
    });
  });
  async function supervise(supervisorId: string | null) {
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id','test',true)`);
      await tx
        .insert(agentProfiles)
        .values({ id: agentId, workspaceId: w, supervisorId })
        .onConflictDoUpdate({
          target: agentProfiles.id,
          set: { supervisorId },
        });
    });
  }
  async function role(memberId: string, role: "admin" | "member" | "guest") {
    await connection.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('taff.actor_id','test',true)`);
      await tx.update(members).set({ role }).where(eq(members.id, memberId));
    });
  }
  async function memberGrant(
    scopes: ("tasks:read" | "files:write")[] = ["tasks:read"],
  ) {
    const proof = pkce();
    const { redirectTo } = await core.oauth.decide(bob, {
      request: {
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: proof.challenge,
        code_challenge_method: "S256",
      },
      decision: "approve",
      workspaceId: w,
      memberId: agentId,
      scopes,
    });
    return exchange(
      new URL(redirectTo).searchParams.get("code")!,
      proof.verifier,
    );
  }
  it("a supervisor connects only their agent within the member ceiling, and owns only their grants", async () => {
    await supervise(bobMember);
    try {
      const consent = await core.oauth.getConsent(bob, {
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: pkce().challenge,
        code_challenge_method: "S256",
        scope: "tasks:read files:write",
      });
      expect(consent.workspaces.find((item) => item.id === w)).toMatchObject({
        agents: [{ id: agentId }],
        allowedScopes: [
          "tasks:read",
          "tasks:write",
          "calendar:write",
          "inbox:review",
        ],
      });
      await expect(memberGrant(["files:write"])).rejects.toMatchObject({
        code: "forbidden",
        status: 403,
      });
      const first = await memberGrant();
      const grant = await core.oauth.token({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: first.refresh_token,
      });
      expect(await core.authenticateAgentToken(first.access_token)).toBeNull();
      const actor = await core.authenticateAgentToken(grant.access_token);
      expect(actor).not.toBeNull();
      expect(await core.getContext(actor!, w)).toMatchObject({
        memberId: agentId,
      });
      const tokenId = (actor as { tokenId: string }).tokenId;
      const personal = await core.createAgentToken(alice, {
        workspaceId: w,
        memberId: agentId,
        name: "Personal",
        scopes: ["tasks:read"],
      });
      // A separate admin-approved grant, redeemed with its matching proof.
      const proof = pkce();
      const adminGrant = await exchange(
        await approve(proof.challenge),
        proof.verifier,
      );
      const adminActor = await core.authenticateAgentToken(
        adminGrant.access_token,
      );
      const adminId = (adminActor as { tokenId: string }).tokenId;
      const own = await core.listAgentTokens(bob, w);
      expect(own.map((item) => item.id)).toEqual([tokenId]);
      expect(
        (await core.listAgentTokens(alice, w)).map((item) => item.id),
      ).toEqual(expect.arrayContaining([personal.id, tokenId, adminId]));
      for (const id of [personal.id, adminId]) {
        await expect(core.revokeAgentToken(bob, id)).rejects.toMatchObject({
          code: "forbidden",
        });
        await expect(core.restoreAgentToken(bob, id)).rejects.toMatchObject({
          code: "forbidden",
        });
      }
      await core.revokeAgentToken(bob, tokenId);
      expect(await core.authenticateAgentToken(grant.access_token)).toBeNull();
      await core.restoreAgentToken(bob, tokenId);
      expect(
        await core.authenticateAgentToken(grant.access_token),
      ).not.toBeNull();
      await supervise(null);
      await expect(memberGrant()).rejects.toMatchObject({
        code: "forbidden",
        status: 403,
      });
    } finally {
      await supervise(null);
    }
  });
  it("rechecks a member's supervision when redeeming a code", async () => {
    await supervise(bobMember);
    const proof = pkce();
    const { redirectTo } = await core.oauth.decide(bob, {
      request: {
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: proof.challenge,
        code_challenge_method: "S256",
      },
      decision: "approve",
      workspaceId: w,
      memberId: agentId,
      scopes: ["tasks:read"],
    });
    await supervise(null);
    await expect(
      exchange(new URL(redirectTo).searchParams.get("code")!, proof.verifier),
    ).rejects.toMatchObject({ error: "invalid_grant" });
  });

  it.each(["supervisor changed", "guest", "admin demoted"])(
    "refresh revokes an ineligible approver: %s",
    async (reason) => {
      await supervise(bobMember);
      let memberId = bobMember;
      if (reason === "admin demoted") {
        const [person] = await connection.db
          .select()
          .from(members)
          .where(eq(members.userId, (alice as { userId: string }).userId));
        memberId = person.id;
      }
      const proof = pkce();
      const grant =
        reason === "admin demoted"
          ? await exchange(
              await approve(proof.challenge, { scopes: ["files:write"] }),
              proof.verifier,
            )
          : await memberGrant();
      const actor = await core.authenticateAgentToken(grant.access_token);
      const tokenId = (actor as { tokenId: string }).tokenId;
      if (reason === "supervisor changed") await supervise(null);
      else await role(memberId, reason === "guest" ? "guest" : "member");
      try {
        await expect(
          core.oauth.token({
            grant_type: "refresh_token",
            client_id: clientId,
            refresh_token: grant.refresh_token,
          }),
        ).rejects.toMatchObject({ error: "invalid_grant" });
        const [row] = await connection.db
          .select()
          .from(agentTokens)
          .where(eq(agentTokens.id, tokenId));
        expect(row.revokedAt).not.toBeNull();
        expect(
          await core.authenticateAgentToken(grant.access_token),
        ).toBeNull();
        const changes = await connection.db
          .select()
          .from(activity)
          .where(
            and(
              eq(activity.resourceId, tokenId),
              eq(activity.action, "agent_tokens.update"),
            ),
          );
        expect(changes).toHaveLength(1);
        expect(changes[0].actorId).toBe(`agent:${agentId}`);
      } finally {
        await role(memberId, reason === "admin demoted" ? "admin" : "member");
        await supervise(null);
      }
    },
  );

  it("a member undoes only their own revocation, and only while still allowed to connect", async () => {
    await supervise(bobMember);
    try {
      const tokenFor = async (access: string) =>
        ((await core.authenticateAgentToken(access)) as { tokenId: string })
          .tokenId;
      // An admin's revocation stays revoked, even for the supervising member.
      const byAdmin = await memberGrant();
      const adminRevoked = await tokenFor(byAdmin.access_token);
      await core.revokeAgentToken(alice, adminRevoked);
      await expect(
        core.restoreAgentToken(bob, adminRevoked),
      ).rejects.toMatchObject({ code: "forbidden", status: 403 });
      expect(
        await core.authenticateAgentToken(byAdmin.access_token),
      ).toBeNull();
      // The member's own revocation cannot be undone after supervision ends.
      const own = await memberGrant();
      const ownId = await tokenFor(own.access_token);
      await core.revokeAgentToken(bob, ownId);
      await supervise(null);
      await expect(core.restoreAgentToken(bob, ownId)).rejects.toMatchObject({
        code: "forbidden",
        status: 403,
      });
      expect(await core.authenticateAgentToken(own.access_token)).toBeNull();
      // Admins may still undo either revocation.
      await core.restoreAgentToken(alice, adminRevoked);
      expect(
        await core.authenticateAgentToken(byAdmin.access_token),
      ).not.toBeNull();
    } finally {
      await supervise(null);
    }
  });
});
