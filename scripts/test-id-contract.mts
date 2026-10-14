// Builds the UI contract the behavioural, perf and screenshot suites depend
// on: data-testid values (and which component renders each today), role/name
// locators, Schedule-X internals, CSS locators and locale-message lookups.
//
//   node node_modules/tsx/dist/cli.mjs scripts/test-id-contract.mts
//
// rewrites e2e/support/test-id-contract.md. scripts/test-id-contract.test.ts
// fails when a suite uses a test id that apps/web no longer renders.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Suites that drive the real app. prototype-shots drives docs/ui/prototype. */
export function suiteFiles(base = root) {
  const e2e = walk(path.join(base, "e2e")).filter((file) =>
    /\.(ts|mts)$/.test(file),
  );
  const scripts = readdirSync(path.join(base, "scripts"))
    .filter((name) => /^perf-.*\.mts$/.test(name))
    .map((name) => path.join(base, "scripts", name));
  const ui = ["app-shots.mjs", "a11y-audit.mjs"].map((name) =>
    path.join(base, "scripts/ui", name),
  );
  return [...e2e, ...scripts, ...ui]
    .filter((file) => !file.endsWith("test-id-contract.md"))
    .sort();
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "__screenshots__") return [];
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const rel = (file: string, base = root) =>
  path.relative(base, file).split(path.sep).join("/");

/** Reads a balanced (...) or {...} group starting at `open`. */
function group(text: string, open: number) {
  const close: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const stack = [close[text[open]]];
  let i = open + 1;
  while (i < text.length && stack.length) {
    const top = stack.at(-1);
    const c = text[i];
    if (top === "`") {
      if (c === "\\") i += 2;
      else if (c === "`") {
        stack.pop();
        i++;
      } else if (c === "$" && text[i + 1] === "{") {
        stack.push("}");
        i += 2;
      } else i++;
      continue;
    }
    if (top === '"' || top === "'") {
      if (c === "\\") i += 2;
      else {
        if (c === top) stack.pop();
        i++;
      }
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      i = text.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") stack.push(c);
    else if (close[c]) stack.push(close[c]);
    else if (c === top) stack.pop();
    i++;
  }
  return text.slice(open + 1, i - 1);
}

/** Reads a template literal at `start`; `${…}` parts become `*`. */
function template(text: string, start: number): [string, number] {
  let i = start + 1;
  let value = "";
  while (i < text.length && text[i] !== "`") {
    if (text[i] === "\\") {
      value += text[i + 1];
      i += 2;
    } else if (text[i] === "$" && text[i + 1] === "{") {
      i += group(text, i + 1).length + 3;
      value += "*";
    } else value += text[i++];
  }
  return [value.replace(/\*+/g, "*"), i + 1];
}

/** Reads a quoted string at `start`. */
function quoted(text: string, start: number): [string, number] {
  let i = start + 1;
  let value = "";
  while (i < text.length && text[i] !== text[start]) {
    if (text[i] === "\\") {
      value += text[i + 1];
      i += 2;
    } else value += text[i++];
  }
  return [value, i + 1];
}

/** String literals in an expression; template literals become `a*b` globs. */
function literals(expression: string) {
  const out: string[] = [];
  let i = 0;
  while (i < expression.length) {
    const c = expression[i];
    if (c === '"' || c === "'" || c === "`") {
      const [value, end] =
        c === "`" ? template(expression, i) : quoted(expression, i);
      if (value) out.push(value);
      i = end;
    } else i++;
  }
  return out;
}

/** The source of the `key:` property in an options object, whitespace folded. */
function property(args: string, key: string) {
  const at = new RegExp(`\\b${key}:\\s*`).exec(args);
  if (!at) return undefined;
  let i = at.index + at[0].length;
  const start = i;
  let depth = 0;
  while (i < args.length) {
    const c = args[i];
    if (c === '"' || c === "'" || c === "`") {
      i = (c === "`" ? template(args, i) : quoted(args, i))[1];
      continue;
    }
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) break;
      depth--;
    } else if (c === "," && depth === 0) break;
    i++;
  }
  return args.slice(start, i).replace(/\s+/g, " ").trim();
}

function callArguments(text: string, callee: RegExp) {
  const out: { args: string; index: number }[] = [];
  for (const match of text.matchAll(callee)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    out.push({ args: group(text, open), index: match.index ?? 0 });
  }
  return out;
}

type Uses = Map<string, Map<string, number>>;
function add(uses: Uses, key: string, file: string) {
  const files = uses.get(key) ?? new Map<string, number>();
  files.set(file, (files.get(file) ?? 0) + 1);
  uses.set(key, files);
}

