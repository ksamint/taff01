import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
if (existsSync(`${root}/.env`)) process.loadEnvFile(`${root}/.env`);
if (!process.env.TEST_DATABASE_URL)
  throw new Error(
    "rust:gate requires TEST_DATABASE_URL for SQL read-model parity",
  );
process.env.TAFF_REQUIRE_SQL_PARITY = "1";
for (const [command, args, cwd] of [
  ["pnpm", ["rust:fixtures"], root],
  ["cargo", ["fmt", "--all", "--check"], `${root}/backend`],
  [
    "cargo",
    ["clippy", "--workspace", "--all-targets", "--", "-D", "warnings"],
    `${root}/backend`,
  ],
  ["cargo", ["test", "--workspace", "--locked"], `${root}/backend`],
  ["cargo", ["deny", "check", "licenses"], `${root}/backend`],
  [
    "git",
    [
      "diff",
      "--exit-code",
      "--",
      "backend/crates/taff-core/tests/fixtures",
      "backend/crates/taff-render/tests/fixtures",
      "packages/core/src/__fixtures__",
      "packages/schemas/generated",
    ],
    root,
  ],
] as const) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
