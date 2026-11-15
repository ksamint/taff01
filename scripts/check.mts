// `pnpm check`: the one command that runs the whole local gate
// (docs/release-closeout.md, check 1) and binds the result to the tree.
//
//   pnpm check                     every step; the only run that can pass
//   pnpm check --list              print the steps and exit
//   pnpm check --only lint,test    run some steps; the result is "partial"
//   pnpm check --skip e2e          leave some steps out; the result is "partial"
//   pnpm check --allow-dirty       run with uncommitted changes; "partial"
//
// It stops at the first failure and writes release-reports/check-report.json
// and .md (git-ignored). Paste the .md into the pull request or milestone.
// Needs the local services of compose.yaml, a .env, Docker and Cargo.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CHECK_STEPS,
  type CheckReport,
  type CheckStep,
  checkMarkdown,
  checkResult,
  leftOut,
  parseCheckArgs,
  remoteDatabases,
  type StepResult,
} from "./check-plan.ts";

const root = resolve(import.meta.dirname, "..");
const options = parseCheckArgs(process.argv.slice(2));
if (options.list) {
  for (const step of CHECK_STEPS) console.log(`${step.id}\t${step.command}`);
  process.exit(0);
}
// Exported variables win over .env, as they do for every script it runs.
if (existsSync(`${root}/.env`)) process.loadEnvFile(`${root}/.env`);

const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const tree = git("rev-parse", "HEAD^{tree}");
const commit = git("rev-parse", "HEAD");
const clean = git("status", "--porcelain") === "";
console.log(`tree=${tree}`);
if (!clean && !options.allowDirty) {
  console.error(
    "The working tree has uncommitted changes, so a result could not be bound to the tree. Commit them, or pass --allow-dirty for a partial result.",
  );
  process.exit(2);
}
const remote = remoteDatabases(process.env);
if (remote.length > 0) {
  // Names only: a database URL holds a password.
  console.error(
    `${remote.join(" and ")} must point at this machine (127.0.0.1, localhost or ::1). The gate migrates, seeds and writes test data.`,
  );
  process.exit(2);
}

const webUrl = process.env.AUTH_URL ?? "http://localhost:3000";
const apiUrl = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
const stackEnv: Record<string, string> = {
  RELEASE_BASE_URL: process.env.RELEASE_BASE_URL ?? webUrl,
};
if (!process.env.RELEASE_MAIL_LOG && process.env.EMAIL_LOG_PATH)
  stackEnv.RELEASE_MAIL_LOG = resolve(root, process.env.EMAIL_LOG_PATH);

function run(step: CheckStep, extra: Record<string, string>): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(step.argv[0], step.argv.slice(1), {
      cwd: root,
      stdio: "inherit",
      env: { ...process.env, ...extra, ...step.env },
    });
    child.once("error", (error) => {
      console.error(`[check] ${step.id}: ${error.message}`);
      done(false);
    });
    child.once("exit", (code) => done(code === 0));
  });
}

let stack: ChildProcess | undefined;
async function healthy(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}
async function startStack(): Promise<boolean> {
  if (
    (await healthy(`${webUrl}/api/health`)) ||
    (await healthy(`${apiUrl}/api/health`))
  ) {
    console.error(
      `[check] something already answers on ${webUrl} or ${apiUrl}; stop it so the gate tests its own production-mode stack`,
    );
    return false;
  }
  const child = spawn("pnpm", ["release:stack", "--worker"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    detached: true,
  });
  stack = child;
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  child.once("error", () => {
    exited = true;
  });
  for (let i = 0; i < 240 && !exited; i++) {
    if (
      (await healthy(`${apiUrl}/api/health`)) &&
      (await healthy(`${webUrl}/api/health`))
    )
      return true;
    await new Promise((wait) => setTimeout(wait, 500));
  }
  return false;
}
async function stopStack() {
  const child = stack;
  stack = undefined;
  if (!child?.pid || child.exitCode !== null) return;
  const gone = new Promise((done) => child.once("exit", done));
  try {
    // The runner and the servers it started share one process group.
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await Promise.race([gone, new Promise((wait) => setTimeout(wait, 10_000))]);
  if (child.exitCode === null)
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => void stopStack().then(() => process.exit(130)));

const skipped = leftOut(options);
const startedAt = new Date().toISOString();
const steps: StepResult[] = [];
let failed = false;
for (const step of CHECK_STEPS) {
  const result: StepResult = {
    id: step.id,
    command: step.command,
    status: "not run",
    seconds: 0,
  };
  steps.push(result);
  if (skipped.has(step.id)) {
    result.reason = "left out by --only or --skip";
    continue;
  }
  if (failed) {
    result.reason = "an earlier step failed";
    continue;
  }
  const began = Date.now();
  console.log(`\n[check] ${step.id}: ${step.command}`);
  let ok = true;
  if (step.needsStack && !stack) ok = await startStack();
  if (!step.needsStack) await stopStack();
  if (ok) ok = await run(step, step.needsStack ? stackEnv : {});
  result.seconds = (Date.now() - began) / 1000;
  result.status = ok ? "passed" : "failed";
  if (!ok) failed = true;
}
await stopStack();

const report: CheckReport = {
  tree,
  commit,
  clean,
  startedAt,
  node: process.version,
  result: checkResult(steps, clean),
  steps,
};
const out = resolve(root, "release-reports");
mkdirSync(out, { recursive: true });
writeFileSync(
  resolve(out, "check-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
const markdown = checkMarkdown(report);
writeFileSync(resolve(out, "check-report.md"), `${markdown}\n`);
console.log(
  `\n${markdown}\n\n[check] ${report.result}; report in release-reports/`,
);
process.exit(report.result === "failed" ? 1 : 0);
