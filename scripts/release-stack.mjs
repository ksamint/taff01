// Starts a local production-mode stack for release candidate checks without
// Docker image builds: the bundled API (and optionally the worker) from
// `pnpm build:server` and the Next standalone server from `pnpm build`, both
// with NODE_ENV=production, as deploy/Dockerfile.server and
// deploy/Dockerfile.web run them.
//
//   node --env-file-if-exists=.env scripts/release-stack.mjs [options]
//
// Options:
//   --build      run `pnpm build` and `pnpm build:server` first
//   --migrate    apply migrations with the bundled migrator before starting
//   --seed       seed the demo workspace (dev tooling; needs DEMO_PASSWORD)
//   --worker     also start the bundled worker
//
// Ports come from WEB_PORT (default 3000, bound on WEB_HOST, default 127.0.0.1) and API_PORT (default 3001); the
// database from DATABASE_URL. AUTH_URL must be the browser origin
// (http://localhost:<WEB_PORT>) and API_INTERNAL_URL the API origin
// (http://127.0.0.1:<API_PORT>). Next bakes the /api and /mcp rewrite target
// into the build, so the script refuses to start a build made for another
// API_INTERNAL_URL. Ctrl-C (SIGINT/SIGTERM) stops every child.
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const args = new Set(process.argv.slice(2));
const root = resolve(import.meta.dirname, "..");
const webPort = process.env.WEB_PORT ?? "3000";
const apiPort = process.env.API_PORT ?? "3001";
const apiUrl = process.env.API_INTERNAL_URL ?? `http://127.0.0.1:${apiPort}`;
for (const name of ["DATABASE_URL", "AUTH_URL", "AUTH_SECRET", "TOKEN_PEPPER"])
  if (!process.env[name]) throw new Error(`${name} is required`);

const env = {
  ...process.env,
  API_PORT: apiPort,
  API_INTERNAL_URL: apiUrl,
  NEXT_TELEMETRY_DISABLED: "1",
};
const prod = { ...env, NODE_ENV: "production" };
const run = (command, argv, options = {}) =>
  execFileSync(command, argv, { cwd: root, stdio: "inherit", ...options });

if (args.has("--build")) {
  run("pnpm", ["build"], { env });
  run("pnpm", ["build:server"], { env });
}

const manifest = resolve(root, "apps/web/.next/routes-manifest.json");
const apiBundle = resolve(root, "dist/runtime/api/api.mjs");
if (!existsSync(manifest) || !existsSync(apiBundle))
  throw new Error("No production build; rerun with --build");
const rewrites = JSON.stringify(JSON.parse(readFileSync(manifest, "utf8")));
if (!rewrites.includes(`${apiUrl}/mcp`))
  throw new Error(
    `The web build rewrites /api and /mcp to another API; rebuild with API_INTERNAL_URL=${apiUrl} (--build)`,
  );

// Same layout as deploy/Dockerfile.web: static files and public assets sit
// beside the standalone server.
const standalone = resolve(root, "apps/web/.next/standalone");
for (const [from, to] of [
  ["apps/web/.next/static", "apps/web/.next/standalone/apps/web/.next/static"],
  ["apps/web/public", "apps/web/.next/standalone/apps/web/public"],
]) {
  rmSync(resolve(root, to), { recursive: true, force: true });
  cpSync(resolve(root, from), resolve(root, to), { recursive: true });
}

const migrations = resolve(root, "dist/runtime/api/migrations");
if (args.has("--migrate"))
  run(process.execPath, [resolve(root, "dist/runtime/api/migrate.mjs")], {
    env: { ...prod, MIGRATIONS_DIR: migrations },
  });
if (args.has("--seed"))
  run(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "packages/core/src/seed.ts"],
    { env },
  );

const children = [];
function start(name, argv, extra, cwd = root) {
  const child = spawn(process.execPath, argv, {
    cwd,
    env: { ...prod, ...extra },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code, signal) => {
    console.error(`[release-stack] ${name} exited (${signal ?? code})`);
    stop(code ?? 1);
  });
  children.push(child);
}
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  setTimeout(() => process.exit(code), 500).unref();
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

start("api", [apiBundle], { MIGRATIONS_DIR: migrations });
if (args.has("--worker"))
  start("worker", [resolve(root, "dist/runtime/worker/worker.mjs")], {});
start(
  "web",
  [resolve(standalone, "apps/web/server.js")],
  { PORT: webPort, HOSTNAME: process.env.WEB_HOST ?? "127.0.0.1" },
  resolve(standalone, "apps/web"),
);

async function waitFor(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`${url} did not become healthy`);
}
try {
  await waitFor(`${apiUrl}/api/health`);
  await waitFor(`http://127.0.0.1:${webPort}/api/health`);
  console.log(
    `[release-stack] ready: web http://localhost:${webPort} → API ${apiUrl}`,
  );
} catch (error) {
  console.error(`[release-stack] ${error.message}`);
  stop(1);
}
