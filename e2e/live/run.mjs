import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const local = (name) => fileURLToPath(new URL(name, import.meta.url));
process.env.RELEASE_REPORT_DIR ??= local("reports");
const child = spawn(
  process.execPath,
  [
    "--require",
    local("artifact-guard.cjs"),
    local("../../node_modules/@playwright/test/cli.js"),
    "test",
    "--config",
    local("playwright.config.ts"),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit", env: process.env },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
