// Fails when any installed package carries a licence outside the allow list in
// instruction_v0.md, except the documented MPL-2.0 exceptions (ADR 0003) and
// packages whose licence file is verified by hash (ADR 0006).
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALLOWED = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "CC0-1.0",
  "CC-BY-4.0",
  "Unlicense",
  "BlueOak-1.0.0",
  "Python-2.0",
  "MIT-0",
]);
/**
 * MPL-2.0 components of the prescribed Next.js and Tailwind stack, plus
 * axe-core as a development-only Lighthouse dependency (ADR 0003 amendment).
 */
const MPL_EXCEPTIONS = new Set(["lightningcss", "@vercel/og", "axe-core"]);
/** Packages without a manifest licence field whose LICENSE file is verified. */
const FILE_VERIFIED: Record<string, { file: string; sha256: string }> = {
  "@schedule-x/resize": {
    file: "LICENSE",
    sha256: "c38937352e57d6e95aca6506641c3319ab4fe26ecb71350021c35a3bc29c14f9",
  },
};
const store = "node_modules/.pnpm";
const seen = new Map<string, { licence: string; dir: string }>();

function normalise(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(normalise).join(" OR ");
  if (value && typeof value === "object" && "type" in value)
    return String((value as { type: unknown }).type);
  return "UNKNOWN";
}
function expressionAllowed(expression: string): boolean {
  // "(MIT OR Apache-2.0)" style expressions pass when any alternative is allowed;
  // "AND" expressions need every part allowed.
  const cleaned = expression.replace(/[()]/g, "");
  if (cleaned.includes(" OR "))
    return cleaned.split(" OR ").some((part) => expressionAllowed(part.trim()));
  if (cleaned.includes(" AND "))
    return cleaned
      .split(" AND ")
      .every((part) => expressionAllowed(part.trim()));
  return ALLOWED.has(cleaned);
}
function visit(dir: string) {
  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) return;
  const pkg = JSON.parse(readFileSync(manifest, "utf8")) as {
    name?: string;
    version?: string;
    license?: unknown;
    licenses?: unknown;
  };
  if (!pkg.name || !pkg.version) return;
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  seen.set(key, { licence: normalise(pkg.license ?? pkg.licenses), dir });
}
for (const entry of readdirSync(store)) {
  const base = join(store, entry, "node_modules");
  if (!existsSync(base)) continue;
  for (const name of readdirSync(base)) {
    if (name.startsWith("@")) {
      for (const scoped of readdirSync(join(base, name)))
        visit(join(base, name, scoped));
    } else visit(join(base, name));
  }
}
// Next.js bundles third-party code under dist/compiled with its own manifests.
for (const [key, { dir }] of seen) {
  if (!key.startsWith("next@")) continue;
  const compiled = join(dir, "dist", "compiled");
  if (!existsSync(compiled)) continue;
  for (const name of readdirSync(compiled)) {
    const target = join(compiled, name);
    if (name.startsWith("@")) {
      for (const scoped of readdirSync(target)) visit(join(target, scoped));
    } else visit(target);
  }
}
const failures: string[] = [];
const exceptions: string[] = [];
for (const [key, { licence, dir }] of seen) {
  const name = key.slice(0, key.lastIndexOf("@"));
  if (expressionAllowed(licence)) continue;
  if (
    licence === "MPL-2.0" &&
    [...MPL_EXCEPTIONS].some((e) => name === e || name.startsWith(`${e}-`))
  ) {
    exceptions.push(`${key} MPL-2.0 (ADR 0003)`);
    continue;
  }
  const verified = FILE_VERIFIED[name];
  if (verified) {
    const path = join(dir, verified.file);
    const digest = existsSync(path)
      ? createHash("sha256").update(readFileSync(path)).digest("hex")
      : "missing";
    if (digest === verified.sha256) {
      exceptions.push(`${key} MIT by verified ${verified.file} (ADR 0006)`);
      continue;
    }
    failures.push(
      `${key}: ${verified.file} hash ${digest} does not match the recorded MIT text`,
    );
    continue;
  }
  failures.push(`${key}: ${licence}`);
}
console.log(
  `${seen.size} packages checked; ${exceptions.length} documented exceptions`,
);
for (const line of exceptions) console.log(`  allowed  ${line}`);
if (failures.length) {
  console.error("Licence gate failed:");
  for (const line of failures) console.error(`  refused  ${line}`);
  process.exit(1);
}
console.log("Licence gate passed");
