// Public acceptance permits summaries, never Playwright's raw DOM/error artifact.
// Required in the runner and inherited by its forked workers through execArgv.
const fs = require("node:fs");
const path = require("node:path");
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
globalThis.__TAFF_ARTIFACT_GUARD__ = true;
