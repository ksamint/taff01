// Writes Taff's function map with the func-map skill: the project-management
// catalog, Taff's assessment, and the OMV model as the evidence.
//   pnpm arch:benchmark           write docs/benchmark/function-map.md and the page
//   pnpm arch:benchmark --check   exit 1 when the committed table is stale
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { CATALOG } from "../../.claude/skills/func-map/catalogs/project-management.ts";
import {
  check,
  type Known,
  markdown,
  page,
} from "../../.claude/skills/func-map/scripts/func-map.ts";
import { ASSESSMENT } from "./benchmark.ts";
import { inventory, repoRoot } from "./inventory.ts";
import { omv } from "./omv-model.ts";

export const GENERATOR =
  "`pnpm arch:benchmark` (func-map skill) from `scripts/architecture/benchmark.ts`";

/** The OMV objects, labelled the way the table shows them. */
export function known(): Known {
  const { doc } = omv(inventory());
  const types = new Map(
    doc.o.objectTypes.map((type) => [type.id, type.title.toLowerCase()]),
  );
  return new Map(
    doc.m.objects.map((object) => [
      object.id,
      `${object.title} (${types.get(object.type) ?? object.type})`,
    ]),
  );
}

export function taffMarkdown(evidence: Known = known()): string {
  return markdown(CATALOG, ASSESSMENT, evidence, GENERATOR);
}

if (process.argv[1]?.endsWith("benchmark-doc.mts")) {
  const evidence = known();
  const problems = check(CATALOG, ASSESSMENT, evidence);
  for (const line of problems) console.error(`problem: ${line}`);
  if (problems.length) process.exit(1);
  const target = path.join(repoRoot, "docs/benchmark/function-map.md");
  const next = taffMarkdown(evidence);
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(target, "utf8");
    } catch {}
    if (current !== next) {
      console.error(
        "docs/benchmark/function-map.md is stale; run pnpm arch:benchmark",
      );
      process.exit(1);
    }
    console.info("function map is current");
  } else {
    writeFileSync(target, next);
    const out = path.join(repoRoot, "architecture/.site");
    mkdirSync(out, { recursive: true });
    writeFileSync(
      path.join(out, "benchmark.fragment.html"),
      page(CATALOG, ASSESSMENT, evidence),
    );
    console.info(
      `wrote docs/benchmark/function-map.md: ${CATALOG.functions.length} functions`,
    );
  }
}
