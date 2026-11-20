# Reading: structure practices, and a review of the platform research

Written in this repository on 2026-11-20 from the official documentation of
Linear, Asana and Basecamp's Shape Up, and from Taff's own code. Nothing here
was tested by hand in those products.

## 1. Structure practices beyond Gantt

| Practice | Source | What it would address in Taff |
| --- | --- | --- |
| Projects split into milestones | [Linear conceptual model](https://linear.app/docs/conceptual-model) | The missing level between project and task. See the correction in section 3. |
| Initiatives and sub-initiatives above projects | [Linear](https://linear.app/changelog/2025-07-10-sub-initiatives) | A level above projects, grouping by outcome. |
| Portfolios that nest | [Asana](https://help.asana.com/s/article/asana-hierarchy) | Reporting several projects together. |
| Cycles | Linear cycles per team; [Shape Up](https://basecamp.com/shapeup) six-week cycles | A time view beside the Gantt: what is being done in this period. |
| Health updates: on track, at risk, off track | [Linear](https://linear.app/docs/initiative-and-project-updates) | Taff computes risk; nobody states it. |
| Hill chart: unknown, known, done | [Shape Up, Show Progress](https://basecamp.com/shapeup/3.4-chapter-13) | Better than percent complete where the hard part is working out what to do. A dot that does not move is a raised hand. |
| Appetite, not estimate | [Shape Up glossary](https://basecamp.com/shapeup/4.5-appendix-06) | Agent runs already carry a limit of time and cost. |
| One task in several projects | [Asana object hierarchy](https://developers.asana.com/docs/object-hierarchy) | A Taff task has one project; sectors work around it with labels. |
| A limit on subtask depth | Asana allows five levels and advises against depth | Taff's schema has no limit. |

## 2. Review of the platform research against Taff's code

What it gets right: sorting products by the job they do; weighting client
delivery heavily, since Taff already holds contract amount, payments, client
company and a commercial stage; and the point that people working with agents
is no longer a distinction on its own.

Where it is weak: it never saw Taff; it gives twenty products a paragraph
each; its sources are mostly vendor feature pages; it has no method.

Its five proposed distinctions, checked against the code at `8d03faa` plus
this branch:

| Question | Taff today | Evidence |
| --- | --- | --- |
| Acceptance | Partly | Deliverables and a review with three fixed checks (`review_checks`). A task has no acceptance-criteria field. |
| Accountability | Strong | Owner, worker, supervisor, reviewer; an `activity` row for every write. |
| Economics | Partly | `runs.cost_micros` is recorded and a run stops at the agent's `max_cost_micros`. Cost is not added up per task or project. No time tracking, no cost of people. |
| Interoperability | Strong | Any MCP client connects through OAuth and passes the same `can()` as a person. |
| Control | Mostly | Runs pause; permission requests wait for a person; history is kept. |

The gap that matters most: Taff knows the money coming in and not the cost
going out, so it cannot say whether a project is profitable.

## 3. Corrections accepted from the research

- **Goal, initiative and portfolio are three things.** An earlier note here
  put Asana portfolios under "a level for goals". A goal is a result with a
  measure; an initiative is an effort; a portfolio is a managed collection.
- **A phase is a span; a milestone is a point.** An earlier recommendation was
  "milestones as phases". Taff's milestone is a name and a date, so it is a
  point. Taff also uses "stage" for the commercial pipeline, so the new thing
  is a **phase**, and a phase may end in a milestone.

## 4. Open decisions these readings feed

- Add a phase level between project and task.
- Add a level above projects (goal, initiative or portfolio), and which.
- Add a person's health update beside computed risk.
- Add the cost side: time, cost of people, cost of agent runs per project.
- Whether execution rules stay fixed in code or become explicit and visible.
