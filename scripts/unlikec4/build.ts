// Bundles the viewer with one ontology document into a self-contained page.
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { type Ontology, validate } from "./schema.ts";

export async function buildPage(doc: Ontology, title: string) {
  const problems = validate(doc);
  if (problems.length) throw new Error(problems.join("\n"));
  const bundle = await build({
    entryPoints: [path.join(import.meta.dirname, "viewer.ts")],
    bundle: true,
    format: "iife",
    minify: true,
    target: "es2020",
    write: false,
  });
  const script = bundle.outputFiles[0]?.text ?? "";
  const css = readFileSync(
    path.join(import.meta.dirname, "viewer.css"),
    "utf8",
  );
  const fragment = `<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap">
<style>
${css}</style>
<div id="app"></div>
<script type="application/json" id="unlikec4">${JSON.stringify(doc).replace(/</g, "\\u003c")}</script>
<script>
${script.replace(/<\/script/g, "<\\/script")}</script>
`;
  return {
    fragment,
    standalone: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}</style></head><body>\n${fragment}</body></html>\n`,
  };
}
