# Taff agent instructions

Read `instruction_v0.md` before changing this repository. It contains the original
product, architecture, stack, security, performance, and checkpoint requirements.
The final line is the original repository creation request, not a recurring action.

Before substantive work, read and apply
`$HOME/.codex/skills/orchestrate-development/SKILL.md` when available.
Keep trivial work single-agent and preserve explicit user model choices.

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
behavior, missing work, open decisions and validation evidence in
`docs/milestones/`, then continue. The user reviews asynchronously.
The agent goal command lives in `docs/agent-goal.md`.
