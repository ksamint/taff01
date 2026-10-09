# ADR 0009 — Tencent Cloud SMS login

Status: accepted for implementation, 2026-10-09.

## Context

The user requested Tencent Cloud SMS login. Email/password login and Core-owned
PostgreSQL authentication already work. The installed Better Auth 1.7.7 phone
plugin supports phone verification and session creation, but its default OTP
storage is plaintext and does not guarantee atomic concurrent consumption.
SMS delivery is a paid external operation, so ambiguous timeouts must not cause
automatic retries.

## Decision

Use the installed phone plugin for verified identity and session creation.
Replace its send endpoint and use its supported custom verification hook with
Core-owned, domain-separated HMAC OTP state in PostgreSQL. An accepted code is
consumed under a row lock. Codes have six digits, expire after five minutes and
permit at most three wrong attempts. Provider acknowledgement makes a reserved
code usable; failed or ambiguous sends invalidate it and retain their cooldown.

Only expose validated send/verify REST adapters. Verification accepts precisely
`phoneNumber` and `code`; account linking, password/reset operations and session
overrides are not exposed. A first verified number creates a separate phone
identity with a non-identifying name and an HMAC-derived unreachable email.
Existing email identities and workspaces are not automatically merged.

Use Node's existing `fetch` and cryptography for Tencent TC3 request signing.
No dependency is added. Production uses the approved domestic sign and
single-parameter verification template from the established secret manager.
Initial support is canonical mainland mobile numbers, `+861[3-9]` plus nine
digits. All five required configuration values must be present together;
empty values disable SMS and partial configuration fails startup safely.
`GET /api/auth/methods` publishes only availability, never provider identifiers.

Core persists a 60-second phone resend cooldown, five send reservations per
phone per hour, 30 sends globally per minute, ten sends per socket peer per
minute and 30 verification calls per socket peer per minute. Failed sends count
toward these limits. Peers and phone/code values in private auth state are HMACs.
Auth activity/notifications contain metadata identifiers, not OTPs or recipients.

The Node adapter supplies the socket peer and replaces client-supplied forwarded
headers before phone auth. Behind a reverse proxy, users can share a peer bucket.
This conservative limit remains until a separate change establishes and tests
an explicit trusted proxy chain; arbitrary forwarding headers are never used to
create fresh rate-limit identities.

## Consequences

- Browser sign-in retains secure cookies, same-origin checks and fresh session
  confirmation before private data or mutations.
- A provisioning/session failure after OTP consumption burns that code. Users
  must request another; a failed login cannot restore a reusable credential.
- Tencent sends are attempted once. Provider errors are sanitized; phone/code,
  credential and application/template values never enter application logs.
- CI uses fake transports and intercepted browser endpoints. A real SMS test
  requires an explicitly authorized recipient and does not happen automatically.
- This adds optional auth functionality and additive migrations; it does not
  complete M9 email ownership/invitation verification or account linking.

References: [Better Auth phone plugin](https://better-auth.com/docs/plugins/phone-number),
[Tencent signature v3](https://cloud.tencent.com/document/product/213/30654),
[Tencent SendSms](https://www.tencentcloud.com/document/api/382/38778).
