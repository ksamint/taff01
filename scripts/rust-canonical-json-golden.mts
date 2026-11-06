// Golden fixture for the Rust `canonical_json` port: the exact bytes
// `canonicalJson` in packages/core/src/trusted-review.ts produces, including
// JavaScript number formatting. Part of `pnpm rust:fixtures`.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../packages/core/src/trusted-review";

const cases: { name: string; input: unknown; bits?: string }[] = [
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

// SplitMix64 samples every exponent and both signs with deterministic mantissas.
let state = 0x7aff123456789abcn;
const mask = (1n << 64n) - 1n;
const view = new DataView(new ArrayBuffer(8));
for (let exponent = 0; exponent < 2048; exponent++)
  for (const sign of [0n, 1n]) {
    state = (state + 0x9e3779b97f4a7c15n) & mask;
    let random = state;
    random = ((random ^ (random >> 30n)) * 0xbf58476d1ce4e5b9n) & mask;
    random = ((random ^ (random >> 27n)) * 0x94d049bb133111ebn) & mask;
    random ^= random >> 31n;
    const bits =
      (sign << 63n) | (BigInt(exponent) << 52n) | (random & ((1n << 52n) - 1n));
    view.setBigUint64(0, bits);
    const value = view.getFloat64(0);
    cases.push({
      name: `ieee_${bits.toString(16).padStart(16, "0")}`,
      bits: bits.toString(16).padStart(16, "0"),
      input: value,
    });
    if (Number.isFinite(value))
      assert.equal(JSON.parse(canonicalJson(value)), value === 0 ? 0 : value);
  }
cases.push({
  name: "utf16_key_order",
  input: { "\uE000": 1, 𐀀: 2, a: 3, "12": 4, "2": 5 },
});
assert.equal(cases.filter((c) => c.bits).length, 4096);
const out = cases.map((c) => ({
  name: c.name,
  ...(c.bits ? { bits: c.bits } : {}),
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
