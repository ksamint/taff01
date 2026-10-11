# ADR 0013: invitation delivery and independent email ownership

## Context

An authenticated user can create an account with an unverified email address.
Possessing an invitation link must therefore not grant that account access to a
workspace merely because its email string matches the recipient. Normal email,
username and SMS login must continue to work without mandatory email verification.

## Decision

Core owns outgoing email through an injectable `EmailTransport`. The API constructs
Nodemailer 10.1.0 from the optional `EMAIL_*` group. Nodemailer is MIT-0, a permissive
MIT variant without the attribution condition; development typings are
`@types/nodemailer` 8.0.2 (MIT). These are server-only dependencies.

The server-only email resources cover en, zh-CN and zh-HK with the same keys as
the UI common dictionaries and resolve through a private i18next 26.4.2 instance
(MIT) with synchronous embedded resources and per-message fixed locale. They live
in `packages/core/src/email-messages.ts` so core never imports frontend code or
adds mail resources to browser startup. Verification uses the recipient's stored locale; an
invitation uses the recipient account's locale when known, otherwise the inviter's.
No browser bundle imports server mail resources.

SMTP requires `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASSWORD` and `EMAIL_FROM` together.
`EMAIL_PORT` defaults to 465 and `EMAIL_SECURE` to true. When secure is false, STARTTLS
is required. Certificate verification remains enabled. There are bounded connection,
greeting and socket timeouts, no automatic retry on failure or ambiguous completion,
and no SMTP debug or provider-error logging. `sent` means the SMTP server accepted
the recipient, not that an inbox delivery was confirmed.

When the SMTP group is unset, the API creates a private JSONL mailbox at
`EMAIL_LOG_PATH`, default `.taff-mail/messages.jsonl`. Its directory must be owned by
the process user and mode 0700, and the regular file mode 0600 with one hard link.
Existing symlinks, nonregular files and non-private permissions are rejected, never
silently chmodded. Open uses no-follow and verifies the opened descriptor. This
mailbox contains private recipient addresses and links; it is not a public endpoint
or normal application log. The API's ordinary logs contain only message kind and
`sent`, `logged` or `failed`. Production's default mailbox is container-local and
is not durable across replacement; configure real SMTP for external delivery.

Invitation creation commits its existing actor audit and `taff_changes` notification
before sending email. `IssuedWorkspaceInvite.emailDelivery` reports the attempt.
A failed send still returns the committed invitation and its return-once token for
copying; retrying the same insert would conflict with the existing pending invite.
Invitation list DTOs never contain tokens. Link tokens use `#invite=` fragments and
are submitted through the existing authenticated JSON acceptance adapter.

Email ownership uses Better Auth 1.7.7's public `createEmailVerificationToken`
(`better-auth/api`) and `verifyJWT` (`better-auth/crypto`) helpers. The installed
SDK signs a one-hour JWT containing the normalized email, an explicit
`taff.email-verification` purpose and the authoritative user ID. The dedicated
core operations reject generic Better Auth tokens, other users, changed emails,
expiry and email-change payloads. No recipient, callback, user ID or privilege
field is accepted from the request. The message link is `AUTH_URL/#verifyEmail=`;
the authenticated consumer submits the token as JSON. We do not expose stock
Better Auth's GET verification route, change global login verification policy, or
create automatic sign-in sessions on verification.

Core locks the user row, checks the self-person permission with the actual member,
and updates the existing `emailVerified` field through the audited mutation
transaction. Parallel consumption writes exactly one update. Replaying an unexpired
proof for the same already-verified address is an idempotent success, with no new
mutation. Changing the email invalidates an older proof. There is no separate
verification-token table or token in the audit details.

The authenticated request endpoint has an independent Valkey budget of three
requests per user per fixed minute and fails closed if counting fails. This applies
to the REST adapter; private trusted core callers manage their own invocation
budget. It does not claim a per-visitor limit behind a proxy. Direct helper use does
not invoke Better Auth's stock verification endpoint rate limiter.

Invitation acceptance keeps the existing workspace/invitation locks and takes a
shared lock on the authoritative user. It requires matching email and verified
ownership before inserting membership and accepting the pending invitation in one
transaction. Unverified ownership returns `email_verification_required` (403).
Expired, revoked or already-used invitations remain conflicts. Agent principals
cannot request or consume email ownership proofs.

## Contract

- `GET /api/me/email-verification`: `{emailVerified}`.
- `POST /api/me/email-verification/request`, strict `{}`:
  `{emailVerified, delivery: sent | logged | failed | null}`; null means already verified.
- `POST /api/me/email-verification/verify`, strict `{token}`:
  `{emailVerified: true}` after successful ownership proof.
- All three routes require the current session and return private no-store responses.
- Core exports `getEmailVerificationStatus`, `requestEmailVerification`,
  `verifyEmailOwnership`, `EmailTransport` and `createEmailTransportFromEnv`.

## Validation

Transport tests cover private file modes, symlinks, nonregular paths, partial SMTP
configuration, required TLS and no retry/provider disclosure on failures. Real
PostgreSQL tests use an injected in-memory fake transport, authenticate unverified
users normally, prove ownership through signed mail links, observe actor audit and
committed notifications, and exercise cross-account, expiry, changed-address,
concurrent verification/redemption and failed-send cases. Browser tests consume
private fake/logging messages only inside their trusted test fixture, with no
public mailbox or production bypass.
