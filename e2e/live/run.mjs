import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { freshLiveReport, validateLiveArgs } from "./safety.mjs";

const local = (name) => fileURLToPath(new URL(name, import.meta.url));
const args = validateLiveArgs(process.argv.slice(2));
process.env.RELEASE_REPORT_DIR = freshLiveReport(
  process.env.RELEASE_REPORT_DIR ?? local("reports"),
);
process.env.TAFF_LIVE_DISCOVERY = args.includes("--list") ? "1" : "";
console.log(
  JSON.stringify({
    event: "live-run",
    reportDirectory: process.env.RELEASE_REPORT_DIR,
  }),
);
const child = spawn(
  process.execPath,
  [
    "--require",
    local("artifact-guard.cjs"),
    local("../../node_modules/@playwright/test/cli.js"),
    "test",
    "--config",
    local("playwright.config.ts"),
    ...args,
  ],
  { stdio: "inherit", env: process.env },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
