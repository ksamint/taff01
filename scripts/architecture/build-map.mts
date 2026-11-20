// Builds the function map as one self-contained page.
//   pnpm arch:map    writes architecture/.site/map.html (open it in a browser)
// and map.fragment.html, the same page without the document shell.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { focusModel } from "./focus-model.ts";
import { inventory, repoRoot } from "./inventory.ts";

const model = focusModel(inventory());
if (model.problems.length) {
  for (const line of model.problems) console.error(`problem: ${line}`);
  process.exit(1);
}
const bundle = await build({
  entryPoints: [path.join(import.meta.dirname, "viewer.ts")],
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  write: false,
});
const script = bundle.outputFiles[0]?.text ?? "";
const css = readFileSync(path.join(import.meta.dirname, "viewer.css"), "utf8");
const data = JSON.stringify(model).replace(/</g, "\\u003c");
const fragment = `<title>Taff Function Map</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap">
<style>
${css}</style>
<div id="app"></div>
<script type="application/json" id="taff-map">${data}</script>
<script>
${script.replace(/<\/script/g, "<\\/script")}</script>
`;
const out = path.join(repoRoot, "architecture/.site");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "map.fragment.html"), fragment);
writeFileSync(
  path.join(out, "map.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style></head><body>\n${fragment}</body></html>\n`,
);
console.info(
  `wrote architecture/.site/map.html: ${model.modules.length} modules, ${model.modules.reduce((sum, m) => sum + m.functions.length, 0)} functions, ${model.flows.length} flows`,
);
