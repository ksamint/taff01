import * as s from "@taff/schemas";
import {
  array,
  boolean,
  iso,
  literal,
  nullable,
  object,
  optional,
  string,
  union,
} from "zod/mini";
import type { RestContracts } from "./rest-contracts";

// Better Auth serializes its configured user fields before returning JSON.
const authUser = object({
  id: s.idSchema,
  name: string(),
  email: string(),
  emailVerified: boolean(),
  image: optional(nullable(string())),
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
  username: optional(nullable(string())),
  displayUsername: optional(nullable(string())),
  phoneNumber: optional(nullable(string())),
  phoneNumberVerified: optional(nullable(boolean())),
  systemAdmin: optional(boolean()),
  locale: optional(string()),
  tz: optional(string()),
});
const signInResult = object({
  redirect: literal(false),
  token: string(),
  user: authUser,
});
const signUpResult = object({ token: nullable(string()), user: authUser });
const smsResult = object({ status: literal(true) });
const oauthResource = object({
  resource: string(),
  authorization_servers: array(string()),
  scopes_supported: array(s.scopeSchema),
  bearer_methods_supported: array(literal("header")),
  resource_name: literal("Taff"),
});
const oauthServer = object({
  issuer: string(),
  authorization_endpoint: string(),
  token_endpoint: string(),
  registration_endpoint: string(),
  revocation_endpoint: string(),
  response_types_supported: array(literal("code")),
  grant_types_supported: array(
    union([literal("authorization_code"), literal("refresh_token")]),
  ),
  code_challenge_methods_supported: array(literal("S256")),
  token_endpoint_auth_methods_supported: array(literal("none")),
  revocation_endpoint_auth_methods_supported: array(literal("none")),
  scopes_supported: array(s.scopeSchema),
  authorization_response_iss_parameter_supported: literal(true),
});
const approvedOperationResult = union([
  s.projectSchema,
  s.taskSchema,
  s.taskCommentSchema,
  s.taskCalendarSchema,
  s.runSchema,
  s.runEventSchema,
  s.runArtifactSchema,
]);

export const authContracts = {
  "GET /.well-known/oauth-authorization-server": [null, 200, oauthServer],
  "GET /.well-known/oauth-protected-resource": [null, 200, oauthResource],
  "GET /.well-known/oauth-protected-resource/mcp": [null, 200, oauthResource],
  "GET /api/auth/methods": [null, 200, s.authMethodsSchema],
  "GET /api/health": [null, 200, object({ status: literal("ok") })],
  "GET /api/me/email-verification": [
    null,
    200,
    s.emailVerificationStatusSchema,
  ],
  "GET /api/oauth/consent": [null, 200, s.oauthConsentSchema],
  "GET /api/realtime": [null, 101, null],
  "POST /api/approved-operations": [
    s.approvedAgentEnvelopeSchema,
    200,
    approvedOperationResult,
  ],
  "POST /api/approved-operations/status": [
    s.approvedAgentEnvelopeSchema,
    200,
    approvedOperationResult,
  ],
  "POST /api/auth/phone-number/send-otp": [
    s.sendPhoneOtpSchema,
    200,
    smsResult,
  ],
  "POST /api/auth/phone-number/verify": [
    s.verifyPhoneOtpSchema,
    200,
    smsResult,
  ],
  "POST /api/auth/sign-in/email": [s.signInSchema, 200, signInResult],
  "POST /api/auth/sign-in/phone-number": [
    s.phonePasswordSignInSchema,
    200,
    smsResult,
  ],
  "POST /api/auth/sign-in/username": [
    s.usernameSignInSchema,
    200,
    signInResult,
  ],
  "POST /api/auth/sign-out": [
    s.signOutSchema,
    200,
    object({ success: literal(true) }),
  ],
  "POST /api/auth/sign-up/email": [s.signUpSchema, 200, signUpResult],
  "POST /api/me/email-verification/request": [
    s.emailVerificationRequestSchema,
    200,
    s.emailVerificationRequestResultSchema,
  ],
  "POST /api/me/email-verification/verify": [
    s.emailVerificationConsumeSchema,
    200,
    s.emailVerificationStatusSchema,
  ],
  "POST /api/oauth/consent": [
    s.oauthDecisionSchema,
    200,
    s.oauthRedirectSchema,
  ],
  "POST /api/oauth/register": [s.oauthRegisterSchema, 201, s.oauthClientSchema],
  "POST /api/oauth/revoke": [
    object({ token: optional(string()), client_id: optional(string()) }),
    200,
    null,
  ],
  "POST /api/oauth/token": [
    s.oauthTokenRequestSchema,
    200,
    s.oauthTokenResponseSchema,
  ],
  "POST /api/trusted-reviews": [s.trustedReviewReceiptSchema, 200, s.runSchema],
  "POST /api/trusted-reviews/status": [
    s.trustedReviewReceiptSchema,
    200,
    s.runSchema,
  ],
} satisfies RestContracts;
