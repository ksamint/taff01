// Builds Taff's unlikec4 page: one ontology, five perspectives, one file.
//   pnpm arch:map    writes architecture/.site/map.html (open it in a browser)
// and map.fragment.html, the same page without the document shell.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildPage } from "../unlikec4/build.ts";
import { inventory, repoRoot } from "./inventory.ts";
import { ontology } from "./ontology-model.ts";

const { doc, problems } = ontology(inventory());
if (problems.length) {
  for (const line of problems) console.error(`problem: ${line}`);
  process.exit(1);
}
const page = await buildPage(doc, "Taff Ontology Map");
const out = path.join(repoRoot, "architecture/.site");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "map.fragment.html"), page.fragment);
writeFileSync(path.join(out, "map.html"), page.standalone);
writeFileSync(
  path.join(repoRoot, "architecture/ontology.json"),
  `${JSON.stringify(doc, null, 2)}\n`,
);
console.info(
  `wrote architecture/.site/map.html and architecture/ontology.json: ${doc.things.length} things in ${doc.tiers.length} tiers, ${doc.modules.length} modules, ${doc.perspectives.filter((p) => p.built).length} perspectives`,
);
