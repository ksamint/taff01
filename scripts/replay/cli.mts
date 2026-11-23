import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import type { Observation } from "./capture.mts";
import { replay } from "./compare.mts";
import { localUrl, type Recipe, recipes } from "./wire.mts";

const root = resolve(import.meta.dirname, "../..");
const recordings = join(root, ".taff-replay");
const runName = /^[a-z0-9][a-z0-9-]{0,60}$/;
const [verb, name, ...args] = process.argv.slice(2);

function localFixtureEnvironment() {
  let local: ReturnType<typeof parseEnv> = {};
  try {
    local = parseEnv(readFileSync(join(root, ".env"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const env = { ...local, ...process.env };
  for (const key of ["AUTH_URL", "API_INTERNAL_URL", "RELEASE_BASE_URL"]) {
    if (env[key]) localUrl(env[key]);
  }
  for (const key of ["DATABASE_URL", "TEST_DATABASE_URL", "REDIS_URL"]) {
    if (!env[key]) continue;
    const url = new URL(env[key]);
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new Error("capture requires isolated loopback services");
  }
}

async function main() {
  if (!name || !runName.test(name)) throw new Error("invalid run name");
  const folder = join(recordings, name);
  if (verb === "capture") {
    const [separator, command, ...commandArgs] = args;
    if (separator !== "--" || !command)
      throw new Error("missing capture command");
    localFixtureEnvironment();
    mkdirSync(recordings, { recursive: true, mode: 0o700 });
    if (realpathSync(recordings) !== recordings)
      throw new Error("capture directory is not owned");
    mkdirSync(folder, { mode: 0o700 });
    const preload = pathToFileURL(
      join(import.meta.dirname, "preload.mts"),
    ).href;
    // The Node 26 tsx loader warning breaks the private CLI stderr contract.
    const options = [
      process.env.NODE_OPTIONS,
      "--disable-warning=DEP0205",
      `--import=${preload}`,
    ]
      .filter(Boolean)
      .join(" ");
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, TAFF_REPLAY_DIR: folder, NODE_OPTIONS: options },
    });
    process.exitCode = await new Promise<number>((done, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => done(code ?? 1));
    });
    return;
  }
  if (verb === "compare") {
    const [base, selected] = args;
    if (!base || args.length > 2) throw new Error("missing compare origin");
    const chosen = selected?.split(",") as Recipe[] | undefined;
    if (chosen?.some((value) => !Object.hasOwn(recipes, value)))
      throw new Error("unknown recipe");
    if (realpathSync(folder) !== folder)
      throw new Error("compare directory is not owned");
    const observations = readdirSync(folder)
      .filter((file) => /^observations-\d+\.ndjson$/.test(file))
      .sort()
      .flatMap((file) =>
        readFileSync(join(folder, file), "utf8")
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Observation),
      );
    const summary = await replay(
      observations,
      base,
      {
        session: process.env.TAFF_REPLAY_SESSION_COOKIE,
        bearer: process.env.TAFF_REPLAY_AGENT_TOKEN,
      },
      chosen && new Set(chosen),
    );
    console.log(JSON.stringify(summary, null, 2));
    if (summary.compared === 0 || summary.mismatches.length)
      process.exitCode = 1;
    return;
  }
  throw new Error("unknown replay command");
}

try {
  await main();
} catch {
  console.error(
    "Replay failed. See scripts/replay/README.md for supported invocations and fixture requirements.",
  );
  process.exitCode = 1;
}
