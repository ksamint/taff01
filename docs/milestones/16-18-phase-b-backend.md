# M16–M18 — Phase B backend: relations, brief and suggestions, mind map

Goal: `docs/agent-goal-frontend-v2.md`; plan: `docs/frontend-v2-plan.md`
§4.3, §4.4, §5 (D6, D8, D9) and §6.1 M16–M18. Decisions: ADR 0015 (M16 and
M18 notes) and ADR 0016. Branch `phaseb-backend` from `m12-backend`; no
screen changed. The screens of M16–M18 build on this.

## What works

**Migrations** (both additive; a test, `packages/db/src/migrations.test.ts`,
allows only `CREATE TABLE`, `ADD COLUMN` with a default, `ADD CONSTRAINT`,
`CREATE INDEX` and `_audit` triggers, and checks every new table is
audited):

- `0024_m17_suggestions_ai`: table `suggestions`;
  `workspaces.ai_enabled boolean NOT NULL DEFAULT false` (no backfill).
- `0025_m18_mind_map`: tables `mind_nodes`, `mind_edges`, `mind_sources`,
  `mind_node_sources`.

**Relations graph (M16).** Pure `relationGraph()` with typed nodes
(workspace root, project, task, person, agent, CRM company and contact) and
edges (`contains`, `owns`, `works_on`, `supervises`, `depends_on`,
`client_of`, `stakeholder_of`, `contact_of`) in the people, dependencies,
org and CRM layers, deterministic order. CRM nodes need `contact:read` and
never carry phone or email. `GET /api/workspaces/:id/graph?projectId=&layers=`
and MCP `relations.get`.

**Brief, suggestions, Ask (M17).**

- `GET /api/brief?scope=workspace|all&workspaceId=` and MCP `brief.get`:
  per-project risk, slip, delivery and finance (admins only) from
  `buildPlanModel` through the timeline's own loader; counts (reviews
  waiting, pending grants and suggestions, blocked agents, due today, agents
  working); actions pointing at the review workspace, the grant decision and
  suggestions. Northwind on 2026-10-08 equals the M12 fixture (medium,
  blocked by NW-144, 69 % delivered, 40 % collected).
- Suggestions: agents propose a split (1–10 subtasks) or a reschedule over
  MCP `suggestions.create`; a person lists
  (`GET /api/workspaces/:id/suggestions`), applies
  (`POST /api/suggestions/:id/apply`, normal create or plan path, one
  transaction, all-or-nothing) or dismisses (`…/dismiss`).
- Ask taff: `POST /api/ask` → `{intent, items, text, source}` from a rules
  router (at_risk, blocked, needs_me, due_this_week, agent_status, unknown),
  rate-limited per person in Valkey (`ASK_RATE_LIMIT`, default 20/min).
- Model path built but off (ADR 0016): OpenAI-compatible `fetch` adapter,
  only with all three `AI_*` variables and an admin opt-in
  (`GET|PATCH /api/workspaces/:id/ai`); minimum context; key redacted.

**Mind map (M18).** `GET /api/workspaces/:id/mind`, node, edge and source
CRUD with versions, archive for admins, audited link removal, and
`POST /api/mind/nodes/:id/task` (validation task owned by the signed-in
person, due 23:59 local). Northwind seeds 21 nodes, 29 edges, 12 sources and
26 node-source links once, as notes with sources.

**Everywhere.** The five new tables are on the change whitelist, reach every
workspace member in realtime (guests included: they read the map and
suggestions), and invalidate the web families `graph`, `brief`,
`suggestions`, `workspace-ai` and `mind-map`. The three new MCP tools are in
`pnpm mcp:smoke` and on the MCP page in en, zh-HK and zh-CN.

## Environment

- New optional variables: `ASK_RATE_LIMIT` (default 20), `AI_BASE_URL`,
  `AI_API_KEY`, `AI_MODEL`. Production rule: the `AI_*` variables stay
  unset; `compose.prod.yaml` does not pass them to the API. No Compose,
  Docker or Caddy change.

## Missing

- The screens (timeline, relations, brief overlay, Ask, mind map).
- A `mind.get` MCP tool (optional in the plan; not shipped).
- Undo endpoints are the inverse calls (re-create a removed edge or link);
  there is no "undo apply" of a suggestion — the created subtasks or the
  plan are edited like any other.

## Validation

| Check | Result |
| --- | --- |
| `pnpm lint`, `typecheck`, `licence:check` | green |
| Full vitest suite on a fresh `taff_phaseb_test` | 66 files, 741 tests green |
| `pnpm build`, `build:server` | green |
| `pnpm perf:budget` | Today 192,485 B / 204,800 B (+49 B against `m12-backend`: the new invalidation family names and change-whitelist table names) |
| Seed suite | passes three times on one database |
| `pnpm e2e`, `pnpm mcp:smoke` | not run here (ports in use); `mcp-smoke.mts` typechecks |
