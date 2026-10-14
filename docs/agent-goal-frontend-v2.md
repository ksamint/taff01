# Agent goal: replace the frontend with prototype v2

> Status 2026-10-14: planned, not started. The user delegated every
> decision: the agent never stops to ask, and develops until the new
> frontend is live and working on `https://taff.apuch.cn` for review (the local
> agent deploys; see `docs/agent-goal-deploy-frontend-v2.md`), with
> basic functions and MCP first.

Paste everything below this line as the goal for a coding agent working in
`ksamint/taff01`. It is self-contained; the files it names are in the
repository.

---

Replace Taff's web frontend with the approved prototype v2 in
`docs/ui/prototype-v2/`, and add the backend it needs: CRM, planning
timeline, relations graph, AI brief and mind map. Ship every screen on phone
and desktop in en, zh-CN and zh-HK with real data, and keep it live on
`https://taff.apuch.cn`. Basic functions and MCP come first: get them
working and deployed live (release R1, plan §6.0) before the CRM screens,
timeline, graph, brief and mind map, then redeploy after each of those. Work on a branch from
`main` per milestone, push often, and never wait for approval between steps:
the user reviews asynchronously.

Read first, in this order:

1. `AGENTS.md` and `instruction_v0.md`.
2. **`docs/frontend-v2-plan.md`.** This is the plan: line maps, the review,
   the do-not-port list, backend design, decisions and milestones.
3. `docs/ui/prototype-v2/README.md` and `DEPLOY.md`.
4. The standing rules in `docs/agent-goal.md`.
5. `docs/ui/README.md`, `docs/milestones/10-ui-parity.md` (the port method)
   and `09-hardening-and-handoff.md`.
6. `docs/adr/*.md`, `docs/realtime.md`, `docs/calendar.md` and
   `docs/planning.md`.

Read each package's installed docs under `node_modules` before using an API.

To view the prototype, serve `docs/ui` statically and open
`/prototype-v2/Team%20Tasks.dc.html`. Then click 開始 and 進入工作區, and walk
every screen in both languages and both themes before porting it.

## Standing rules

These override anything else:

- **Architecture.**
  - `packages/core` is the only code that touches the database.
  - REST and MCP are thin adapters.
  - `packages/schemas` (Zod) is the single definition of every shape.
  - Every mutation runs in one transaction with an `activity` row and
    `NOTIFY taff_changes`, through the existing `_audit` trigger. Every new
    table therefore has `id uuid` and `workspace_id`.
  - Every permission goes through `can()`, with table-driven tests.
  - Agents get no code path a person lacks. Agent output and agent proposals
    wait for a person.
- **Prototype data layer.** `docs/ui/prototype-v2/db/schema.sql` and
  `taff-store.js` are concept input only. Port their ideas into Drizzle
  migrations shaped like the existing ones, as described in plan §2.5 and §4.
  Never apply `schema.sql`.
- **Do-not-port list.** The prototype wins for visuals, not behaviour. Fix
  everything in plan §2.4 during the port, including:
  - the count mismatch;
  - home blocking deep links;
  - no desktop toast;
  - snapshot undo;
  - fake agent output;
  - hard-coded clock, user and currency;
  - simplified characters in Traditional strings;
  - text below 12 px and targets below 44 px;
  - no keyboard alternatives.
- **Stack.** The stack is fixed (see `docs/agent-goal.md`). Keep Schedule-X
  for the calendar. Use hand-rolled SVG for the timeline, graph and mind map,
  with no graph or Gantt library. Any client dependency over 20 KB gzipped
  needs an ADR. Licences must be MIT, Apache-2.0, BSD or ISC; state the licence
  of each new dependency in its commit.
- **Design.** Tokens come only from `apps/web/src/styles/tokens.css`. Use
  Lucide icons, with `sparkles` for agents. Gold covers at most 8 % of a view.
  Floor:
  - 44 px targets;
  - 12 px minimum text;
  - visible focus;
  - names on icon-only buttons;
  - dialogs trap and restore focus;
  - a keyboard alternative to every drag.
- **i18n.** Every string goes through i18next, with all three locales in the
  same commit. zh-HK is the source Chinese; zh-CN is derived and reviewed.
  Dates, numbers and currency go through `Intl` in the user's locale and time
  zone.
