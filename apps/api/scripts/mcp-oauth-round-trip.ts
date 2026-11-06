// OAuth 2.1 round trip with the official MCP client (ADR 0022): discovery
// from a 401, dynamic registration, PKCE authorization, code exchange, tool
// calls with the issued token, refresh rotation and RFC 7009 revocation.
// Shared by `pnpm mcp:smoke` and the release checklist; callers supply the
// person's approval and never pass tokens to `check`.
import {
  Client,
  type FetchLike,
  type OAuthClientInformationMixed,
  type OAuthClientMetadata,
  type OAuthClientProvider,
  type OAuthTokens,
  StreamableHTTPClientTransport,
  UnauthorizedError,
} from "@modelcontextprotocol/client";
import { MCP_TOOLS } from "./mcp-round-trip";

export type McpOAuthRoundTripOptions = {
  /** The `/mcp` URL the client connects to. */
  endpoint: URL;
  /**
   * The person's decision on the consent screen: approve the authorization
   * URL's request and return the client redirect (with `code` and `iss`).
   */
  approve(authorizationUrl: URL): Promise<string>;
  /** Records one named result; must not print secrets. */
  check(name: string, condition: boolean, detail?: unknown): void;
  /**
   * Routes requests the way the public proxy does, e.g. from AUTH_URL to a
   * local API; omit against a real origin.
   */
  fetch?: FetchLike;
  /** Accept the advertised resource when `endpoint` is not the public URL. */
  trustAdvertisedResource?: boolean;
};

/** Loopback redirect (RFC 8252); nothing listens, the code is read directly. */
const REDIRECT = "http://127.0.0.1:33418/callback";

class MemoryProvider implements OAuthClientProvider {
  client?: OAuthClientInformationMixed;
  saved?: OAuthTokens;
  verifier = "";
  authorizationUrl?: URL;
  constructor(private trustResource: boolean) {}
  get redirectUrl() {
    return REDIRECT;
  }
  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Taff smoke",
      redirect_uris: [REDIRECT],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  clientInformation() {
    return this.client;
  }
  saveClientInformation(info: OAuthClientInformationMixed) {
    this.client = info;
  }
  tokens() {
    return this.saved;
  }
  saveTokens(tokens: OAuthTokens) {
    this.saved = tokens;
  }
  redirectToAuthorization(url: URL) {
    this.authorizationUrl = url;
  }
  saveCodeVerifier(verifier: string) {
    this.verifier = verifier;
  }
  codeVerifier() {
    return this.verifier;
  }
  async validateResourceURL(serverUrl: string | URL, resource?: string) {
    if (this.trustResource && resource) return new URL(resource);
    return resource ? new URL(resource) : new URL(serverUrl);
  }
}

export async function runMcpOAuthRoundTrip(options: McpOAuthRoundTripOptions) {
  const { endpoint, check } = options;
  const provider = new MemoryProvider(!!options.trustAdvertisedResource);
  const transport = () =>
    new StreamableHTTPClientTransport(endpoint, {
      authProvider: provider,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
  const first = new Client({ name: "taff-oauth-smoke", version: "0.1.0" });
  const pending = transport();
  let challenged = false;
  try {
    await first.connect(pending);
  } catch (error) {
    challenged = error instanceof UnauthorizedError;
  }
  check(
    "oauth: a token-less client is challenged and registers itself",
    challenged &&
      !!provider.client?.client_id &&
      provider.authorizationUrl?.searchParams.get("code_challenge_method") ===
        "S256",
  );
  if (!provider.authorizationUrl) return;
  const callback = new URL(await options.approve(provider.authorizationUrl));
  check(
    "oauth: consent returns a code with the issuer",
    !!callback.searchParams.get("code") && callback.searchParams.has("iss"),
  );
  await pending.finishAuth(callback.searchParams);
  const issued = provider.saved;
  check(
    "oauth: the code is exchanged for expiring, refreshable tokens",
    !!issued?.access_token &&
      !!issued.refresh_token &&
      (issued.expires_in ?? 0) > 0,
  );
  const client = new Client({ name: "taff-oauth-smoke", version: "0.1.0" });
  await client.connect(transport());
  const tools = (await client.listTools()).tools.map((tool) => tool.name);
  check(
    "oauth: the issued token lists every tool",
    tools.length === MCP_TOOLS.length,
    { count: tools.length },
  );
  const context = await client.callTool({ name: "context.get", arguments: {} });
  check("oauth: tools answer with the issued token", !context.isError);
  await client.close();

  // Refresh rotation: the old refresh token works exactly once.
  const meta = (await (options.fetch ?? fetch)(
    new URL("/.well-known/oauth-authorization-server", endpoint),
  ).then((response) => response.json())) as {
    token_endpoint: string;
    revocation_endpoint: string;
  };
  const clientId = provider.client!.client_id;
  const form = (fields: Record<string, string>) =>
    (options.fetch ?? fetch)(meta.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
    });
  const refreshed = await form({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: issued!.refresh_token!,
  });
  const rotated = (await refreshed.json()) as OAuthTokens;
  const access = (token: string) =>
    (options.fetch ?? fetch)(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
  check(
    "oauth: rotated access token is usable",
    (await access(rotated.access_token)).ok,
  );
  const replay = await form({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: issued!.refresh_token!,
  });
  const descendant = await form({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: rotated.refresh_token!,
  });
  check(
    "oauth: refresh reuse revokes the descendant access and refresh tokens",
    refreshed.ok &&
      !!rotated.refresh_token &&
      rotated.refresh_token !== issued!.refresh_token &&
      replay.status === 400 &&
      descendant.status === 400 &&
      (await access(rotated.access_token)).status === 401,
  );
  // Explicit revocation must also end a separate, still-live grant.
  const freshCallback = new URL(
    await options.approve(provider.authorizationUrl),
  );
  const freshResponse = await form({
    grant_type: "authorization_code",
    client_id: clientId,
    code: freshCallback.searchParams.get("code")!,
    redirect_uri: REDIRECT,
    code_verifier: provider.verifier,
  });
  const fresh = (await freshResponse.json()) as OAuthTokens;
  check(
    "oauth: reauthorization issues a live grant",
    freshResponse.ok && (await access(fresh.access_token)).ok,
  );
  const revoke = await (options.fetch ?? fetch)(meta.revocation_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: fresh.refresh_token!,
      client_id: clientId,
    }),
  });
  const after = await access(fresh.access_token);
  check(
    "oauth: revocation ends the grant and the 401 names resource metadata",
    revoke.ok &&
      after.status === 401 &&
      /resource_metadata="/.test(after.headers.get("www-authenticate") ?? ""),
  );
}
