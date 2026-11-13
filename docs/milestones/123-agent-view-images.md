# 123 — Agent live view images and OAuth refresh scope ceiling

E3 implemented on `feat/v024-agent-images`; not released or deployed.
Base `692a44a`; local E2 dependency `eda856e` cherry-picked as `dbc8d79`.
Integration must drop that dependency with `rebase --onto <final-main> dbc8d79`.

- `views.image` is tool 38, with strict optional workspace/project/locale args.
- Each call resolves current grants; export requires both read scopes.
- Issuer locale/zone, agent watermark, safe Unicode filename and MCP audit.
- REST/MCP share 10 s rendering and dedicated 10/member/min quota, fail closed.
- MCP errors set failed call state; stored `summaries.image` is unchanged.
- OAuth access may narrow; rotating refresh credentials retain original scopes.
- Omitted/empty scope restores the ceiling; expansion/unknown scope is refused.
- Original issuer authority and member restore use the ceiling; UI shows it.
- RFC 6749 §6 decision in ADR 0031; live VE-2.3, DS-9.5, AA-4.8 updated.
- Migration 0043 adds nullable `refresh_scopes`; journal has 44 entries.
- Legacy null falls back to access scopes; old images tolerate added column.
- Drizzle's old 0029 snapshot produced stale DDL; only the focused ALTER ships,
  alongside a current snapshot. No renderer or dependency change.

Validation (local working tree; parent owns final exact-source full gate):
- `pnpm typecheck`: six packages and script types pass.
- `pnpm lint`: Biome + generated permissions matrix pass.
- Focused Vitest: permissions, REST/MCP images, view exports, OAuth, authorization
  matrix, access matrix and tokens: 1,240 passed across eight files.
- Final issuer-loss/finance additions: OAuth + view export + fonts, 33 passed.
- Final MCP optional/strict schema and renderer tests: two passed.
- `pnpm rust:fixtures`, `pnpm schema:gen`, test-id contract regenerated.
- `TAFF_REQUIRE_SQL_PARITY=1 cargo test --workspace --locked`: 29 passed,
  including SQL read models, permission fixtures and eight real renderer cases.
- Browser: MCP catalog/token flow three locales passed after scoping its locator;
  unchanged real image export/send/copy/save three locales passed.
- MCP smoke: live `views.image` PNG and 38-tool catalog pass; total smoke has
  one unrelated `tasks.plan` assertion failure (UTC date vs issuer-zone deadline
  already equal, so changed-task list is empty). Reported to parent; not hidden.
- `git diff --check` clean. No push, PR, merge, production, SSH or messages.

Open: parent full gate, migration-count/operator journal integration and release.
Owner-only Twin test-chat post is owner check 4 after unlock, not executed here.
