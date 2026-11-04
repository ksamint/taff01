// Regenerates every Node-generated golden fixture the Rust backend's parity
// tests read (ADR 0026). CI runs this and fails on `git diff --exit-code`,
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
];
const root = fileURLToPath(new URL("..", import.meta.url));
for (const generator of generators) {
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", generator],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
