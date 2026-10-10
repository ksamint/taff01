# Username login and administration checkpoint

The sign-in form accepts email or username, and signup offers an optional
username. English, Simplified Chinese and Hong Kong Chinese translations share
the existing form and design tokens. Email and SMS login remain available.

The additive 0020 migration adds unique normalized usernames and private
system-admin state. Protected real memberships grant system administrators
access across current and future organizations. The private provisioning CLI
creates requested organizations, phone-admin identities and one scoped
username/password organization administrator through runtime input; it never
sends an SMS or marks an unverified phone verified.

Targeted API checks passed 57 cases and type checking. Seven new contract,
permission and CLI cases passed locally. Six new PostgreSQL cases cover
credential login, identity preservation, concurrent provisioning and future
workspace creation, scope, protected memberships, conflict rollback and private
audit. Nine new browser cases cover username signup/sign-in, email compatibility
and validation in all three locales. The unchanged nine-command gate, all three
Lighthouse runs and default three-run LCP checks are required before pushing
this checkpoint; exact-commit CI precedes the production upgrade.

The first isolated run stopped at seed signup because both membership triggers
used an ambiguous `ORDER BY id`. The migration now qualifies source-table IDs;
fresh database signup, promotion and future-workspace coverage must pass before
release. Failed-run evidence is retained separately from acceptance evidence.

Production acceptance checks the private CLI against the immutable API image,
the scoped administrator's secure session and organization access, the two
configured system-admin memberships, existing email/task/realtime behavior and
neighbor isolation. Actual phone OTP login still requires its holder; deployment
does not send test messages automatically. Private operator evidence records
the exact release, test results, image identities and runtime setup result.

M9 and `v0.1.0` remain open. See [the decision](../adr/0010-username-and-system-administration.md),
[deployment operations](../deploy.md) and [development review](../reviews/2026-10-09-development-review.md).
