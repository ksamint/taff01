// Bundles the API, worker and migrator into single ESM files. Workspace
// packages are inlined; npm packages stay external and come from the deployed
// node_modules (see deploy/Dockerfile.server).
import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

const out = "dist/server";
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const alias = {
  "@taff/core": "./packages/core/src/index.ts",
  "@taff/db/schema": "./packages/db/src/schema.ts",
  "@taff/db": "./packages/db/src/index.ts",
  "@taff/schemas": "./packages/schemas/src/index.ts",
};
for (const [entry, name] of [
  ["apps/api/src/index.ts", "api"],
  ["apps/worker/src/index.ts", "worker"],
  ["packages/db/src/migrate.ts", "migrate"],
] as const) {
  await build({
    entryPoints: [entry],
    outfile: `${out}/${name}.mjs`,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    packages: "external",
    alias,
    sourcemap: false,
    logLevel: "warning",
  });
  console.log(`built ${out}/${name}.mjs`);
}
await cp("packages/db/migrations", `${out}/migrations`, { recursive: true });
console.log(`copied migrations to ${out}/migrations`);