export function scanSuites(base = root) {
  const testIds: Uses = new Map();
  const roles: Uses = new Map();
  const labels: Uses = new Map();
  const schedule: Uses = new Map();
  const css: Uses = new Map();
  const messages: Uses = new Map();
  for (const file of suiteFiles(base)) {
    const name = rel(file, base);
    const text = readFileSync(file, "utf8");
    for (const { args } of callArguments(text, /getByTestId\(/g))
      for (const id of literals(args)) add(testIds, id, name);
    for (const match of text.matchAll(/\[data-testid(\^?)=["']([^"']+)["']\]/g))
      add(testIds, match[1] ? `${match[2]}*` : match[2], name);
    for (const { args } of callArguments(text, /openDisclosure\(/g)) {
      const last = args.split(",").at(-1) ?? "";
      for (const id of literals(last)) add(testIds, id, name);
    }
    // Helper maps from a field name to the control's test id.
    for (const match of text.matchAll(
      /const (?:quickControls|controls) = \{/g,
    )) {
      const body = group(text, (match.index ?? 0) + match[0].length - 1);
      for (const id of literals(body)) add(testIds, id, name);
    }
    for (const { args } of callArguments(text, /getByRole\(/g)) {
      const role = literals(args.split(",")[0])[0] ?? args.split(",")[0].trim();
      const named = property(args, "name");
      add(roles, named ? `${role} — name: ${named}` : role, name);
    }
    for (const { args } of callArguments(text, /getByLabel\(/g))
      add(labels, args.split(/,\s*\{/)[0].trim(), name);
    for (const match of text.matchAll(/\.sx__[a-z0-9_-]+(\[[a-z-]+)?/g))
      add(schedule, match[0] + (match[1] ? "=…]" : ""), name);
    for (const { args } of callArguments(text, /\.locator\(/g)) {
      for (const selector of literals(args.split(/,\s*\{/)[0])) {
        if (/^(xpath=|:scope)/.test(selector) || selector === "..") continue;
        if (/\.sx__/.test(selector)) continue;
        if (/[.#[]/.test(selector)) add(css, selector, name);
      }
    }
    const aliases = [
      ...text.matchAll(/(?:const|let) ([A-Za-z_$][\w$]*) = messages\[/g),
    ].map((match) => match[1]);
    const roots = [
      String.raw`messages\[[^\]]+\]`,
      String.raw`messages\.(?:en|"zh-CN"|"zh-HK")`,
      ...aliases.map((alias) => String.raw`\b${alias}`),
    ];
    for (const prefix of roots)
      for (const match of text.matchAll(
        new RegExp(`${prefix}((?:\\.[A-Za-z_][\\w]*)+)(\\(|\\[)?`, "g"),
      )) {
        let parts = match[1].slice(1).split(".");
        if (match[2] === "(") parts = parts.slice(0, -1);
        if (!parts.length) continue;
        add(messages, parts.join(".") + (match[2] === "[" ? ".*" : ""), name);
      }
  }
  return { testIds, roles, labels, schedule, css, messages };
}

/** data-testid values rendered by apps/web, with the file that renders each. */
export function scanRenderers(base = root) {
  const rendered: Uses = new Map();
  const files = [
    ...walk(path.join(base, "apps/web/src")),
    ...walk(path.join(base, "apps/web/app")),
  ].filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
  for (const file of files) {
    const name = rel(file, base);
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/data-testid=/g)) {
      const at = (match.index ?? 0) + match[0].length;
      const value =
        text[at] === "{"
          ? group(text, at)
          : (/^"[^"]*"/.exec(text.slice(at))?.[0] ?? "");
      for (const id of literals(value))
        if (id.replace(/\*/g, "")) add(rendered, id, name);
    }
    // OrganizationChooser renders `${testIdPrefix}${item.id}`.
    for (const match of text.matchAll(/testIdPrefix="([^"]+)"/g))
      add(rendered, `${match[1]}*`, name);
  }
  return rendered;
}

const glob = (pattern: string) =>
  new RegExp(
    `^${pattern
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );
const fixed = (pattern: string) => pattern.split("*")[0];

/** Component files rendering a suite test id (static or glob). */
export function renderersOf(id: string, rendered: Uses) {
  const files = new Set<string>();
  for (const [value, where] of rendered) {
    const matches = id.includes("*")
      ? value.includes("*")
        ? fixed(value).startsWith(fixed(id)) ||
          fixed(id).startsWith(fixed(value))
        : glob(id).test(value)
      : glob(value).test(id);
    if (matches) for (const file of where.keys()) files.add(file);
  }
  return [...files].sort();
}

const total = (files: Map<string, number>) =>
  [...files.values()].reduce((sum, count) => sum + count, 0);
const short = (file: string) =>
  file.replace(/^apps\/web\/src\/components\//, "").replace(/^e2e\//, "");
const users = (files: Map<string, number>) =>
  [...files.keys()].map(short).sort().join(", ");
const cell = (value: string) => {
  const text = value.replace(/\|/g, "\\|");
  return text.includes("`") ? `\`\` ${text} \`\`` : `\`${text}\``;
};

export function renderContract(base = root) {
  const suites = scanSuites(base);
  const rendered = scanRenderers(base);
  const byScreen = new Map<string, string[]>();
  for (const id of [...suites.testIds.keys()].sort()) {
    const files = renderersOf(id, rendered);
    const screen = files.length ? short(files[0]) : "(not rendered)";
    byScreen.set(screen, [...(byScreen.get(screen) ?? []), id]);
  }
  const lines = [
    "# UI test contract (M13 prep)",
    "",
    "Generated by `node node_modules/tsx/dist/cli.mjs scripts/test-id-contract.mts`",
    "from `e2e/**/*.ts`, `scripts/perf-*.mts`, `scripts/ui/app-shots.mjs` and `scripts/ui/a11y-audit.mjs`",
    "(`scripts/ui/prototype-shots.mjs` drives the static prototype, not the app).",
    "Regenerate after changing a suite or a screen. The v2 screens must keep every",
    "test id below, the role/name and label locators, the Schedule-X internals,",
    "the CSS locators and the message keys, or change the suites in the same PR.",
    "`scripts/test-id-contract.test.ts` fails when a suite uses a test id that",
    "`apps/web` no longer renders.",
    "",
    "`*` stands for a dynamic part (an id, a key or a status). Perf scripts depend",
    "on `today-heading` and the `auth-*` ids; the visual suite",
    "(`e2e/ui-v2.spec.ts`) is listed with the rest.",
    "",
    `## Test ids (${suites.testIds.size} distinct, ${[...suites.testIds.values()].reduce((sum, files) => sum + total(files), 0)} uses)`,
    "",
    "Grouped by the component file that renders the id today (first match when",
    "several do). “Also rendered by” lists the other files.",
    "",
  ];
  const screens = [...byScreen.keys()].sort((a, b) =>
    a === "(not rendered)"
      ? 1
      : b === "(not rendered)"
        ? -1
        : a.localeCompare(b),
  );
  for (const screen of screens) {
    lines.push(`### ${screen}`, "");
    lines.push("| Test id | Uses | Also rendered by | Used in |");
    lines.push("| --- | ---: | --- | --- |");
    for (const id of byScreen.get(screen) ?? []) {
      const files = suites.testIds.get(id)!;
      const others = renderersOf(id, rendered)
        .map(short)
        .filter((file) => file !== screen)
        .join(", ");
      lines.push(
        `| ${cell(id)} | ${total(files)} | ${others} | ${users(files)} |`,
      );
    }
    lines.push("");
  }
  const table = (title: string, intro: string[], uses: Uses, label: string) => {
    lines.push(`## ${title}`, "", ...intro, "");
    lines.push(`| ${label} | Uses | Used in |`, "| --- | ---: | --- |");
    for (const [key, files] of [...uses].sort(([a], [b]) => a.localeCompare(b)))
      lines.push(`| ${cell(key)} | ${total(files)} | ${users(files)} |`);
    lines.push("");
  };
  table(
    "Role and name locators",
    [
      "`getByRole(role, { name })`. Native semantics the suites also rely on:",
      '`<dialog>` (`getByRole("dialog")`, `dialog.confirm-dialog`,',
      "`dialog.task-detail-sheet`, `xpath=ancestor::dialog[1]`), `<select>`",
      "(`selectOption`, `option[value=…]`) and `<details>`/`<summary>`",
      "(`openDisclosure`, the `open` attribute).",
    ],
    suites.roles,
    "Role — name",
  );
  table(
    "Label locators",
    ["`getByLabel(…)` arguments."],
    suites.labels,
    "Label",
  );
  table(
    "Schedule-X internals",
    [
      "`.sx__*` classes the calendar specs query, with the data attributes they",
      "read (`data-event-id`, `data-date`).",
    ],
    suites.schedule,
    "Selector",
  );
  table(
    "CSS locators",
    [
      "`locator(…)` selectors with a class, id or attribute (Schedule-X excluded).",
    ],
    suites.css,
    "Selector",
  );
  table(
    "Locale message lookups",
    [
      "Keys read from `apps/web/locales/*/common.json` through",
      "`messages[locale].<key>` (or an alias such as `const m = messages[locale]`).",
      "`.*` marks a computed last segment.",
    ],
    suites.messages,
    "Key",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  const target = path.join(root, "e2e/support/test-id-contract.md");
  writeFileSync(target, renderContract());
  console.log(`Wrote ${rel(target)}`);
}
