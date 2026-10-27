# Public acceptance

The deploy agent's v0.2.0 harness, now versioned. Includes platform and restricted
membership, independent-browser realtime, the basic-function/MCP checklist, CRM,
timeline/relations, brief and mind-map checks. It runs only against the public
origin and the dedicated **Taff verification** workspace. Do not run concurrent
copies: checks restore the verification account's profile and agent settings.

Use the repository Node/pnpm versions. Supply `TAFF_VERIFY_USERNAME`,
`TAFF_VERIFY_PASSWORD`, and `TAFF_VERIFY_EMAIL` at runtime. With this Mac's existing
1Password wrapper, set each variable to the corresponding `op://` reference and
invoke `op-automation run -- node e2e/live/run.mjs`. The item is **Taff production
verification account** in **Codex Automation**. Never store resolved values.

Also supply these runtime inputs:

- `RELEASE_BASE_URL=https://taff.apuch.cn` (required explicitly).
- `TAFF_AUTH_METHODS_BASELINE`: JSON from the pre-upgrade `/api/auth/methods`.
- `TAFF_VERIFY_SSH_TARGET` and `TAFF_VERIFY_API_ID`: the authorized SSH alias and
  current API container ID for the scoped recipient email-proof helper. The
  helper reads only a freshly generated verification recipient's mail proof.
- `RELEASE_REPORT_DIR`: optional private parent directory; each invocation creates
  a fresh `run-*` child, including discovery and startup failures.

Discovery without credentials: `RELEASE_BASE_URL=https://taff.apuch.cn node
 e2e/live/run.mjs --list`. Target regressions with `--grep 'keyboard|evidence|Restricted'`
and `--repeat-each=3 --project=phone-en`. Failed deploy checks get one explicit
retry under the deployment goal; the default here is zero automatic retries so
first-attempt evidence is retained. Within a case, a setup page load that times out
or drops is repeated once and recorded as a `retry|` check; writes never repeat. Targeting flags are allowlisted; trace, reporter,
config, worker and debug overrides are rejected. Viewport-specific brief flows are
selected by project, giving 147 applicable cases without runtime skips. The v0.2.1
feature checks add CRM membership/roles, milestone CRUD and keyboard movement,
phone detail scrolling and AI-off settings, desktop snoozed items/agent profile,
and versioned split/reschedule Undo. The existing proposal case also verifies
human-owner REST creation, member attribution in Brief/Ask and the proposal sheet,
then apply/Undo/dismiss. Human proposals and generated children are journaled;
cleanup dismisses only pending proposals on tasks owned by the current run.
Six delayed-font Timeline setup regressions
are included. Created grants and milestones are journaled
for cleanup; existing Verification agent settings are restored.

Traces, screenshots, videos and raw error context are disabled. The mandatory
preload and safe reporter suppress diagnostics that can contain displayed tokens,
passwords, invitation fragments or live DOM. Reports contain case status, sanitized
source locations and entity/cleanup journals. Do not enable debug logging or
replace the reporter for live runs. No auth state, cookies, reports or private env
files belong in Git. Fresh recipient passwords and tokens exist only in memory.

Only entities journaled for the current run are cleaned up through supported
APIs; archival history and accepted invitations remain. No demo seed or real-user
workspace is used. The public rate limit is never flooded and SMS delivery remains
a separate manual check, as the deployment runbook requires.
