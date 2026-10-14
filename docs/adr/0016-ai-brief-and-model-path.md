# ADR 0016: rules-first brief and Ask taff, with a disabled model path

Status: accepted, 2026-10-14 (milestone M17). Decision D6 of
`docs/frontend-v2-plan.md`.

## Context

Prototype v2 shows an AI brief, agent suggestions with one-tap Approve and
Grant, an "Ask taff" box that calls `window.claude.complete` with the whole
portfolio as JSON, and a static "AI insight" on the mind map. Plan §2.4
item 12 forbids porting this fake intelligence: agent output waits for a
person, and nothing pretends to be a model. D6 says the rules-based brief and
Ask ship, the model path is built but off, and no workspace data leaves the
system until the user configures it.

## Decision

**Brief.** `buildBrief()` (`packages/core/src/brief.ts`) is a pure function
over the caller's memberships only. Each project's risk is
`buildPlanModel(plan).risk`, from the same `planSource()` the timeline uses,
so brief numbers equal the timeline's and the M12 fixtures (a unit test
proves it for Northwind on 2026-10-08). It returns codes, ids and numbers:
risk level and reason codes, slip, delivery %, finance only with
`finance:read` (never for agents), counts, and actions that point at existing
records — a review opens the review workspace, a grant goes through the
grant-decision endpoint, a suggestion is applied or dismissed by a person.
There is no one-tap bypass. `GET /api/brief?scope=workspace|all&workspaceId=`
and the MCP tool `brief.get` (token workspace, `tasks:read`) expose it.

**Suggestions.** Agents propose (`suggestions.create`, worker of the task
with `tasks:write` and the `tasks.write` capability); a person with
`suggestion:decide` (the task's owner or an admin) applies or dismisses.
Applying runs the normal core paths inside one transaction: a split creates
subtasks through the task-create path (`task:create`, open parent, no active
run), a reschedule writes the plan through the plan path (`task:schedule`).
If the normal path refuses, the whole apply rolls back and the suggestion
stays pending. Suggestions are never deleted.

**Ask taff.** `POST /api/ask` maps the question to an intent with a small
rules router (the concept of the prototype's `canned()`, in English and both
Chinese scripts): `at_risk`, `blocked`, `needs_me`, `due_this_week`,
`agent_status`, else `unknown`. The answer is `{intent, items, text, source}`
built from the brief data; `unknown` answers nothing instead of inventing.
It is rate-limited per person in Valkey (`ASK_RATE_LIMIT`, default 20 per
minute; a failed count refuses). There is no `ask` MCP tool.

**Model path (off).** `packages/core/src/ai-provider.ts` is a provider-neutral
adapter for any OpenAI-compatible `POST {AI_BASE_URL}/chat/completions`, with
plain `fetch` and no SDK or new dependency. It is used only when:

1. `AI_BASE_URL`, `AI_API_KEY` and `AI_MODEL` are all set (otherwise no
   provider object exists), and
2. the question names one workspace whose `workspaces.ai_enabled` is on. Only
   admins can switch it (`PATCH /api/workspaces/:id/ai`, `workspace:manage`);
   it defaults to off. A question across all memberships never uses it.

When used, the model receives a fixed instruction, the question, the date,
the intent and the structured items (codes, ids and numbers, without the
workspace id) — no titles, names, contacts or finance. Its reply becomes
`text` with `source: "model"`; any failure falls back to the rules answer.

**Keys.** The key stays in the adapter's closure; it is never returned,
logged or put in an error (network errors are dropped). The API logger
redacts `apiKey`, `AI_API_KEY` and authorization headers at every level
(`apps/api/src/logger.ts`, with a test). `.env.example` lists the three
variables empty; `.env.production.example` lists them commented out with the
rule that production keeps them unset, and `compose.prod.yaml` does not pass
them to the API container, so enabling the path in production is a
deliberate configuration change, not an accident.

## Consequences

- With the default configuration no workspace data leaves the system; the
  brief, Ask and suggestions work entirely on rules and the database.
- A provider can be chosen later without code changes, as long as it speaks
  the OpenAI-compatible chat API. The choice and the decision to send data
  remain the user's (D6).
- Migration `0024_m17_suggestions_ai` is additive: the `suggestions` table
  (composite foreign keys, CHECKs, `_audit` trigger) and
  `workspaces.ai_enabled boolean NOT NULL DEFAULT false`.
- The mind map's prototype "AI insight" ships as a person's note (M18), not as
  model output.
