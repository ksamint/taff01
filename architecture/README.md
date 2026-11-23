# Taff architecture model

One model of how Taff is built, in [LikeC4](https://likec4.dev) source files.
The diagrams are queries over the model, so they follow it. The model's
history is the Git history of this folder. Decision: [ADR 0033](../docs/adr/0033-likec4-architecture-model.md).
Contract: `docs/spec/architecture-tooling.md` TT-9.

## See it

```bash
pnpm arch:map
```

Writes `architecture/.site/map.html`, the **OMV map**: one page to open in
a browser. This is the place to start. It is built by the OMV engine
(`scripts/omv/`, method in `scripts/omv/THEORY.md`) from
`architecture/omv.json`:

- **O** defines 14 object types and 19 relation types, each with a meaning.
- **M** is one typed graph: 592 objects and 1,818 relations, from the 48
  ranked concepts down to every table, route, tool and file.
- **V** is a function. Pick a centre on the left (any object, concepts ranked
  by importance), pick one of eight questions (Structure, Responsibility,
  Authority, Flow, Time, Resource, Dependency, Value and proof), and
  optionally a viewer. The page shows that view and states its centre,
  question, context, form and model version.

```bash
pnpm arch:view
```

Opens the full LikeC4 diagrams with live reload, for the detail the map
folds away. Start at **Taff · landscape**.

| View | Answers |
| --- | --- |
| Taff · landscape | Who uses Taff, and the two ways to read it |
| Runtime · what runs | The path of a request from Caddy to PostgreSQL |
| Runtime · the Rust port | What is Rust, and what the port replaces |
| Structure · the levels work lives in | System, organization, project, task, subtask and roles |
| Function modules · who depends on whom | Which module's code imports which module's tables |
| Data · tables by module | All tables, grouped by owner |
| Module · … (18 views) | One module: screens, routes, tools, code, tables, and the tables it borrows |

## Files

| File | Written by | Holds |
| --- | --- | --- |
| `spec.c4` | hand | The vocabulary: kinds of element, kinds of relationship, tags |
| `runtime.c4` | hand | People, agents, services, stores and how they call each other |
| `domain.c4` | hand | The levels work is organized in, and the two that are not modelled |
| `views.c4` | hand | The overview diagrams |
| `generated/modules.c4` | `pnpm arch:gen` | The 18 function modules, read from the code |

## What the function map adds

| Layer | Read from | Mapped in |
| --- | --- | --- |
| Functions and roles | `docs/spec/permissions-matrix.md`, generated from `can()` | `ACTION_RULES` in `scripts/architecture/focus.ts` |
| Requirements | Requirement groups of every `docs/spec/*.md` | `SPEC_MODULES` |
| Flows | Written by hand | `FLOWS` |
| Relations | Which core file imports which module's tables | derived |
| Lanes | Written by hand | `GROUPS` |

## Change it

- **A new kind of thing, a new tier, or a decided level.** Edit
  `scripts/architecture/ontology.ts`. Every table must belong to one thing.
- **A new relation type or question.** Edit `scripts/omv/repo-o.ts`, then emit
  the relation in `scripts/architecture/omv-model.ts`.
- **A new permission action or specification.** Name its module in
  `scripts/architecture/focus.ts`. `pnpm test` fails until you do.
- **A new flow.** Add it to `FLOWS`; each step names a module.

- **A new table, route, MCP tool, core file or page.** Add it to the module
  that owns it in `scripts/architecture/modules.ts`, then run `pnpm arch:gen`
  and `pnpm arch:map`, and commit the results. `pnpm test` fails until you do.
- **A new service, store, actor or level.** Edit `runtime.c4` or `domain.c4`.
- **A new picture.** Add a `view` to `views.c4`.
- **Layout and colours.** Drag and restyle in `pnpm arch:view` or the LikeC4
  VS Code extension; it writes the change back to the source file.

```bash
pnpm arch:check
```

Confirms the generated file is current and that LikeC4 accepts the model.

## Vocabulary

Elements: `actor`, `system`, `service`, `library`, `store` for what runs;
`area`, `concept` for how work is organized; `module`, `layer`, `screen`,
`routes`, `tool`, `code`, `table` for what the code is made of.

Relationships: plain arrows are calls; `uses` is a core file importing a
table; `contains` and `holds_role` join the levels; `planned` marks something
decided or asked about that does not exist yet.

Tags: `web`, `api`, `mcp`, `core`, `db` name the layer; `typescript`, `rust`
and `moves_to_rust` name the language and its future; `not_modelled` marks a
level the data does not have.

## Agents

`pnpm dlx likec4@1.60.0 mcp architecture` starts LikeC4's own MCP server over
this model, so a coding agent can ask what a module owns or what depends on a
table before it changes one.
