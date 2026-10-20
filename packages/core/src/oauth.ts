// OAuth 2.1 authorization server for MCP (ADR 0022). A grant is an agent
// token: approving a client issues one agent_tokens row whose access token
// expires hourly and whose refresh token rotates on every use.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  agentProfiles,
  agentTokens,
  type Database,
  members,
  oauthClients,
  oauthCodes,
  type Transaction,
  workspaces,
} from "@taff/db";
import {
  type OAuthAuthorize,
  type OAuthClient,
  type OAuthConsent,
  type OAuthDecision,
  type OAuthRegister,
  type OAuthTokenRequest,
  oauthAuthorizeSchema,
  oauthDecisionSchema,
  oauthRegisterSchema,
  oauthTokenRequestSchema,
  SchemaError,
  type Scope,
  scopeSchema,
} from "@taff/schemas";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { CoreError, hashToken, type Principal, userPrincipal } from "./index";
import {
  type Action,
  type Actor,
  can,
  canGrantOAuthScopes,
  OAUTH_SCOPE_CEILING,
  type Resource,
} from "./permissions";

export const ACCESS_TOKEN_SECONDS = 3600;
const REFRESH_TOKEN_MS = 30 * 24 * 3_600_000;
const CODE_MS = 10 * 60_000;
/** Scopes offered when a client asks for none it is allowed to have. */
const DEFAULT_SCOPES: Scope[] = ["tasks:read", "tasks:write"];

/** An RFC 6749 §5.2 error for the token, registration and revocation endpoints. */
export class OAuthError extends Error {
  constructor(
    public error:
      | "invalid_request"
      | "invalid_client"
      | "invalid_grant"
      | "unsupported_grant_type"
      | "invalid_client_metadata"
      | "invalid_redirect_uri"
      | "invalid_target",
    public description: string,
    public status = 400,
  ) {
    super(error);
  }
}

type Dependencies = {
  db: Database;
  tokenPepper: string;
  authUrl: string;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
};

const secret = (prefix: string) =>
  `${prefix}${randomBytes(32).toString("base64url")}`;
