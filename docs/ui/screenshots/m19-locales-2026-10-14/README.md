# M19 locale route captures — 2026-10-14

186 seeded application captures: 31 route/view states × three locales × phone
(390×844) and desktop (1280×800), light theme. This reruns the 126 M9
captures (21 states) and adds the ten frontend v2 states from plan §7:
project list, timeline, stakeholders, relations and mind views, companies,
company detail, contacts, contact detail and the AI brief (`/brief` on phone,
`/me?tab=brief` on desktop). Source: `origin/main` `98cf3c6` plus the M19
accessibility fixes on branch `m19-a11y`; seed date 2026-10-08; external
SMS/SMTP disabled. Command:

```
node --env-file=.env scripts/ui/app-shots.mjs docs/ui/screenshots/m19-locales-2026-10-14
```

`manifest.json` records each route, viewport, file and SHA-256; every PNG's
pixel size matches its viewport. Seeded user content stays in its original
language when the interface locale changes. The brief's date line comes from
the server clock, not the frozen capture clock. Light and dark themes are both
covered by the separate accessibility audit (`scripts/ui/a11y-audit.mjs`).

| View | en | zh-CN | zh-HK |
| --- | --- | --- | --- |
| agent | [phone](phone-en-agent.png) / [desktop](desktop-en-agent.png) | [phone](phone-zh-CN-agent.png) / [desktop](desktop-zh-CN-agent.png) | [phone](phone-zh-HK-agent.png) / [desktop](desktop-zh-HK-agent.png) |
| brief | [phone](phone-en-brief.png) / [desktop](desktop-en-brief.png) | [phone](phone-zh-CN-brief.png) / [desktop](desktop-zh-CN-brief.png) | [phone](phone-zh-HK-brief.png) / [desktop](desktop-zh-HK-brief.png) |
| calendar | [phone](phone-en-calendar.png) / [desktop](desktop-en-calendar.png) | [phone](phone-zh-CN-calendar.png) / [desktop](desktop-zh-CN-calendar.png) | [phone](phone-zh-HK-calendar.png) / [desktop](desktop-zh-HK-calendar.png) |
| companies | [phone](phone-en-companies.png) / [desktop](desktop-en-companies.png) | [phone](phone-zh-CN-companies.png) / [desktop](desktop-zh-CN-companies.png) | [phone](phone-zh-HK-companies.png) / [desktop](desktop-zh-HK-companies.png) |
| company-detail | [phone](phone-en-company-detail.png) / [desktop](desktop-en-company-detail.png) | [phone](phone-zh-CN-company-detail.png) / [desktop](desktop-zh-CN-company-detail.png) | [phone](phone-zh-HK-company-detail.png) / [desktop](desktop-zh-HK-company-detail.png) |
| contact-detail | [phone](phone-en-contact-detail.png) / [desktop](desktop-en-contact-detail.png) | [phone](phone-zh-CN-contact-detail.png) / [desktop](desktop-zh-CN-contact-detail.png) | [phone](phone-zh-HK-contact-detail.png) / [desktop](desktop-zh-HK-contact-detail.png) |
| contacts | [phone](phone-en-contacts.png) / [desktop](desktop-en-contacts.png) | [phone](phone-zh-CN-contacts.png) / [desktop](desktop-zh-CN-contacts.png) | [phone](phone-zh-HK-contacts.png) / [desktop](desktop-zh-HK-contacts.png) |
| digest-detail | [phone](phone-en-digest-detail.png) / [desktop](desktop-en-digest-detail.png) | [phone](phone-zh-CN-digest-detail.png) / [desktop](desktop-zh-CN-digest-detail.png) | [phone](phone-zh-HK-digest-detail.png) / [desktop](desktop-zh-HK-digest-detail.png) |
| digests | [phone](phone-en-digests.png) / [desktop](desktop-en-digests.png) | [phone](phone-zh-CN-digests.png) / [desktop](desktop-zh-CN-digests.png) | [phone](phone-zh-HK-digests.png) / [desktop](desktop-zh-HK-digests.png) |
| inbox | [phone](phone-en-inbox.png) / [desktop](desktop-en-inbox.png) | [phone](phone-zh-CN-inbox.png) / [desktop](desktop-zh-CN-inbox.png) | [phone](phone-zh-HK-inbox.png) / [desktop](desktop-zh-HK-inbox.png) |
| mcp | [phone](phone-en-mcp.png) / [desktop](desktop-en-mcp.png) | [phone](phone-zh-CN-mcp.png) / [desktop](desktop-zh-CN-mcp.png) | [phone](phone-zh-HK-mcp.png) / [desktop](desktop-zh-HK-mcp.png) |
| me | [phone](phone-en-me.png) / [desktop](desktop-en-me.png) | [phone](phone-zh-CN-me.png) / [desktop](desktop-zh-CN-me.png) | [phone](phone-zh-HK-me.png) / [desktop](desktop-zh-HK-me.png) |
| notifications | [phone](phone-en-notifications.png) / [desktop](desktop-en-notifications.png) | [phone](phone-zh-CN-notifications.png) / [desktop](desktop-zh-CN-notifications.png) | [phone](phone-zh-HK-notifications.png) / [desktop](desktop-zh-HK-notifications.png) |
| organization-directory | [phone](phone-en-organization-directory.png) / [desktop](desktop-en-organization-directory.png) | [phone](phone-zh-CN-organization-directory.png) / [desktop](desktop-zh-CN-organization-directory.png) | [phone](phone-zh-HK-organization-directory.png) / [desktop](desktop-zh-HK-organization-directory.png) |
| organizations | [phone](phone-en-organizations.png) / [desktop](desktop-en-organizations.png) | [phone](phone-zh-CN-organizations.png) / [desktop](desktop-zh-CN-organizations.png) | [phone](phone-zh-HK-organizations.png) / [desktop](desktop-zh-HK-organizations.png) |
| project-detail | [phone](phone-en-project-detail.png) / [desktop](desktop-en-project-detail.png) | [phone](phone-zh-CN-project-detail.png) / [desktop](desktop-zh-CN-project-detail.png) | [phone](phone-zh-HK-project-detail.png) / [desktop](desktop-zh-HK-project-detail.png) |
| project-list | [phone](phone-en-project-list.png) / [desktop](desktop-en-project-list.png) | [phone](phone-zh-CN-project-list.png) / [desktop](desktop-zh-CN-project-list.png) | [phone](phone-zh-HK-project-list.png) / [desktop](desktop-zh-HK-project-list.png) |
| project-mind | [phone](phone-en-project-mind.png) / [desktop](desktop-en-project-mind.png) | [phone](phone-zh-CN-project-mind.png) / [desktop](desktop-zh-CN-project-mind.png) | [phone](phone-zh-HK-project-mind.png) / [desktop](desktop-zh-HK-project-mind.png) |
| project-relations | [phone](phone-en-project-relations.png) / [desktop](desktop-en-project-relations.png) | [phone](phone-zh-CN-project-relations.png) / [desktop](desktop-zh-CN-project-relations.png) | [phone](phone-zh-HK-project-relations.png) / [desktop](desktop-zh-HK-project-relations.png) |
| project-stakeholders | [phone](phone-en-project-stakeholders.png) / [desktop](desktop-en-project-stakeholders.png) | [phone](phone-zh-CN-project-stakeholders.png) / [desktop](desktop-zh-CN-project-stakeholders.png) | [phone](phone-zh-HK-project-stakeholders.png) / [desktop](desktop-zh-HK-project-stakeholders.png) |
| project-timeline | [phone](phone-en-project-timeline.png) / [desktop](desktop-en-project-timeline.png) | [phone](phone-zh-CN-project-timeline.png) / [desktop](desktop-zh-CN-project-timeline.png) | [phone](phone-zh-HK-project-timeline.png) / [desktop](desktop-zh-HK-project-timeline.png) |
| projects | [phone](phone-en-projects.png) / [desktop](desktop-en-projects.png) | [phone](phone-zh-CN-projects.png) / [desktop](desktop-zh-CN-projects.png) | [phone](phone-zh-HK-projects.png) / [desktop](desktop-zh-HK-projects.png) |
| quick-add | [phone](phone-en-quick-add.png) / [desktop](desktop-en-quick-add.png) | [phone](phone-zh-CN-quick-add.png) / [desktop](desktop-zh-CN-quick-add.png) | [phone](phone-zh-HK-quick-add.png) / [desktop](desktop-zh-HK-quick-add.png) |
| review | [phone](phone-en-review.png) / [desktop](desktop-en-review.png) | [phone](phone-zh-CN-review.png) / [desktop](desktop-zh-CN-review.png) | [phone](phone-zh-HK-review.png) / [desktop](desktop-zh-HK-review.png) |
| review-deliverable | [phone](phone-en-review-deliverable.png) / [desktop](desktop-en-review-deliverable.png) | [phone](phone-zh-CN-review-deliverable.png) / [desktop](desktop-zh-CN-review-deliverable.png) | [phone](phone-zh-HK-review-deliverable.png) / [desktop](desktop-zh-HK-review-deliverable.png) |
| review-page | [phone](phone-en-review-page.png) / [desktop](desktop-en-review-page.png) | [phone](phone-zh-CN-review-page.png) / [desktop](desktop-zh-CN-review-page.png) | [phone](phone-zh-HK-review-page.png) / [desktop](desktop-zh-HK-review-page.png) |
| search | [phone](phone-en-search.png) / [desktop](desktop-en-search.png) | [phone](phone-zh-CN-search.png) / [desktop](desktop-zh-CN-search.png) | [phone](phone-zh-HK-search.png) / [desktop](desktop-zh-HK-search.png) |
| task-detail | [phone](phone-en-task-detail.png) / [desktop](desktop-en-task-detail.png) | [phone](phone-zh-CN-task-detail.png) / [desktop](desktop-zh-CN-task-detail.png) | [phone](phone-zh-HK-task-detail.png) / [desktop](desktop-zh-HK-task-detail.png) |
| task-page | [phone](phone-en-task-page.png) / [desktop](desktop-en-task-page.png) | [phone](phone-zh-CN-task-page.png) / [desktop](desktop-zh-CN-task-page.png) | [phone](phone-zh-HK-task-page.png) / [desktop](desktop-zh-HK-task-page.png) |
| team | [phone](phone-en-team.png) / [desktop](desktop-en-team.png) | [phone](phone-zh-CN-team.png) / [desktop](desktop-zh-CN-team.png) | [phone](phone-zh-HK-team.png) / [desktop](desktop-zh-HK-team.png) |
| today | [phone](phone-en-today.png) / [desktop](desktop-en-today.png) | [phone](phone-zh-CN-today.png) / [desktop](desktop-zh-CN-today.png) | [phone](phone-zh-HK-today.png) / [desktop](desktop-zh-HK-today.png) |
