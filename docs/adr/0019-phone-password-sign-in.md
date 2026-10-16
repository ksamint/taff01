# 0019 — Phone password sign-in for provisioned accounts

Date: 2026-10-16 UTC. Status: accepted. Amends ADR 0018's SMS-only phone flow.

## Decision
- A mainland mobile still defaults to the SMS-code action when SMS is enabled.
  A localized "Use password instead" action exposes the password field; users can
  switch back without sending a code. Without SMS, phone/password remains usable.
- Reuse Better Auth's native phone/password endpoint and existing credential
  records. The API validates the shared schema, sanitizes forwarded peer headers,
  forwards secure session cookies, and returns generic errors without tokens or
  user details. No account-existence lookup is exposed to the signed-out UI.
- Password login never sends SMS, creates users/workspaces, or marks a phone
  verified. Phone verification remains an independent ownership proof.
- Private `administration.mjs --phone-passwords` accepts bounded JSON on stdin.
  It only adds hashed credentials to existing system administrators, atomically.
  Matching credentials are idempotent; conflicting credentials fail rather than
  silently resetting them. It never creates users or changes admin membership.
- No new migration, authentication dependency or public provisioning endpoint.
