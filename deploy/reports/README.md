# Deploy reports

One file per deploy attempt, accepted or rolled back:
`<utc start of replacement, yyyymmddThhmmssZ>-<first 12 of the tree>.md`.
Written at closeout check 6 and committed with the release's docs commit
([runbook](../../docs/runbooks/deploy.md),
[closeout](../../docs/release-closeout.md)).

A report gives, for everything Taff owns on the host, the state before and
after:

- result (`accepted` or `rolled back`), release, commit and tree;
- the gate result bound to that tree (`pnpm check`);
- backups taken (sizes and hashes, never contents or paths to secrets);
- migration journal before and after;
- the replaced services, with short image identities;
- preserved services: counts of containers, volumes and networks reconciled;
- public and live checks, with counts;
- the rollback source kept, and whether a rollback happened;
- pending owner checks.

Never put secrets, tokens, full private identities, customer data or
environment values in a report. The private receipt on the host keeps those.

Releases before v0.2.25 are recorded in `docs/milestones/` and in
`docs/deploy.md`; they have no report here.
