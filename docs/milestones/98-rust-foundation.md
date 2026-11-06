# 98 — Rust foundation and renderer parity

- PR84 foundation rebased without workflows; Node remains the session, mutation and permission authority. The new renderer has no database access.
- Split pure domain, SQL read models and a compatibility facade; pinned Rust1.97.1. Local fmt/clippy/test/licence/fixture-diff gate is registered.
- Permission inputs and expected decisions come from Node:599 cases cover every action, scopes, grants, omitted/null assignment, role ceilings and an injected clock.
- Canonical JSON uses Apache-2.0 ryu-js and float-roundtrip parsing:4,109 cases include4,096 deterministic IEEE patterns. Signed raw-wire parser parity remains a later authority-cutover prerequisite.
- Recurrence:14 accepted/25 rejected; timezone:17 wall/4 instant cases plus invalid zones; MCP schema bridge:37 tools. The value-contract fixtures reproduce byte-for-byte.
- Real SQLx user/workspace reads match disposable Node-owned PostgreSQL fixtures, including archive and null fields; the final gate requires this test rather than silently skipping it.
- Foundation plus image service passed24 Rust tests before the extra CJK glyph regression; final workspace gate is pending on the release source.
- Renderer:three locale PNG goldens are1080px and102–106KB. The linux/amd64 image returned byte-identical PNGs to native golden outputs.
- New CJK regression retains user-supplied name glyphs outside UI labels; only backend fonts grow. Existing Noto/Manrope OFL licences retained.
- No CI/runners, database authority cutover, production Rust API or worker replacement is claimed. Renderer runtime acceptance belongs to v0.2.19 closeout.