const s256 = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");
function sameText(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createOAuthOperations({
  db,
  tokenPepper,
  authUrl,
  mutation,
  requireMember,
}: Dependencies) {
  const origin = new URL(authUrl).origin;
  /** The one protected resource: `/mcp` on the public origin. */
  const resource = `${origin}/mcp`;
  const hash = (value: string) => hashToken(value, tokenPepper);

  function parse<T>(
    schema: { parse(v: unknown): T },
    value: unknown,
    error: OAuthError["error"] = "invalid_request",
  ): T {
    try {
      return schema.parse(value);
    } catch (e) {
      if (e instanceof SchemaError)
        throw new OAuthError(error, "Malformed request");
      throw e;
    }
  }
  function checkResource(value: string | undefined) {
    if (value !== undefined && value.replace(/\/$/, "") !== resource)
      throw new OAuthError("invalid_target", `Only ${resource} is protected`);
  }
  function requestedScopes(scope: string | undefined): Scope[] {
    const known = new Set<string>(scopeSchema.options);
    const asked = [...new Set((scope ?? "").split(/\s+/))].filter((item) =>
      known.has(item),
    ) as Scope[];
    return asked.length ? asked : DEFAULT_SCOPES;
  }
  /** The registered client whose redirect URI exactly matches the request. */
  async function clientFor(clientId: string, redirectUri: string) {
    const [client] = await db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.id, clientId));
    if (!client) throw new CoreError("not_found", 404);
    if (!client.redirectUris.includes(redirectUri))
      throw new CoreError("invalid_input", 400);
    return client;
  }

  async function registerClient(input: OAuthRegister): Promise<OAuthClient> {
    const body = parse(oauthRegisterSchema, input, "invalid_client_metadata");
    for (const grant of body.grant_types ?? [])
      if (!["authorization_code", "refresh_token"].includes(grant))
        throw new OAuthError(
          "invalid_client_metadata",
          `Unsupported grant ${grant}`,
        );
    if (body.response_types?.some((type) => type !== "code"))
      throw new OAuthError(
        "invalid_client_metadata",
        "Only response type code",
      );
    const [row] = await db
      .insert(oauthClients)
      .values({
        id: secret("mcp_").slice(0, 40),
        name: body.client_name ?? "MCP client",
        redirectUris: [...new Set(body.redirect_uris)],
      })
      .returning();
    return {
      client_id: row.id,
      client_name: row.name,
      redirect_uris: row.redirectUris,
      client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  /**
   * What the consent screen shows. An unknown client or redirect URI is an
   * error page, never a redirect (RFC 6749 §4.1.2.1).
   */
  async function getConsent(
    principal: Principal,
    request: OAuthAuthorize,
  ): Promise<OAuthConsent> {
    if (principal.kind !== "user") throw new CoreError("forbidden", 403);
    let body: OAuthAuthorize;
    try {
      body = oauthAuthorizeSchema.parse(request);
      checkResource(body.resource);
    } catch {
      throw new CoreError("invalid_input", 400);
    }
    const client = await clientFor(body.client_id, body.redirect_uri);
    const rows = await db
      .select({ member: members, workspace: workspaces })
      .from(members)
      .innerJoin(workspaces, eq(workspaces.id, members.workspaceId))
      .where(
        and(
          eq(members.userId, principal.userId),
          isNull(workspaces.archivedAt),
        ),
      )
      .orderBy(workspaces.name, workspaces.id);
    const managed = rows.filter(({ member }) =>
      can(member as Actor, "workspace:read", {
        workspaceId: member.workspaceId,
      }),
    );
    const agents = managed.length
      ? await db
          .select({
            id: members.id,
            name: members.name,
            workspaceId: members.workspaceId,
            supervisorId: agentProfiles.supervisorId,
          })
          .from(members)
          .leftJoin(agentProfiles, eq(agentProfiles.id, members.id))
          .where(
            and(
              inArray(
                members.workspaceId,
                managed.map(({ workspace }) => workspace.id),
              ),
              eq(members.kind, "agent"),
            ),
          )
          .orderBy(members.name, members.id)
      : [];
    return {
      client: {
        id: client.id,
        name: client.name,
        redirectHost: new URL(body.redirect_uri).host || body.redirect_uri,
      },
      workspaces: managed
        .map(({ workspace, member }) => ({
          id: workspace.id,
          name: workspace.name,
          allowedScopes: OAUTH_SCOPE_CEILING[member.role],
          agents: agents
            .filter((agent) => can(member as Actor, "token:connect", agent))
            .map(({ id, name }) => ({ id, name })),
        }))
        .filter((item) => item.agents.length > 0),
      scopes: requestedScopes(body.scope),
    };
  }

  async function requireApproval(
    q: Database | Transaction,
    principal: Principal,
    workspaceId: string,
    memberId: string,
    scopes: Scope[],
  ) {
    const [agent] = await q
      .select({ id: members.id, supervisorId: agentProfiles.supervisorId })
      .from(members)
      .leftJoin(agentProfiles, eq(agentProfiles.id, members.id))
      .where(
        and(
          eq(members.id, memberId),
          eq(members.workspaceId, workspaceId),
          eq(members.kind, "agent"),
        ),
      );
    // Check membership first so foreign users cannot probe agent existence.
    await requireMember(q, principal, workspaceId, "workspace:read");
    if (!agent) throw new CoreError("invalid_input", 400);
    const resource = { workspaceId, supervisorId: agent.supervisorId };
    const actor = await requireMember(
      q,
      principal,
      workspaceId,
      "token:connect",
      resource,
    );
    if (!canGrantOAuthScopes(actor, resource, scopes))
      throw new CoreError("forbidden", 403);
    return actor;
  }

  /** Approve (issue a code) or deny; both answer with the client redirect. */
  async function decide(
    principal: Principal,
    input: OAuthDecision,
  ): Promise<{ redirectTo: string }> {
    if (principal.kind !== "user") throw new CoreError("forbidden", 403);
    let body: OAuthDecision;
    try {
      body = oauthDecisionSchema.parse(input);
      checkResource(body.request.resource);
    } catch {
      throw new CoreError("invalid_input", 400);
    }
    const request = body.request;
    await clientFor(request.client_id, request.redirect_uri);
    const target = new URL(request.redirect_uri);
    if (request.state !== undefined)
      target.searchParams.set("state", request.state);
    target.searchParams.set("iss", origin);
    if (body.decision === "deny") {
      target.searchParams.set("error", "access_denied");
      return { redirectTo: target.toString() };
    }
    if (!body.workspaceId || !body.memberId || !body.scopes)
      throw new CoreError("invalid_input", 400);
    const actor = await requireApproval(
      db,
      principal,
      body.workspaceId,
      body.memberId,
      body.scopes,
    );
    const code = secret("taffcode_");
    await db.insert(oauthCodes).values({
      hash: hash(code),
      clientId: request.client_id,
      workspaceId: body.workspaceId,
      memberId: body.memberId,
      createdBy: actor.id,
      scopes: [...new Set(body.scopes)],
      redirectUri: request.redirect_uri,
      codeChallenge: request.code_challenge,
      expiresAt: new Date(Date.now() + CODE_MS),
    });
    target.searchParams.set("code", code);
    return { redirectTo: target.toString() };
  }

  function issued(access: string, refresh: string, scopes: string[]) {
    return {
      access_token: access,
      token_type: "Bearer" as const,
      expires_in: ACCESS_TOKEN_SECONDS,
      refresh_token: refresh,
      scope: scopes.join(" "),
    };
  }

  async function exchangeCode(body: OAuthTokenRequest) {
    if (!body.code || !body.code_verifier || !body.redirect_uri)
      throw new OAuthError(
        "invalid_request",
        "code, code_verifier and redirect_uri are required",
      );
    const [code] = await db
      .select()
      .from(oauthCodes)
      .where(eq(oauthCodes.hash, hash(body.code)));
    const fail = () => {
      throw new OAuthError("invalid_grant", "Invalid authorization code");
    };
    if (!code) return fail();
    if (code.usedAt) {
      // A replayed code may be stolen: end the grant it produced (RFC 6749 §4.1.2).
      if (code.tokenId)
        await revokeRow(code.tokenId, code.memberId, code.workspaceId);
      return fail();
    }
    if (
      code.expiresAt.getTime() <= Date.now() ||
      code.clientId !== body.client_id ||
      code.redirectUri !== body.redirect_uri ||
      !sameText(s256(body.code_verifier), code.codeChallenge)
    )
      return fail();
    const [approver] = await db
      .select({ userId: members.userId })
      .from(members)
      .where(
        and(
          eq(members.id, code.createdBy),
          eq(members.workspaceId, code.workspaceId),
        ),
      );
    if (!approver?.userId) return fail();
    const [client] = await db
      .select({ name: oauthClients.name })
      .from(oauthClients)
      .where(eq(oauthClients.id, code.clientId));
    if (!client) return fail();
    const access = secret("taff_");
    const refresh = secret("taffr_");
    const person = userPrincipal(approver.userId);
    try {
      return await mutation(person, async (tx) => {
        // Single use even under concurrent exchanges.
        const claimed = await tx
          .update(oauthCodes)
          .set({ usedAt: new Date() })
          .where(and(eq(oauthCodes.id, code.id), isNull(oauthCodes.usedAt)))
          .returning({ id: oauthCodes.id });
        if (!claimed.length) return fail();
        // The approver must still manage tokens when the code is redeemed.
        await requireApproval(
          tx,
          person,
          code.workspaceId,
          code.memberId,
          code.scopes as Scope[],
        );
        const now = Date.now();
        const [row] = await tx
          .insert(agentTokens)
          .values({
            workspaceId: code.workspaceId,
            memberId: code.memberId,
            createdBy: code.createdBy,
            name: client.name,
            hash: hash(access),
            prefix: access.slice(0, 12),
            scopes: code.scopes,
            oauthClientId: code.clientId,
            expiresAt: new Date(now + ACCESS_TOKEN_SECONDS * 1000),
            refreshHash: hash(refresh),
            refreshExpiresAt: new Date(now + REFRESH_TOKEN_MS),
          })
          .returning({ id: agentTokens.id });
        await tx
          .update(oauthCodes)
          .set({ tokenId: row.id })
          .where(eq(oauthCodes.id, code.id));
        return issued(access, refresh, code.scopes);
      });
    } catch (error) {
      if (error instanceof CoreError) return fail();
      throw error;
    }
  }

  async function refreshGrant(body: OAuthTokenRequest) {
    if (!body.refresh_token)
      throw new OAuthError("invalid_request", "refresh_token is required");
    const fail = () => {
      throw new OAuthError("invalid_grant", "Invalid refresh token");
    };
    const [found] = await db
      .select({ token: agentTokens })
      .from(agentTokens)
      .innerJoin(workspaces, eq(workspaces.id, agentTokens.workspaceId))
      .where(
        and(
          eq(agentTokens.refreshHash, hash(body.refresh_token)),
          eq(agentTokens.oauthClientId, body.client_id),
          isNull(agentTokens.revokedAt),
          gt(agentTokens.refreshExpiresAt, new Date()),
          isNull(workspaces.archivedAt),
        ),
      );
    const row = found?.token;
    if (!row) return fail();
    const access = secret("taff_");
    const refresh = secret("taffr_");
    const now = Date.now();
    const result = await mutation(agentPrincipal(row), async (tx) => {
      const [approver] = await tx
        .select({ userId: members.userId })
        .from(members)
        .where(
          and(
            eq(members.id, row.createdBy),
            eq(members.workspaceId, row.workspaceId),
          ),
        );
      try {
        if (!approver?.userId) throw new CoreError("forbidden", 403);
        await requireApproval(
          tx,
          userPrincipal(approver.userId),
          row.workspaceId,
          row.memberId,
          row.scopes as Scope[],
        );
      } catch (error) {
        if (!(error instanceof CoreError)) throw error;
        await tx
          .update(agentTokens)
          .set({ revokedAt: new Date(), updatedAt: new Date() })
          .where(
            and(eq(agentTokens.id, row.id), isNull(agentTokens.revokedAt)),
          );
        return null; // Commit the audited revocation before answering invalid_grant.
      }
      // Rotation: the presented refresh token works exactly once.
      const rotated = await tx
        .update(agentTokens)
        .set({
          hash: hash(access),
          prefix: access.slice(0, 12),
          expiresAt: new Date(now + ACCESS_TOKEN_SECONDS * 1000),
          refreshHash: hash(refresh),
          refreshExpiresAt: new Date(now + REFRESH_TOKEN_MS),
          updatedAt: new Date(now),
        })
        .where(
          and(
            eq(agentTokens.id, row.id),
            eq(agentTokens.refreshHash, hash(body.refresh_token!)),
            isNull(agentTokens.revokedAt),
          ),
        )
        .returning({ id: agentTokens.id });
      if (!rotated.length) return fail();
      return issued(access, refresh, row.scopes);
    });
    return result ?? fail();
  }

  /** RFC 6749 §3.2 token endpoint for public clients. */
  async function token(input: OAuthTokenRequest) {
    const body = parse(oauthTokenRequestSchema, input);
    checkResource(body.resource);
    const [client] = await db
      .select({ id: oauthClients.id })
      .from(oauthClients)
      .where(eq(oauthClients.id, body.client_id));
    if (!client) throw new OAuthError("invalid_client", "Unknown client", 401);
    return body.grant_type === "authorization_code"
      ? exchangeCode(body)
      : refreshGrant(body);
  }

  function agentPrincipal(row: typeof agentTokens.$inferSelect): Principal {
    return {
      kind: "agent",
      tokenId: row.id,
      memberId: row.memberId,
      workspaceId: row.workspaceId,
      scopes: row.scopes as Scope[],
    };
  }
  async function revokeRow(id: string, memberId: string, workspaceId: string) {
    await mutation(
      { kind: "agent", tokenId: id, memberId, workspaceId, scopes: [] },
      (tx) =>
        tx
          .update(agentTokens)
          .set({ revokedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(agentTokens.id, id), isNull(agentTokens.revokedAt))),
    );
  }

  /** RFC 7009: revoke by access or refresh token; unknown tokens are fine. */
  async function revoke(input: { token?: unknown; client_id?: unknown }) {
    if (typeof input.token !== "string" || input.token.length > 200) return;
    if (typeof input.client_id !== "string") return;
    const value = hash(input.token);
    const [row] = await db
      .select()
      .from(agentTokens)
      .where(
        and(
          eq(agentTokens.oauthClientId, input.client_id),
          isNull(agentTokens.revokedAt),
          or(eq(agentTokens.hash, value), eq(agentTokens.refreshHash, value)),
        ),
      );
    if (row) await revokeRow(row.id, row.memberId, row.workspaceId);
  }

  function metadata() {
    const scopes = [...scopeSchema.options];
    return {
      protectedResource: {
        resource,
        authorization_servers: [origin],
        scopes_supported: scopes,
        bearer_methods_supported: ["header"],
        resource_name: "Taff",
      },
      authorizationServer: {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/api/oauth/token`,
        registration_endpoint: `${origin}/api/oauth/register`,
        revocation_endpoint: `${origin}/api/oauth/revoke`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        revocation_endpoint_auth_methods_supported: ["none"],
        scopes_supported: scopes,
        authorization_response_iss_parameter_supported: true,
      },
      resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
    };
  }

  return {
    operations: { registerClient, getConsent, decide, token, revoke },
    metadata,
  };
}