- **Performance.**
  - Mobile Today initial JS ≤ 200 KiB gzipped; about 8.6 KB of headroom is
    left, so new areas must be lazy chunks.
  - LCP ≤ 2 s in each locale.
  - Lighthouse ≥ 90.
- **Tests.**
  - Tests ship with the code.
  - Keep existing test ids and role names where the meaning survives.
  - Change selectors, never behaviour.
  - Never skip, disable or quarantine a test.
  - Replace visual baselines screen by screen, generated on CI's Chromium
    through `visual-baselines.yml`, and commit each beside its prototype
    reference in the milestone report.

## Order of work

Follow plan §6.0 and §6.1:

| Step | Scope |
| --- | --- |
| **Phase A** | |
| M11 (lean) | ADR 0014, `docs/ui/README.md` for v2, `ui:prototype-shots --v2` references, the strings table |
| M12 | Planning and CRM backend, with seed |
| M13 | Shell, 4-tab navigation, Today, Me, Inbox, the MCP page, signed-out landing. Its first commit extracts the ~35 inline mutations into `src/lib` hooks with no UI change. |
| M14 | Projects, task detail with contacts, desktop calendar, search |
| **R1** | Publish the release candidate (checklist of plan §6.0 passing locally in production mode); the local agent deploys it live |
| **Phase B** | |
| M15 | CRM screens |
| M16 | Timeline and relations graph |
| M17 | AI brief and suggestions, rules-based |
| M18 | Mind map |
| **Phase C** | |
| M19 | Remove v1 code and baselines, regenerate font subsets, accessibility and i18n QA, release and deploy `v0.2.0` |

Each Phase B milestone publishes a new candidate when green; the local agent
redeploys it.

## Decisions

The user delegated every decision. Build the defaults in plan §5, record
them in ADRs (the next number is 0014), and never stop to ask; the user
redirects asynchronously.

Hard limits, followed without asking:

- Archive, never hard-delete; production data is never dropped or rewritten,
  and migrations stay additive.
- Never send workspace data to a third-party model (the AI path ships
  disabled).
- Never commit or print secrets or tokens.
- Only allowed licences.
- No stack swap without an ADR.

When the local agent reports a failed deploy check (`Blocked:` under the
candidate), fix forward and publish a new candidate.

## Validation

Run this before every push; all of it must be green:

```
pnpm lint && pnpm typecheck && pnpm licence:check && pnpm test && pnpm build
&& pnpm build:server && pnpm perf:budget && pnpm e2e && pnpm mcp:smoke
```

Before each milestone report, also run:

- `pnpm perf:lcp` for each of `LCP_LOCALE=en`, `zh-CN` and `zh-HK`;
- `pnpm perf:lighthouse`;
- the visual suite.

`.github/workflows/ci.yml` must stay green on every merge.

## Deployment (handed to the local agent)

You do not deploy: this environment has no access to the production host. A
local agent with the SSH connection deploys, following
`docs/agent-goal-deploy-frontend-v2.md`.

Your side of the handoff, for R1, each Phase B milestone and `v0.2.0`:

1. Merge the milestone to `main` with both CI runs green.
2. Run the release's acceptance checklist against a local production-mode
   stack: `compose.prod.yaml`, or `pnpm build` plus `pnpm build:server`, with
   the production env shape. The checklist is plan §6.0 plus the milestone's
   new flows, and includes a real `@modelcontextprotocol/client` round trip
   that calls every tool.
3. Append `### Frontend v2 release candidate <R1|M15|…|v0.2.0> — <date>` to
   `docs/deploy.md` with every item that file's "How releases are handed over"
   lists:
   - the SHA and CI links;
   - the validation numbers;
   - the migrations, each marked additive, with backfill row counts;
   - new env variables and their production rule (never a secret value);
   - Compose, Docker and Caddy changes;
   - the acceptance checklist and your local production-mode result.
4. Push that as a docs-only commit to `main`, then continue with the next
   milestone without waiting.

Keep every migration additive: no `DROP`, `TRUNCATE`, `DELETE`, renames or
rewrites of user data. Keep the host layout, route file, DNS and database
role unchanged. If the local agent writes a `Blocked:` note under a
candidate, fix it first, then publish a new candidate.

## Milestone protocol

There are no gates. Finish a milestone, validate, push, and write
`docs/milestones/NN-title.md` with:

- what works;
- what is missing;
- open decisions;
- validation numbers;
- app captures beside the v2 prototype captures.

Then continue with the next milestone.
