// OAuth 2.1 for MCP (ADR 0022): dynamic client registration, the consent
// screen and the token endpoint. Wire names follow the RFCs (snake_case).
import {
  array,
  type infer as Infer,
  literal,
  maxLength,
  minLength,
  number,
  object,
  optional,
  refine,
  regex,
  strictObject,
  string,
  trim,
  enum as zodEnum,
} from "zod/mini";
import { idSchema, scopeSchema } from "./primitives";

/**
 * HTTPS, loopback HTTP (RFC 8252 §7.3) or a reverse-DNS private-use scheme
 * (RFC 8252 §7.1). Never a fragment, credentials or another plain-HTTP host.
 */
export function isAllowedRedirectUri(value: string): boolean {
  if (value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return !!url.hostname;
  if (url.protocol === "http:")
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return /^[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+:$/.test(url.protocol);
}
export const redirectUriSchema = string().check(
  refine(isAllowedRedirectUri, "Unsupported redirect URI"),
);

/** RFC 7591 request; unknown metadata (logo_uri, client_uri…) is ignored. */
export const oauthRegisterSchema = object({
  redirect_uris: array(redirectUriSchema).check(minLength(1), maxLength(5)),
  client_name: optional(string().check(trim(), minLength(1), maxLength(100))),
  grant_types: optional(array(string())),
  response_types: optional(array(string())),
  token_endpoint_auth_method: optional(string()),
  scope: optional(string().check(maxLength(500))),
});
export const oauthClientSchema = object({
  client_id: string(),
  client_name: string(),
  redirect_uris: array(string()),
  client_id_issued_at: number(),
  grant_types: array(string()),
  response_types: array(string()),
  token_endpoint_auth_method: literal("none"),
});

/** PKCE verifier/challenge: 43–128 unreserved characters (RFC 7636). */
const pkceSchema = string().check(regex(/^[A-Za-z0-9._~-]{43,128}$/));
/** The authorization request as the consent page receives it. */
export const oauthAuthorizeSchema = object({
  response_type: literal("code"),
  client_id: string().check(minLength(1), maxLength(100)),
  redirect_uri: redirectUriSchema,
  code_challenge: pkceSchema,
  code_challenge_method: literal("S256"),
  state: optional(string().check(maxLength(1000))),
  scope: optional(string().check(maxLength(500))),
  resource: optional(string().check(maxLength(2000))),
});
export const oauthConsentSchema = object({
  client: object({
    id: string(),
    name: string(),
    /** Where the code goes, shown because anyone can register a name. */
    redirectHost: string(),
  }),
  /** Workspaces where the reader may issue agent tokens, with their agents. */
  workspaces: array(
    object({
      id: idSchema,
      name: string(),
      allowedScopes: array(scopeSchema),
      agents: array(object({ id: idSchema, name: string() })),
    }),
  ),
  /** Requested scopes that Taff knows, or the defaults when none were asked. */
  scopes: array(scopeSchema),
});
export const oauthDecisionSchema = strictObject({
  request: oauthAuthorizeSchema,
  decision: zodEnum(["approve", "deny"]),
  workspaceId: optional(idSchema),
  memberId: optional(idSchema),
  scopes: optional(array(scopeSchema).check(minLength(1), maxLength(5))),
});
export const oauthRedirectSchema = object({ redirectTo: string() });

export const oauthTokenRequestSchema = object({
  grant_type: zodEnum(["authorization_code", "refresh_token"]),
  client_id: string().check(minLength(1), maxLength(100)),
  code: optional(string().check(maxLength(200))),
  redirect_uri: optional(string().check(maxLength(2000))),
  code_verifier: optional(pkceSchema),
  refresh_token: optional(string().check(maxLength(200))),
  resource: optional(string().check(maxLength(2000))),
});
export const oauthTokenResponseSchema = object({
  access_token: string(),
  token_type: literal("Bearer"),
  expires_in: number(),
  refresh_token: string(),
  scope: string(),
});

export type OAuthRegister = Infer<typeof oauthRegisterSchema>;
export type OAuthClient = Infer<typeof oauthClientSchema>;
export type OAuthAuthorize = Infer<typeof oauthAuthorizeSchema>;
export type OAuthConsent = Infer<typeof oauthConsentSchema>;
export type OAuthDecision = Infer<typeof oauthDecisionSchema>;
export type OAuthTokenRequest = Infer<typeof oauthTokenRequestSchema>;
