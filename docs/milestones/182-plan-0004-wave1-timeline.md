# 182 · Plan 0004 · Timeline reads in Rust

Taff's method-matched proxy sends project timeline, milestone and payment
GETs to Rust. Milestone/payment POSTs use the existing Node routes.

- A disposable migrated database and real Node sessions exercised 72
  requests against both runtimes with zero differences.
- Profiles covered en/America/Los_Angeles, zh-CN/Asia/Shanghai and
  zh-HK/Asia/Hong_Kong. Cases include finance visibility, workspace scope,
  invalid paths, ordering and version and instant fields.
- Eight Node-generated forecast fixtures match the Rust plan model.
  Migrated PostgreSQL integration and local Caddy validation passed.
- Contract: [PR-1.10](../spec/projects.md). Next is project phases.
