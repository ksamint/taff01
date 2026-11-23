---
name: func-map
description: Build a function map that sets one product against everything its field offers - a catalog of functions by group and category, the products each is seen in, and whether the product has it (yes, partly, no) with evidence that points at real things in its code or model. Writes a committed Markdown table and a page where each group folds open, and a check that fails when a claim points at nothing or a catalog function is left unmarked. Use when the user asks for a function map, feature matrix, capability map, benchmark or competitor comparison, "what do we have versus the market", gap analysis, 功能地图, 功能对比, 竞品对标 or 功能盘点, even if they never say func-map.
metadata:
  author: ksamint
  origin: ksamint/taff01
  repository: ksamint/ksaskill01
  version: "1.0.1"
---

# func-map

**Version:** 1.0.1

A function map answers one question: *of everything products in this field
do, what does ours do today, and how do we know?* It has two inputs that are
kept apart on purpose:

| Input | Says | Changes when |
| --- | --- | --- |
| **Catalog** | What the field offers: functions by group and category, and the products each is seen in | The field moves, or research adds a product |
| **Assessment** | For one subject: a mark per catalog function, with evidence | The subject's code changes |

One catalog serves many assessments (your product, a competitor, a plan for
next quarter). The assessment never edits the catalog.

## Files

| Path | What it is |
| --- | --- |
| `scripts/func-map.ts` | Types, `check`, `markdown`, `page`, and a command line. Node 24 runs it directly. Imports nothing outside this folder. |
| `catalogs/project-management.ts` | 86 functions in 8 groups for project-management products. |
| `references/method.md` | How to write a catalog, how to mark, and how to benchmark one product properly. |

## Procedure

1. **Pick or write the catalog.** For project management use
   `catalogs/project-management.ts`. For another field, write a new catalog
   in the same shape; read `references/method.md` first. Never put a
   subject's status into a catalog.
2. **Collect the evidence the subject can be checked against.** Best is an
   OMV model (`architecture/omv.json` with objects and types). Otherwise a
   JSON array of ids: modules, routes, tables, files, spec requirements.
   Read the code; do not mark from memory or from marketing.
3. **Write the assessment**: a TypeScript module exporting `ASSESSMENT`
   with `subject`, `evidence` (one phrase saying what the ids are) and one
   mark per catalog id:
   - `yes`: the subject does it. `where` names the evidence ids. A `yes`
     with nothing to point at needs a note saying why (a licence, a
     language setting).
   - `partial`: some of it. A note is required and says what is missing.
   - `no`: missing. `where` may name a placeholder that records the gap
     (an object marked not modelled).
4. **Check and render.**

   ```bash
   node .claude/skills/func-map/scripts/func-map.ts \
     --catalog .claude/skills/func-map/catalogs/project-management.ts \
     --assessment <assessment.ts> --known <omv.json or ids.json> \
     --md docs/benchmark/function-map.md --html <page.html>
   ```

   `--check` instead of writing exits 1 when the committed table is stale.
   The run fails on any unmarked function, unknown id, `partial` without a
   note, or `where` that is not in the evidence.
5. **Gate it.** Add a unit test that calls `check` with the evidence and
   compares the committed table with `markdown(...)`, so the map breaks
   when the code it points at goes away. Commit the Markdown; the page is
   built.
6. **Report** in this order: the overview counts by group; the strongest
   and weakest groups; the gaps that matter for the subject's purpose; then
   the limits. Always say that "seen in" comes from the catalog's sources
   and was not tested by hand, and that a mark is a judgement made from the
   code.

## Rules

- A function is a capability a user would recognise ("time tracking"), not
  a vendor's feature name ("Timesheets Pro").
- Ids are lowercase and hyphenated, and never change once an assessment
  uses them. Rename the `name`, not the `id`.
- Do not count functions to score products. The map shows coverage and
  gaps; whether a gap matters depends on what the subject is for.
- A competitor assessment needs evidence too: its API reference or
  documentation, dated. Without that, mark it in a note, not as `yes`.

## Worked example

taff01 is the first subject. Its assessment is
`scripts/architecture/benchmark.ts`, checked against its OMV model
(`architecture/omv.json`); `pnpm arch:benchmark` writes
`docs/benchmark/function-map.md`, and a unit test in
`scripts/architecture/architecture.test.ts` gates it. The reading material the
catalog was built from is in its `docs/benchmark/reading/`.

## Where this skill lives

The canonical copy is `skills/func-map/` in ksamint/ksaskill01. A
repository that uses it keeps an identical copy in `.claude/skills/func-map/`;
change the canonical copy first, then copy it over.
