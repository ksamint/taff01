# Taff agent instructions

Read `instruction_v0.md` before changing this repository. It contains the original
product, architecture, stack, security, performance, and checkpoint requirements.
The final line is the original repository creation request, not a recurring action.

Use the lean-delivery skill for every task. Use orchestrate-development only for
multi-day features.

At the start of local Codex work on the M1 Pro, run
`python3 /Users/gf-m1pro/.codex/skills/op-automation/scripts/check_access.py`.
Before credential-dependent work, read
`/Users/gf-m1pro/.codex/skills/op-automation/SKILL.md` and use the existing
`op-automation` wrapper. If access fails, report the diagnostic's sanitized
blocker without changing permissions or requesting repeated desktop sign-in.
Never commit secrets.

For a requested brand treatment, resolve its latest guide, tokens, and official
assets through https://apuch.art/ before styling.

There are no blocking review gates. At each milestone, push, record working
behavior, missing work, open decisions and validation numbers (≤ 40 lines) in
`docs/milestones/`, then continue. The user reviews asynchronously.
The current goal is the user's latest command.

Access changes: when a role, scope or permission tier changes, list every
operation that issues, extends or re-enables access (approve, exchange,
refresh, restore/undo, list, revoke) and test each with the lowest role that
can reach it, including after that role loses the authority.

Goals and prompts for deploy or closeout may only require evidence that
`docs/release-closeout.md` names a source for; reference that file instead of
restating the procedure. A requirement without a recorded source is a bug in
the prompt, not a blocker for the operator.
