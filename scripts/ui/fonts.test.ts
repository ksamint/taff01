import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { expect, test } from "vitest";

const directory = "apps/web/public/fonts/";
const manifest = JSON.parse(
  readFileSync(`${directory}v021-subsets.json`, "utf8"),
) as {
  subsets: {
    file: string;
    mappings: number;
    unicodeRange: string;
    bytes: number;
    sha256: string;
  }[];
};
const css = readFileSync("apps/web/src/styles/tokens.css", "utf8");
const points = (range: string) =>
  [...range.matchAll(/U\+([\dA-F]+)(?:-([\dA-F]+))?/g)].flatMap((match) => {
    const first = Number.parseInt(match[1], 16);
    const last = Number.parseInt(match[2] ?? match[1], 16);
    return Array.from(
      { length: last - first + 1 },
      (_, index) => first + index,
    );
  });

test("font assets match their audited hashes, sizes, and CSS coverage", () => {
  for (const asset of manifest.subsets) {
    const file = `${directory}${asset.file}`;
    expect(statSync(file).size).toBe(asset.bytes);
    expect(createHash("sha256").update(readFileSync(file)).digest("hex")).toBe(
      asset.sha256,
    );
    const rule = css
      .split("@font-face")
      .find((item) => item.includes(`/fonts/${asset.file}`));
    expect(rule).toBeDefined();
    const range = rule!.match(/unicode-range:\s*([^;]+);/)![1];
    expect(points(range)).toEqual(points(asset.unicodeRange));
    expect(points(range)).toHaveLength(asset.mappings);
  }
});

test("all three locales' CJK strings have a bundled glyph range", () => {
  const cjkRules = css
    .split("@font-face")
    .filter((rule) => rule.includes('font-family: "Noto Sans TC"'));
  for (const rule of cjkRules) expect(rule).toMatch(/font-weight:\s*300 600;/);
  const allPoints = cjkRules.flatMap((rule) =>
    points(rule.match(/unicode-range:\s*([^;]+);/)![1]),
  );
  expect(new Set(allPoints).size).toBe(allPoints.length);
  const covered = new Set(
    cjkRules.flatMap((rule) =>
      points(rule.match(/unicode-range:\s*([^;]+);/)![1]),
    ),
  );
  for (const locale of ["en", "zh-CN", "zh-HK"]) {
    const dictionary = JSON.parse(
      readFileSync(`apps/web/locales/${locale}/common.json`, "utf8"),
    );
    const values = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : value && typeof value === "object"
          ? Object.values(value).flatMap(values)
          : [];
    const missing = [...new Set(values(dictionary).join(""))].filter((char) => {
      const code = char.codePointAt(0)!;
      return code >= 0x3400 && code <= 0x9fff && !covered.has(code);
    });
    expect(missing, locale).toEqual([]);
  }
});

test("English relations symbols stay in tiny disjoint assets", () => {
  const remaining = manifest.subsets.filter((asset) =>
    /^NotoSansTC-ui-(content|details)-/.test(asset.file),
  );
  expect(remaining).toHaveLength(10);
  expect(remaining.reduce((sum, asset) => sum + asset.mappings, 0)).toBe(724);
  for (const asset of remaining) {
    expect(asset.bytes).toBeLessThanOrEqual(48 * 1024);
    expect(asset.mappings).toBeLessThanOrEqual(80);
  }
  const symbols = manifest.subsets.find(
    (asset) => asset.file === "NotoSansTC-ui-symbols.woff2",
  )!;
  const math = manifest.subsets.find(
    (asset) => asset.file === "NotoSansMath-ui.woff2",
  )!;
  expect(points(symbols.unicodeRange)).toContain(0x2194);
  expect(
    remaining.flatMap((asset) => points(asset.unicodeRange)),
  ).not.toContain(0x2194);
  expect(symbols.bytes + math.bytes).toBeLessThan(6000);
  expect(points(math.unicodeRange)).toEqual([0x21b3]);
  expect(
    manifest.subsets.find((asset) => asset.file === "NotoSansSC-ui.woff2")!
      .mappings,
  ).toBeGreaterThanOrEqual(172);
});
