// Writes architecture/generated/modules.c4 from the code and the module map.
//   pnpm arch:gen            write the file
//   pnpm arch:gen --check    exit 1 when the committed file is stale
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inventory, repoRoot } from "./inventory.ts";
import { assign, render } from "./model.ts";

const target = path.join(repoRoot, "architecture/generated/modules.c4");
const assignment = assign(inventory());
for (const line of assignment.unmapped) console.error(`unmapped: ${line}`);
for (const line of assignment.conflicts) console.error(`conflict: ${line}`);
if (assignment.unmapped.length || assignment.conflicts.length) {
  console.error("Fix scripts/architecture/modules.ts, then run again.");
  process.exit(1);
}
const next = render(assignment);
if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(target, "utf8");
  } catch {}
  if (current !== next) {
    console.error(
      "architecture/generated/modules.c4 is stale; run pnpm arch:gen",
    );
    process.exit(1);
  }
  console.info("architecture model is current");
} else {
  writeFileSync(target, next);
  const count = (pick: (m: (typeof assignment.modules)[number]) => number) =>
    assignment.modules.reduce((sum, m) => sum + pick(m), 0);
  console.info(
    `wrote ${path.relative(repoRoot, target)}: ${assignment.modules.length} modules, ${count((m) => m.tables.length)} tables, ${count((m) => m.routes.length)} routes, ${count((m) => m.tools.length)} tools, ${count((m) => m.core.length)} core files, ${count((m) => m.pages.length)} pages`,
  );
}
