// Checks the archived audit pack in docs/audit without a database,
// credentials or network (ADR 0030 port of the former verify.py). Its file
// and line references describe the source commit recorded in snapshot.json,
// so they are read from that commit, never from the working tree.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const AUDIT = new URL("../docs/audit/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, AUDIT), "utf8");

/** RFC 4180 CSV (quotes, doubled quotes, embedded newlines), as Python's csv. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header = [], ...body] = rows;
  return body.map((values) =>
    Object.fromEntries(header.map((key, index) => [key, values[index] ?? ""])),
  );
}

export const AUDIT_TABLES = [
  "routes",
  "models",
  "permissions",
  "audit_points",
  "cross_calls",
  "links",
  "priorities",
  "tree",
] as const;

export function auditTable(name: string) {
  return parseCsv(read(`${name}.csv`));
}

export function auditSourceCommit(): string {
  return (JSON.parse(read("snapshot.json")) as { git: { sha: string } }).git
    .sha;
}

/** Every file:line reference, checked against the pinned commit's tree. */
export function referenceErrors(sha: string): string[] {
  const errors: string[] = [];
  const lengths = new Map<string, number | null>();
  const lineCount = (file: string) => {
    if (!lengths.has(file)) {
      try {
        const text = execFileSync("git", ["show", `${sha}:${file}`], {
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        });
        lengths.set(
          file,
          text.split(/\r\n|\n|\r/).length - (text.endsWith("\n") ? 1 : 0),
        );
      } catch {
        lengths.set(file, null);
      }
    }
    return lengths.get(file);
  };
  for (const name of AUDIT_TABLES)
    for (const row of auditTable(name)) {
      const file = row.file ?? "";
      if (!file) continue;
      if (
        file
          .split("/")
          .some(
            (part) =>
              part.startsWith(".") ||
              ["secrets", "credentials", "node_modules"].includes(part),
          )
      ) {
        errors.push(`${name}: excluded path ${file}`);
        continue;
      }
      const lines = lineCount(file);
      const line = Number(row.line);
      if (lines === null || lines === undefined)
        errors.push(`${name}: missing ${file}`);
      else if (!(Number.isInteger(line) && line > 0 && line <= lines))
        errors.push(`${name}: ${file}:${row.line} outside 1..${lines}`);
    }
  return errors;
}

export function manifestServices(): string[] {
  const { services } = JSON.parse(read("manifest.json")) as {
    services: string[] | Record<string, unknown>;
  };
  // Python's set() of a mapping is its keys.
  return Array.isArray(services) ? services : Object.keys(services);
}

export function auditHtml(): string {
  return read("index.html");
}
