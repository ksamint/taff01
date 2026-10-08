import { spawn } from "node:child_process";

const children = ["@taff/web", "@taff/api", "@taff/worker"].map((name) =>
  spawn("pnpm", ["--filter", name, "dev"], {
    stdio: "inherit",
    env: process.env,
    detached: process.platform !== "win32",
  }),
);
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    try {
      // Stop the package runner and its watch/server processes together.
      if (process.platform === "win32") child.kill("SIGTERM");
      else process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ESRCH")
      )
        throw error;
    }
  }
  process.exitCode = code;
}
for (const child of children) {
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once("exit", (code) => stop(code ?? 1));
}
process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
