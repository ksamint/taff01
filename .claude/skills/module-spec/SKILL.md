---
name: module-spec
description: Write or update the living product specification for one module in docs/spec/<module>.md, with numbered testable requirements, roles, non-functional limits, out-of-scope items and an acceptance table that names the tests. Use when the user asks for a PRD, spec, requirements, "is the PRD updated", or after a feature milestone lands, and once per repository to add SECURITY.md. The ADR keeps the decisions; the spec keeps the current contract.
metadata:
  author: ksamint
  origin: ksamint
  repository: ksamint/ksaskill01
  version: "1.0.0"
---

# Module spec

**Author:** ksamint · **Version:** 1.0.0

One living file per module, under 200 lines, that answers "what does this
module do today, for whom, and how do we know". It is the first layer of the
three-layer set used with coding agents: spec (what and why), ADR (how and
why that way), goal or task plan (ordered work). Users may say "spec" or
"prd" as shorthand.

## When to run

- The user asks for a PRD, spec or requirements, or asks whether one is
  current.
- A milestone changed user-visible behaviour, a permission, a limit or a
  route. The spec changes in the same commit as the behaviour.
- A repository has no `SECURITY.md` (once; see step 5).

## Procedure

1. **Collect sources before writing.** Read, in this order: the ADR for the
   module, the agent goal or plan, the milestone reports, the shared schemas
   (limits, defaults, formats), the permission table, the route list, the
   test titles (unit, integration, authorization matrix, e2e) and the public
   page or route handlers. Every number in the spec must come from one of
   these; never from memory.
2. **Write `docs/spec/<module>.md` from the template below.** Keep the
   section order. One requirement per bullet, numbered `XX-n.m` where `XX`
   is a two-letter module code, written in EARS form: "When <trigger>, the
   <system> shall <behaviour>" or "The <thing> shall <constraint>". Each
   must be checkable by a test or a probe; if it is not, it is a decision
   (ADR) or a wish (open decision), not a requirement.
3. **Map every requirement group to evidence.** The acceptance table names
   the test files and, where useful, case counts or the milestone that
   recorded a live run. A requirement with no evidence is listed with
   "no test" in the table, never left out.
4. **Keep the layers apart.** Reasons, alternatives and consequences stay in
   the ADR. Ordered work stays in the goal. Deployment state is one status
   line at the top. Link the ADR, goal, milestones and changelog at the end
   with relative links.
5. **`SECURITY.md` (once per repository).** At the repository root: where to
   report (private vulnerability reporting or a monitored mailbox the owner
   names; never an address the owner has not approved for publication),
   acknowledgement and fix targets, supported versions, scope in and out,
   rules for testing (own data only, no scanning or load on production,
   stop at first evidence), and the design facts a reviewer needs (token
   storage, secrets, the one permission function).
6. **Check and record.** Relative links resolve; requirement ids are unique;
   the file is under 200 lines; `git diff --check` is clean. Mention the spec
   in the README status block and in the milestone report, and add the
   same-commit rule to the agent instructions file if it is not there.

## Template

```markdown
# Spec: <module name>

Living product specification for <module> (ADR NNNN, milestones A–B). This
file states the current contract; the ADR holds the decisions. Change this
file in the same commit as the behaviour it describes.

Status: <implemented on main | released vX.Y.Z | deployed vX.Y.Z on date>.

## Users and roles
| Role | Can |

## Requirements
### <Group> (XX-1)
- XX-1.1 When <trigger>, the <system> shall <behaviour>.

## Non-functional
- budgets, limits, environment, migration policy

## Out of scope in v1

## Acceptance
| Requirement | Evidence |

## Open decisions

## Sources
```

## Do not

- Do not restate the ADR's reasoning or the goal's task list.
- Do not invent limits, defaults or counts; cite the schema or test.
- Do not describe planned behaviour as current. Planned items go under
  "Out of scope" or "Open decisions" with the owner's name on the decision.
- Do not exceed 200 lines; split a module before the spec grows past it.
