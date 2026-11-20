# Taff architecture model

One model of how Taff is built, in [LikeC4](https://likec4.dev) source files.
The diagrams are queries over the model, so they follow it. The model's
history is the Git history of this folder. Decision: [ADR 0033](../docs/adr/0033-likec4-architecture-model.md).
Contract: `docs/spec/tooling.md` TT-9.

## See it

```bash
pnpm arch:view
```

Opens the model in a browser with live reload. Start at **Taff · landscape**.

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

## Change it

- **A new table, route, MCP tool, core file or page.** Add it to the module
  that owns it in `scripts/architecture/modules.ts`, then run `pnpm arch:gen`
  and commit both. `pnpm test` fails until you do.
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
