import { describe, expect, it } from "vitest";
import english from "../../locales/en/common.json";
import simplified from "../../locales/zh-CN/common.json";
import traditional from "../../locales/zh-HK/common.json";

/**
 * Simplified or variant characters that must not appear in the Hong Kong
 * Traditional table (docs/frontend-v2-plan.md §2.4 item 13). Each entry keeps
 * the plan's term, the offending character and the Hong Kong form.
 *
 * `anywhere` marks characters that are never correct in zh-HK text, so they
 * fail on their own. The others (注, 復, 制, 並, 准, 簽) are correct in other
 * words (注意, 恢復, 制度, 並且, 批准, 簽名), so they fail only inside the
 * plan's term.
 */
const ZH_HK_FORBIDDEN = [
  { term: "搜寻", char: "寻", anywhere: true, use: "搜尋" },
  { term: "資讯", char: "讯", anywhere: true, use: "資訊" },
  { term: "注冊", char: "注", anywhere: false, use: "註冊" },
  { term: "復制", char: "復制", anywhere: false, use: "複製" },
  { term: "合並", char: "並", anywhere: false, use: "合併" },
  { term: "内", char: "内", anywhere: true, use: "內" },
  { term: "准備", char: "准", anywhere: false, use: "準備" },
  { term: "標准", char: "准", anywhere: false, use: "標準" },
  { term: "重復", char: "復", anywhere: false, use: "重複" },
  { term: "帐戶", char: "帐", anywhere: true, use: "帳戶" },
  { term: "標簽", char: "簽", anywhere: false, use: "標籤" },
  { term: "周", char: "周", anywhere: true, use: "週" },
] as const;

type Messages = { [key: string]: string | Messages };

function strings(value: Messages, prefix = ""): [string, string][] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string"
      ? [[path, child] as [string, string]]
      : strings(child, path);
  });
}

function violations(messages: Messages): string[] {
  return strings(messages).flatMap(([key, text]) =>
    ZH_HK_FORBIDDEN.flatMap(({ term, char, anywhere, use }) => {
      const found = anywhere ? text.includes(char) : text.includes(term);
      return found
        ? [`${key}: "${char}" in ${JSON.stringify(text)} (${term} → ${use})`]
        : [];
    }),
  );
}

describe("zh-HK Traditional-character lint", () => {
  it("rejects every §2.4 Simplified or variant form, naming key and character", () => {
    const sample: Messages = {};
    ZH_HK_FORBIDDEN.forEach(({ term }, index) => {
      sample[`case${index}`] = `前${term}後`;
    });
    sample.nested = { ok: "恢復、制度、並且、批准、簽名、注意" };
    const found = violations(sample);
    expect(found).toHaveLength(ZH_HK_FORBIDDEN.length);
    ZH_HK_FORBIDDEN.forEach(({ char }, index) => {
      expect(found[index]).toContain(`case${index}: "${char}"`);
    });
  });

  it("keeps the zh-HK dictionary free of the §2.4 characters", () => {
    expect(violations(traditional)).toEqual([]);
  });
});

describe("locale key parity", () => {
  const placeholders = (text: string) =>
    [...text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)]
      .map((match) => match[1])
      .sort();
  const english_ = new Map(strings(english));

  it.each([
    ["zh-CN", simplified],
    ["zh-HK", traditional],
  ] as const)(
    "%s has the English keys, plural forms and placeholders",
    (_, messages) => {
      const local = new Map(strings(messages));
      expect([...local.keys()].sort()).toEqual([...english_.keys()].sort());
      for (const [key, text] of english_) {
        if (key.endsWith("_one"))
          expect(local.has(key.replace(/_one$/, "_other"))).toBe(true);
        expect({ key, vars: placeholders(local.get(key) ?? "") }).toEqual({
          key,
          vars: placeholders(text),
        });
      }
    },
  );
});
