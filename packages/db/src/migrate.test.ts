import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { expect, it } from "vitest";

it("bundling the migration library cannot turn an import into an automatic migration", async () => {
  const directory = await mkdtemp(
    fileURLToPath(new URL("../.migration-library-", import.meta.url)),
  );
  try {
    const output = `${directory}/library.mjs`;
    await build({
      entryPoints: [fileURLToPath(new URL("./migrate.ts", import.meta.url))],
      outfile: output,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
    });
    // No database is reachable here. A bundled import.meta.url CLI guard would
    // wrongly execute a migration simply because the entry wrapper imports it.
    const result = spawnSync(process.execPath, [output], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        DATABASE_URL: "postgres://unused:unused@127.0.0.1:1/unreachable",
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
