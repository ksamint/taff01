# omv

The OMV engine: **O** defines objects and relations, **M** holds them as one
typed graph, **V** looks at M from one object with one question. The method
is in [THEORY.md](THEORY.md).

Built in taff01 and meant to move into tda01, so nothing in this folder may
import from outside it (`scripts/architecture/architecture.test.ts` checks).

| File | Holds |
| --- | --- |
| `omv.ts` | The document format; `validate`, which checks M against O; `view`, the function V; `tree`, which follows one relation all the way |
| `repo-o.ts` | A standard O for a product and its repository: 14 object types, 19 relation types, 8 questions |
| `viewer.ts`, `viewer.css` | The page: a ranked picker for the centre, a question switch, a viewer switch, and the provenance of the view shown |
| `build.ts` | `buildPage(doc, title)`: one self-contained HTML file |

## Adopting it in a repository

1. List the product's concepts with a tier each.
2. Write an adapter that reads what the code declares and emits objects and
   relations of the types in `repo-o.ts`.
3. Run `validate`, commit the document, build the page.

taff01's adapter is `scripts/architecture/`; its document is
`architecture/omv.json`.
