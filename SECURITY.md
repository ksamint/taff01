# Security policy

Taff is open source (MIT) and runs in production at https://taff.apuch.cn.
Reports about either are welcome.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository:
https://github.com/ksamint/taff01/security/advisories/new. Do not open a
public issue or pull request for a security problem, and do not post details
anywhere public before a fix is released.

Include what you found, how to reproduce it against a local stack
(`pnpm release:stack`, see `docs/deploy.md`), and the impact you expect. A
proof of concept helps; scanner output alone does not.

## What to expect

- Acknowledgement within 3 working days.
- Triage and a severity within 7 days.
- Fix target: 30 days for high and critical, 90 days otherwise. We will tell
  you when the fix is deployed and credit you in the changelog unless you ask
  otherwise.

## Supported versions

The latest tagged release, which is the one deployed in production, and
`main`. Older tags are not patched; upgrade to the latest release.

## Scope

In scope: this repository's code and the production deployment at
taff.apuch.cn, including sign-in and sessions, the permission function
`can()`, MCP tokens and OAuth, agent runs and approvals, shareholder share
links and watermarks, rate limits, injection of any kind, and secrets in the
repository, its history or its logs.

Out of scope: volumetric denial of service or rate-limit exhaustion against
production, social engineering, physical attacks, findings that need a
compromised device or browser, and vulnerabilities in third-party services we
call (SMS, mail) that are not caused by our use of them.

## Rules for testing

- Test against your own local stack. On production, use only accounts and
  data you created; never read, change or delete anyone else's.
- No automated scanning or load against production.
- Stop at the first evidence of a problem and report it; do not go further to
  prove impact.

Reports that follow these rules are welcome, and we will not pursue action
against good-faith research that stays within them.

## Design notes for reviewers

Agent and share tokens are stored only as `sha256(token + TOKEN_PEPPER)`;
raw tokens are shown once and never logged, and share tokens never appear in
a URL path. Secrets come only from the environment; `.env.example` lists every
variable with a dummy value. `packages/core` is the only database code and
every rule goes through `can()` with table-driven tests (`instruction_v0.md`,
`AGENTS.md`). If you find a credential in the repository or its history,
report it; we rotate it rather than rewrite history.
