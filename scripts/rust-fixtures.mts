// Regenerates every Node-generated golden fixture the Rust backend's parity
// tests read (ADR 0026). The local gate regenerates and checks these fixtures,
// so a TypeScript change that alters behaviour must update the fixture in
// the same change.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const generators = [
  "apps/api/scripts/mcp-schema-gen.mts",
  "apps/api/scripts/permissions-golden.mts",
  "scripts/rust-recurrence-golden.mts",
  "scripts/rust-canonical-json-golden.mts",
  "scripts/rust-tz-golden.mts",
  "scripts/rust-token-policy-golden.mts",
  "scripts/rust-summary-text-golden.mts",
  "scripts/rust-timeline-golden.mts",
  "apps/api/scripts/summary-schema-gen.mts",
];
const root = fileURLToPath(new URL("..", import.meta.url));
// The summary model's own input/expected contract remains the sole snapshot source.
const snapshot = spawnSync(
  process.execPath,
  [
    "node_modules/vitest/vitest.mjs",
    "run",
    "packages/core/src/summary-model.test.ts",
    "--update",
  ],
  { cwd: root, stdio: "inherit" },
);
if (snapshot.error) throw snapshot.error;
if (snapshot.status !== 0) process.exit(snapshot.status ?? 1);
for (const generator of generators) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", generator],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
