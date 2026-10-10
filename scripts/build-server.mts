// Bundles the API, worker, migrator and private setup CLI into ESM files. Workspace
// packages are inlined; npm packages stay external and come from the deployed
// node_modules (see deploy/Dockerfile.server).

import { execFileSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
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
  ["packages/core/src/provision-administration.ts", "administration"],
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
// External imports need the same flat production tree used by the Docker images.
await rm("dist/runtime", { recursive: true, force: true });
for (const target of ["api", "worker"]) {
  const runtime = `dist/runtime/${target}`;
  execFileSync(
    "pnpm",
    [
      "--filter",
      `@taff/${target}`,
      "deploy",
      "--prod",
      "--legacy",
      "--config.node-linker=hoisted",
      runtime,
    ],
    { stdio: "inherit" },
  );
  await cp(`${out}/${target}.mjs`, `${runtime}/${target}.mjs`);
  await cp(`${out}/migrate.mjs`, `${runtime}/migrate.mjs`);
  if (target === "api")
    await cp(`${out}/administration.mjs`, `${runtime}/administration.mjs`);
  await cp(`${out}/migrations`, `${runtime}/migrations`, { recursive: true });
  const require = createRequire(resolve(runtime, `${target}.mjs`));
  for (const auditTool of ["lighthouse", "axe-core"]) {
    let found = false;
    try {
      found = require.resolve(auditTool).startsWith(`${resolve(runtime)}/`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND")
        throw error;
    }
    if (found) throw new Error(`${auditTool} must not ship in ${target}`);
  }
  console.log(`prepared runnable production ${target} without audit tools`);
}
