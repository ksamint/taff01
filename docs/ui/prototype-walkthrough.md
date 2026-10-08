# Prototype walkthrough

Walked `team-tasks.dc.html` before M3 UI implementation in English and Traditional
Chinese, including the mobile shell and desktop board. `agent-teammates.dc.html`
is an empty placeholder rather than a separate screen.

Rendered 88 captures with no browser errors: Today; Calendar day, week and month;
Projects board and list; task detail, running, review and blocked states; Inbox
All, Reviews and Blockers; Me; Team; all three agent profiles; MCP and client
details; notification preferences; search; quick add and field picker;
organization switch/create; invite; assignment/status/owner/due/time/priority
pickers; request changes; scoped permission grant; token confirmation; desktop
list, Inbox, command palette, quick add and organization menu; dark review.

Also exercised the actual language, Calendar and Week buttons. Inspected the
review checklist and source layout, agent permission controls, Inbox actions,
grant dialog and initial mobile/desktop composition. Screenshots and rendered
text were saved locally under `/tmp/taff-prototype-walk` for implementation QA;
they are temporary evidence rather than committed product assets.

Implementation uses real run events and artifacts rather than prototype timers.
The approved ADR review policy and expiring grants take precedence over the
prototype's simulated auto-approval and permanent grant controls. The app also
supports Simplified Chinese; all three app locales are verified in Playwright.
