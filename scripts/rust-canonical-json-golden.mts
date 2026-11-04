// Golden fixture for the Rust `canonical_json` port: the exact bytes
// `canonicalJson` in packages/core/src/trusted-review.ts produces, including
// JavaScript number formatting. Part of `pnpm rust:fixtures`.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../packages/core/src/trusted-review";

const cases: { name: string; input: unknown }[] = [
  { name: "sorted_nested", input: { b: 1, a: { z: 2, c: 3 } } },
  { name: "arrays_keep_order", input: { list: [3, 1, 2, [{ y: 1, x: 2 }]] } },
  {
    name: "integers",
    input: [0, 1, -1, 42, 9007199254740991, -9007199254740991],
  },
  { name: "integral_floats", input: [1.0, 100.0, -5.0] },
  { name: "negative_zero", input: [-0, -0.0] },
  {
    name: "fractions",
    input: [0.1, 0.5, 1.5, -2.25, 123.456, 0.000001, 1e-7, 1.5e-7],
  },
  {
    name: "large_magnitudes",
    input: [1e20, 1e21, 1e22, 1.5e300, 12345678901234567890, 2 ** 64],
  },
  {
    name: "shortest_round_trip",
    input: [0.1 + 0.2, 1 / 3, 5e-324, 1.7976931348623157e308],
  },
  {
    name: "strings_escaped",
    input: {
      q: 'say "hi"',
      bs: "a\\b",
      nl: "line\nbreak",
      tab: "\t",
      cr: "\r",
      bell: "\u0007",
      nul: "\u0000",
      del: "\u007f",
    },
  },
  {
    name: "strings_unicode",
    input: { zh: "任务与日历", emoji: "🗓️", ls: " ", ps: " ", nbsp: " " },
  },
  {
    name: "primitives",
    input: { t: true, f: false, n: null, e: "", empty_obj: {}, empty_arr: [] },
  },
  {
    name: "receipt_like",
    input: {
      operation_hash: "ab",
      workspaceId: "ws",
      amount: "1200.50",
      version: 3,
      decision: "approve",
      items: [
        { id: "b", qty: 2 },
        { id: "a", qty: 1 },
      ],
    },
  },
];

const out = cases.map((c) => ({
  name: c.name,
  input: c.input,
  output: canonicalJson(c.input),
}));
const target = fileURLToPath(
  new URL(
    "../backend/crates/taff-core/tests/fixtures/canonical-json-golden.json",
    import.meta.url,
  ),
);
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${out.length} canonical JSON cases -> ${target}`);
