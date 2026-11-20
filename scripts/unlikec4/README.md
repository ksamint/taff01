# unlikec4

A small engine for understanding a codebase: **one ontology, one mapping,
many perspectives**. It was built in taff01 and is meant to move into tda01,
so nothing in this folder may import from outside it
(`scripts/architecture/architecture.test.ts` checks that).

## The three parts

| Part | What it is | In the document |
| --- | --- | --- |
| Ontology | Every kind of thing, ranked into tiers, with its kind and what contains it | `tiers`, `things`, `rolesAt` |
| Mapping | Where each thing lives: its storage, its module, the module's functions, requirements and code | `things[].stored`, `things[].modules`, `modules` |
| Perspectives | The same things redrawn for one question each | `perspectives`, `flows`, `groups` |

## Ranking

A thing's tier is a judgement, written down once. Inside a tier the order is
measured: `dependents` is the number of stored things that cannot exist
without it. A thing that can be recomputed from others is a `view` and ranks
last.

## Files

| File | Holds |
| --- | --- |
| `schema.ts` | The document format and `validate`, which lists every reference that does not resolve |
| `viewer.ts`, `viewer.css` | The page: a perspective switch, a search box and one reading panel |
| `build.ts` | `buildPage(doc, title)`: bundles the viewer and one document into a single HTML file |

## Adopting it in a repository

1. Write the things, tiers and roles for that product.
2. Write an adapter that reads what the code declares (tables, routes,
   permissions, specifications) and joins it to the things.
3. Call `buildPage` and commit the resulting document next to the code, so a
   change to the architecture shows up as a diff.

taff01's adapter is `scripts/architecture/`.

## Perspectives

Built: Things (ranked list), Structure (tree), Authority (matrix),
Dependency (graph), Flow (numbered path). Planned: Data, Time, Purpose,
Measure, Deployment. A perspective is one relation and one form; adding one
is a renderer in `viewer.ts` and an entry in the document.
