// Builds Taff's OMV map: one document (O, M, V) and one page that views it.
//   pnpm arch:map    writes architecture/omv.json and architecture/.site/map.html
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPage } from "../omv/build.ts";
import { inventory, repoRoot } from "./inventory.ts";
import { omv } from "./omv-model.ts";

const { doc, problems } = omv(inventory());
if (problems.length) {
  for (const line of problems) console.error(`problem: ${line}`);
  process.exit(1);
}
writeFileSync(
  path.join(repoRoot, "architecture/omv.json"),
  `${JSON.stringify(doc, null, 1)}\n`,
);
// The page names the commit it was built from; the committed document does not.
let version = "";
try {
  version = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
} catch {}
const page = await buildPage(
  version ? { ...doc, version } : doc,
  "Taff OMV Map",
);
const out = path.join(repoRoot, "architecture/.site");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "map.fragment.html"), page.fragment);
writeFileSync(path.join(out, "map.html"), page.standalone);
console.info(
  `wrote architecture/omv.json and architecture/.site/map.html: ${doc.m.objects.length} objects, ${doc.m.relations.length} relations, ${doc.o.relationTypes.length} relation types, ${doc.v.questions.length} questions`,
);
