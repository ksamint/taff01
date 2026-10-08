# Taff

An open-source, performance-first task and calendar app where people and AI
agents work as one team. Mobile web and PWA first, in Simplified Chinese and English.

## Status

Phase 0 is complete: repository initialization, MIT license, original requirements,
contributor instructions, and an implementation plan. The application is not yet
implemented. Each implementation phase ends with user review before the next starts.

## Quick start

```sh
git clone https://github.com/ksamint/taff01.git
cd taff01
```

Read [the original requirements](instruction_v0.md) and
[the implementation plan](docs/implementation-plan.md). There is no install or dev
command yet. The application runtime will require Node 22 and pnpm 10; setup and
development commands will be added and verified with the runnable foundation.

## Planned structure

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js mobile UI, bilingual strings, cache-first data and optimistic mutations |
| `apps/api` | Hono REST and MCP adapters, authentication, rate limiting and WebSocket hub |
| `apps/worker` | BullMQ background jobs |
| `packages/schemas` | Shared Zod schemas and inferred client types |
| `packages/db` | Drizzle schema, migrations and PostgreSQL driver setup |
| `packages/core` | Business logic, permissions, transactional database operations and activity events |

The fixed stack and budgets are specified in `instruction_v0.md`. Architecture
changes require an ADR. No application dependency has been added yet.

## Contributing

Read [AGENTS.md](AGENTS.md). Use conventional commits and keep changes focused.
Tests accompany behavior changes. Add both locales for every user-facing string.
Never commit credentials; list required variables with dummy values in
`.env.example` when runtime configuration is introduced.

## License

[MIT](LICENSE).
