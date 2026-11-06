import { fileURLToPath } from "node:url";
import { build } from "esbuild";

await build({
  absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
  entryPoints: ["src/sw/sw.ts"],
  outfile: "public/sw.js",
  format: "iife",
  target: "es2022",
  bundle: true,
  minify: false,
  sourcemap: false,
});
