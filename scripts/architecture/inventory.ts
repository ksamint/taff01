// Reads what the code declares: tables, REST routes, MCP tools, core source
// files, pages, and which tables each core file imports. Nothing here is
// written by hand, so the architecture model cannot drift from the code.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const repoRoot = path.resolve(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");
const isTest = (file: string) =>
  /(\.test\.|\.spec\.|fixture|__fixtures__)/.test(file);
function walk(dir: string, keep: (file: string) => boolean): string[] {
  return readdirSync(path.join(repoRoot, dir), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(repoRoot, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .filter((file) => !file.includes("node_modules") && keep(file))
    .sort();
}

export type Table = { name: string; exportName: string };
export type Route = { method: string; path: string; file: string };
export type Tool = { name: string; title: string; file: string };
export type CoreFile = { file: string; name: string; tables: string[] };
export type Page = { route: string; file: string };
export type Inventory = {
  tables: Table[];
  routes: Route[];
  tools: Tool[];
  core: CoreFile[];
  pages: Page[];
};

export function tables(): Table[] {
  const source = read("packages/db/src/schema.ts");
  return [...source.matchAll(/export const (\w+) = pgTable\(\s*"(\w+)"/g)]
    .map(([, exportName, name]) => ({ name: name!, exportName: exportName! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function routes(): Route[] {
  const found: Route[] = [];
  for (const file of walk(
    "apps/api/src",
    (name) => name.endsWith(".ts") && !isTest(name),
  ))
    for (const [, method, route] of read(file).matchAll(
      /\bapp\.(get|post|patch|put|delete|all)\(\s*"([^"]+)"/g,
    ))
      found.push({ method: method!.toUpperCase(), path: route!, file });
  return found.sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
}

export function tools(): Tool[] {
  // The argument map names every tool; registerTool calls supply the titles.
  const titles = new Map<string, { title: string; file: string }>();
  for (const file of walk(
    "apps/api/src",
    (name) => /\/mcp[^/]*\.ts$/.test(name) && !isTest(name),
  ))
    for (const [, name, title] of read(file).matchAll(
      /registerTool\(\s*"([a-z_.]+)",\s*\{\s*title:\s*"([^"]+)"/g,
    ))
      titles.set(name!, { title: title!, file });
  const args = "apps/api/src/mcp-tool-args.ts";
  return [...read(args).matchAll(/^\s*"([a-z_.]+)":\s*mcp\w+Args/gm)]
    .map(([, name]) => ({
      name: name!,
      title: titles.get(name!)?.title ?? name!,
      file: titles.get(name!)?.file ?? "apps/api/src/mcp.ts",
    }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

export function core(known: Table[]): CoreFile[] {
  const byExport = new Map(known.map((t) => [t.exportName, t.name]));
  return walk(
    "packages/core/src",
    (name) => /^packages\/core\/src\/[^/]+\.m?ts$/.test(name) && !isTest(name),
  ).map((file) => {
    const used = new Set<string>();
    for (const [, names] of read(file).matchAll(
      /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"@taff\/db"/g,
    ))
      for (const raw of names!.split(",")) {
        const table = byExport.get(raw.replace(/^\s*type\s+/, "").trim());
        if (table) used.add(table);
      }
    return { file, name: path.basename(file), tables: [...used].sort() };
  });
}

export function pages(): Page[] {
  return walk(
    "apps/web/app",
    (name) => name.endsWith("/page.tsx") && !name.includes("/@modal/"),
  ).map((file) => {
    const route = file
      .replace(/^apps\/web\/app/, "")
      .replace(/\/page\.tsx$/, "")
      .replace(/\[([^\]]+)\]/g, ":$1");
    return { route: route || "/", file };
  });
}

export function inventory(): Inventory {
  const known = tables();
  return {
    tables: known,
    routes: routes(),
    tools: tools(),
    core: core(known),
    pages: pages(),
  };
}
