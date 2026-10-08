# 0005 — Locales, agent icon and review policy

## Status

Accepted on 2026-10-08, from the decisions recorded with the UI prototype
(`docs/ui/prototype/audit-and-upgrade-plan.md`) and the standing rules.

## Context

The standing rules require Simplified Chinese (zh-CN) and English. The TABLE AI
design system and the approved prototype use Traditional Chinese with Hong Kong
usage (zh-Hant-HK) as the source language. The prototype also settled two
product questions: the agent icon is `sparkles`, and not every agent output needs
a human approval.

## Decision

- Ship three locales: `en`, `zh-CN` and `zh-HK`. Keys live in
  `apps/web/locales/{en,zh-CN,zh-HK}/*.json` and every user-facing string is
  added to all three in the same commit. The default follows the browser
  language, then the user's saved `users.locale`. Traditional strings use 「」
  quotation marks and `lang="zh-Hant-HK"` so the design tokens drop letter
  spacing.
- The agent icon is Lucide `sparkles`; people use `user`.
- Every agent has a review policy. The default is "always review": agent output
  waits in `needs_review` until a person approves. A workspace admin may relax
  the policy per agent to "review only when the agent asks" later; the data
  model carries the policy from Phase 2 so that no migration is needed.

## Consequences

Playwright runs each key flow in all three locales. Translation volume grows by
one column; zh-HK starts as a converted copy of zh-CN that a reviewer corrects.
The permission function `can` reads the agent's review policy when an agent
finishes work, so the rule has a table-driven test.
