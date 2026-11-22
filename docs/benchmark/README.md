# Benchmark

What other project-management products do, kept as reading material, and one
table that sets it against what Taff does today.

| File | What it is |
| --- | --- |
| [function-map.md](function-map.md) | **Start here.** 86 functions by group and category, the products each is seen in, and whether Taff has it. Generated. |
| [reading/2026-11-20-pm-platforms.md](reading/2026-11-20-pm-platforms.md) | Research supplied by the owner: about twenty products in four categories, a design-question map, and a proposed position for Taff. |
| [reading/2026-11-20-structure-and-review.md](reading/2026-11-20-structure-and-review.md) | This repository's own notes: structure practices from Linear, Asana and Shape Up, and a review of the research above against Taff's code. |

## How the function map is kept honest

- It is built with the **func-map** skill (`.claude/skills/func-map/`). The
  functions come from the skill's project-management catalog; Taff's marks
  are in `scripts/architecture/benchmark.ts`.
- **Seen in** repeats what the reading material says. It comes from vendor
  documentation and has not been tested by hand.
- **Taff** is Yes, Partly or No. Each Yes or Partly names objects of Taff's own
  model (`architecture/omv.json`). `pnpm test` fails when a named object does
  not exist, so a claim cannot outlive the code it points at.
- `pnpm arch:benchmark` rewrites the table.

## How to benchmark a product properly

The reading material is a shortlist, not a benchmark. A benchmark of one
product follows the OMV method (`scripts/omv/THEORY.md`):

1. **Fix the scenarios.** Three scripts from Taff's own flows: hand work to an
   agent and accept it; plan a project and report its risk; run a client
   project from contract to payment.
2. **Extract the product's O.** Its object types and relation types, from its
   API reference, not its marketing.
3. **Align it to Taff's O.** Each concept is the same, the same under another
   name, missing in Taff, or missing in the product.
4. **Compare V.** For each of the eight questions, how the product shows it
   and which relation that view draws.
5. **Run the scenarios by hand** and record what is impossible or awkward.
6. **Decide per practice:** adopt, adapt or reject, with the reason and the
   Taff concepts and modules it would change.

Evidence: official documentation or API reference only, dated, with the plan
tier noted. Anything not tested by hand is labelled so.

Order agreed so far: Asana, Jira, Linear in depth; then Basecamp with Shape
Up, Teamwork.com or Kantata, and ClickUp for agents; Planview, Primavera,
Smartsheet or Wrike and OpenProject lightly. No product has been through
steps 2 to 6 yet.
