# func-map method

## Writing a catalog

- **Groups:** five to ten, each a part of the job the field does (work
  structure, planning, execution, people and access, reporting, money,
  platform). Order them from the core of the job outwards.
- **Categories:** two to six per group, each a short noun ("Dates",
  "Workflow", "Money out").
- **Functions:** one capability each, phrased so a user would recognise
  it and so that a product either does it or does not. Split "budgets and
  invoicing" into two.
- **Seen in:** the products the source gives as a reference, as the
  source says. "All" when every serious product has it; "none named" when
  the source names no product. Record the source and its date in
  `source`.
- **Size:** 60 to 120 functions covers a field without drowning it.
- **Sources:** official documentation or API reference, dated, with the
  plan tier when a function is limited to one. Research written by others
  is kept as reading material and condensed, with what was checked.

## Marking

| Mark | When | Must have |
| --- | --- | --- |
| yes | A user can do it today in the released product | `where`, or a note naming the evidence |
| partial | Some of it exists, or only for one kind of user | A note saying what is missing |
| no | It cannot be done | Nothing; a note if the gap is recorded somewhere |

Mark from the code and its model, not from plans, branches or memory. A
function that exists only for agents, only for admins or only on one
screen is `partial`.

## Benchmarking one product properly

The catalog is a shortlist of functions; a benchmark of one product goes
deeper. Use the OMV method (`scripts/omv/THEORY.md` where present):

1. **Fix the scenarios:** three scripts from the subject's own flows.
2. **Extract the product's O:** its object types and relation types, from
   its API reference.
3. **Align it to the subject's O:** same, same under another name, missing
   in the subject, missing in the product.
4. **Compare views:** for each question (structure, responsibility,
   authority, flow, time, resource, dependency, value and proof), how the
   product shows it.
5. **Run the scenarios by hand** and record what is impossible or awkward.
6. **Decide per practice:** adopt, adapt or reject, with the reason and
   what it would change.

Write the competitor's marks as a second assessment against the same
catalog. Then the two tables line up row for row.
