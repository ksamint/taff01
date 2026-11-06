// Public acceptance permits summaries, never Playwright's raw DOM/error artifact.
// Required in the runner and inherited by its forked workers through execArgv.
import fs from "node:fs";
import path from "node:path";

const writeFile = fs.promises.writeFile.bind(fs.promises);
fs.promises.writeFile = async function (target, ...args) {
  const name =
    typeof target === "string"
      ? target
      : target instanceof URL
        ? target.pathname
        : "";
  if (path.basename(name) === "error-context.md") return;
  return writeFile(target, ...args);
};
(
  globalThis as typeof globalThis & { __TAFF_ARTIFACT_GUARD__?: boolean }
).__TAFF_ARTIFACT_GUARD__ = true;
