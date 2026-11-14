# S3 graph renderer preparation

Status: local internal preparation; public S3 integration, full gate and release remain pending.
TypeScript target: shared pure geometry, display schemas/builders and fixtures. Rust target: stateless renderer.

- Base: `origin/main` `692a44ac235cabffef5c6b7e57c0e68e44c0bf92`.
- Temporary S1 dependency: cherry-pick of `52690d4054fdd41c3d80e9e449d00172a4633902`, local `1d6d40bcbeb0b62862769245c147fd6ebccd1b79`.
- Parent must drop that dependency with `rebase --onto <final-S2-main> 1d6d40bcbeb0b62862769245c147fd6ebccd1b79` when integrating this prep commit.
- Geometry imports: `@taff/schemas/graph-layout` and `@taff/schemas/mind-geometry`; web wrappers preserve existing imports. Optimistic mind cache helpers remain in web.
- Builders: `buildRelationsLayout(source, options, locale, labels, contentHash)` and `buildMindLayout(source, options, locale, labels, contentHash)` from `@taff/schemas/graph-image`.
- Relations options explicitly bind `layout`, `scope`, `projectId`, `layers`, `forceSeed`; current web seed is 7. Mind options explicitly bind `archived`.
- Labels supply title, subtitle, footer, empty, `more(nodes)`, `moreEdges(edges)`; mind adds centre and `ring(layer)`. No production English or identity lookup in these builders.
- Caller supplies freshly authorized source data, canonical snapshot hash and localized exporter/time-zone metadata; notes, URLs, linked-task content and CRM details do not enter the display schema.
- Envelope: `{layout, watermark: {text, contentHash}, contentHash}` to internal `POST /render/graph`; PNG response has `X-Taff-Renderer: graph-1` and `Cache-Control: no-store`.
- Output: 150 nodes, 600 semantic unique edges, exact separate localized omission counts. Filter hidden layers/archived nodes before counting; omitted edges include removed endpoints.
- Relations lay out the retained subgraph: uncapped geometry/seed matches web; truncated positions may move. Mind retains exact polar geometry and full visible ring extent. No source-size rejection.
- Export fit includes label bounds without interactive minimum zoom; shared web positions can still produce crowded labels. Width 1080, height ≤4000, palette PNG ≤400 KB; strict schema and projected-bound checks precede pixel allocation.
- ADR 0031 amendment 2 and spec VE-5 describe internal preparation only. Public core/API/MCP/UI authorization, rate limits, snapshot/audit/hash wiring and translated labels remain parent-owned.

Focused validation:
- Locked offline dependency install passed; private node_modules, no shared symlink or new dependency.
- `pnpm exec vitest run packages/schemas/src/graph-image.test.ts packages/schemas/src/timeline-image.test.ts apps/web/src/lib/graph-layout.test.ts apps/web/src/lib/mind-model.test.ts scripts/language-policy.test.ts`: 54 passed (5 files).
- `pnpm --filter @taff/schemas typecheck`, `pnpm --filter @taff/web typecheck`, `pnpm exec tsc -p tsconfig.scripts.json --noEmit`: passed.
- Schema/fixture generation with `node --import tsx` passed; six locale JSON/PNG pairs, six empty/max/dense JSON stress fixtures.
- `CARGO_BUILD_JOBS=2 CARGO_TARGET_DIR=/private/tmp/taff-graph-target cargo test --manifest-path backend/Cargo.toml --locked --offline -p taff-render`: 17 passed; existing summary/timeline goldens unchanged.
- Same Cargo environment: `cargo clippy ... -p taff-render --tests -- -D warnings` and `cargo fmt ... --all -- --check`: passed.
- Dense 150-node/600-edge long-CJK PNGs: mind 213186 bytes, relations 351751 bytes; six locale perceptual goldens plus palette/hash/dimension/bounds checks passed.
- CJK mind and relations PNGs visually inspected; focused Biome and `git diff --check` passed.
- `pnpm schema:gen` encountered the sandbox's TSX IPC socket refusal; the same generator passed with `node --import tsx` (no IPC listener needed).

No full release gate, public API/MCP/browser integration, services, credentials, remote operations, push/PR or deployment from this worker.
