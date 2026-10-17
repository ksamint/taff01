# 25 — Two-step sign-in and the designed landing look

Date: 2026-10-17 UTC. ADR 0020. Released as v0.2.8.

## Delivered
- Sign-in asks for username, mobile or email, then a password or the SMS action.
- SMS is sent only by Send code; code/password toggles preserve the account.
- Change returns to the account field with its value and focus retained.
- Enter/Tab flow, password/code focus and the hidden username pairing are covered.
- Sign-up remains one form. All three locales use the designed ink, underline
  fields, round button and system serif headline; desktop rotation keeps the form still.

## Validation
- Source `700ad4f0080070c6b0e4d67e9e28294749a316e9`; annotated tag `v0.2.8`.
- [PR #57](https://github.com/ksamint/taff01/pull/57) merged at its tested head; [PR CI](https://github.com/ksamint/taff01/actions/runs/39017862865) and [main CI](https://github.com/ksamint/taff01/actions/runs/39018484498) passed on attempt 1, without reruns.
- Lint/typecheck/licence, 1662 unit/integration tests, 267 browser cases in three
  locales and 166 visual comparisons passed. All 12 home references approved.
- Local browser 267/267; final production stack/checklist 32/32, retries 0.
- Three pinned clean images and official all-31-tool local MCP smoke passed.
- Main: Today JS 190.7 KiB; LCP en/CN/HK 636/692/676 ms; Lighthouse 98/100/100 each.
- Local: LCP 744/808/808 ms; Lighthouse 99/100/100 each.
- Review fixes restore account/SMS-action focus and wait for Me's seeded Brief
  badge before visual capture; no baseline or tolerance change.

## Deployment
- Live 22/22 incl. independent realtime and all-31-tool MCP; retries 0,
  zero page errors and cleanup failures. Production: https://taff.apuch.cn.
- Fresh zh-HK/en-US, signup, email/username login and mobile code/password
  toggle passed; zero SMS requests. Fresh live phone layout inspected.
- Native lock, verified private DB/env backups, scoped replacement; no migrations,
  AI_* unset, neighbors/PostgreSQL preserved. Prior images/data retained.
- Tag pushed; acceptance receipt and independent lock-release probe complete.
- Relay worktree path corrected before replacement; checkpoint in docs/deploy.md.

## Remaining
- Owner chose system fonts and browser fallback; no font file added.
- Desktop Chromium uses Songti SC. Real iPhone/Android font rendering and native
  Safari/Chrome saved-password autofill remain unverified.
- Verification signup personal-workspace history retained; no deletion requested.
