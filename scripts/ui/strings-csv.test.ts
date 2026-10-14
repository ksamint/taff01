import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const csvText = readFileSync(
  new URL("docs/ui/prototype-v2/strings.csv", root),
  "utf8",
);
const enLocale = JSON.parse(
  readFileSync(new URL("apps/web/locales/en/common.json", root), "utf8"),
) as Record<string, unknown>;

const HEADER = ["prototype_key", "app_key", "zh-HK", "en", "zh-CN", "source"];
// Simplified or variant characters the Traditional table must not contain
// (frontend v2 plan §2.4 item 13). 周 is checked on its own: the table uses 週.
const FORBIDDEN_ZH_HK = [
  "搜寻",
  "資讯",
  "注冊",
  "復制",
  "合並",
  "内",
  "准備",
  "標准",
  "重復",
  "帐戶",
  "標簽",
  "周",
];

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, LF records. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("unterminated quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function flatKeys(value: unknown, prefix = "", keys = new Set<string>()) {
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatKeys(child, prefix ? `${prefix}.${key}` : key, keys);
    }
  } else {
    keys.add(prefix);
  }
  return keys;
}

const rows = parseCsv(csvText);
const [header, ...records] = rows;

describe("prototype v2 strings.csv", () => {
  it("is UTF-8 text with LF line endings and no BOM", () => {
    expect(csvText.charCodeAt(0)).not.toBe(0xfeff);
    expect(csvText).not.toContain("\r");
    expect(csvText.endsWith("\n")).toBe(true);
  });

  it("has the exact header", () => {
    expect(header).toEqual(HEADER);
  });

  it("has six fields in every row", () => {
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(record, record[0]).toHaveLength(HEADER.length);
    }
  });

  it("has no simplified or variant characters in zh-HK", () => {
    for (const [key, , zhHK] of records) {
      for (const forbidden of FORBIDDEN_ZH_HK) {
        expect(zhHK.includes(forbidden), `${key}: ${forbidden}`).toBe(false);
      }
    }
  });

  it("has no duplicate prototype keys", () => {
    const keys = records.map(([key]) => key);
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual(
      [],
    );
  });

  it("reuses only app keys that exist in the en locale", () => {
    const appKeys = flatKeys(enLocale);
    const missing = records
      .map(([, appKey]) => appKey)
      .filter((appKey) => appKey !== "" && !appKey.startsWith("new:"))
      .filter((appKey) => !appKeys.has(appKey));
    expect(missing).toEqual([]);
  });
});
