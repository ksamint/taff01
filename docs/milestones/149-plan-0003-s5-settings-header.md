# Milestone 149 · Shared settings back header

Plan 0003 S5 · 2026-11-19 · local candidate.

- At 412 px, the production baseline used three back-link styles. Its
  summary administration form began at x=0.
- Notifications and eight standalone settings routes now share the
  Notifications back header. Summary administration, summary history, and
  digest history now inset their body content with the page gutter.
- Organizations keeps the validated OAuth return link, and desktop Me
  embeds keep their existing navigation.
- [Client navigation CN-5](../spec/client-navigation.md#settings-back-navigation-cn-5)
  records the contract. The phone coverage checks the nine routes in en,
  zh-CN, and zh-HK.

Validation: lint, typecheck, and test-ID contract (3/3) passed. Production
phone execution, updated pinned visual references, and the exact-tree
full gate are pending.
