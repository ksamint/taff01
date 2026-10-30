# Project collection correlation — local acceptance

Project list totals incorrectly returned zero for real receipts: Drizzle removed
outer column qualification in the scalar payment subquery, binding its predicates
to inner payment columns. Explicit projects table references now correlate both
workspace and project; exact PostgreSQL numeric sums remain decimal strings.

The signed project workflow failed on real PostgreSQL18 before the fix (expected
0.30, received0). Its regression also creates another project with99.99 receipts
and checks the target remains0.10 before the existing0.20 addition. After the fix,
47 tests across runs, planning and timeline integration suites passed against a
task-owned PostgreSQL18.4 database. Core typecheck, changed-file Biome and diff
checks passed. Production web and server/runtime builds passed.

Actual local browser acceptance used the production web build, API, PostgreSQL18.4
and Valkey9 with synthetic data only. All12 selected existing login, project
profile, finance visibility and agent permission cases passed across en, zh-CN
and zh-HK. The initial batch had4 failures from the unchanged shared login rate
counter; paced reruns passed all failed cases. No rate limiter was changed.
Additional ego-browser flows passed all3 localized projects.manage allow/deny
controls, exact MCP money/deadline/progress values, financial redaction immediately
after revocation, and native project updates with live finance cache reconciliation.

Evidence logs and browser scripts/screenshots are retained outside the source in
/Users/af/cpro01/taff01-natural-release-20261030. Full release8/8 jobs and production
acceptance were not run here; their gates remain unchanged. No production data,
capability grants, credentials or shared infrastructure changed.
