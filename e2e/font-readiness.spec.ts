import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { prepareFonts } from "../scripts/ui/prepare-fonts";

const text =
  "3 個項目中有 2 個按計劃進行。「結賬改版」最需要關注：「預發環境資料庫遷移」被阻礙，正在等待權限決定。3 個智能體正在工作。3 項交付等待你確認。";

// Optional font display plus late text exposed both fallback glyphs and two
// punctuation geometries despite fonts.ready. Exercise the actual shipped faces
// under controlled network order, without a screenshot/tolerance approximation.
test("capture fonts keep late text and punctuation stable across load orders", async ({
  browser,
}, info) => {
  test.setTimeout(60_000);
  const css = await readFile("apps/web/src/styles/tokens.css", "utf8");
  const results = [];
  let canonical: unknown;
  for (const late of [false, true]) {
    for (const order of ["immediate", "ascending", "descending"]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: "zh-HK",
      });
      try {
        const page = await context.newPage();
        await page.route("https://font.test/**", async (route) => {
          const name = new URL(route.request().url()).pathname
            .split("/")
            .at(-1)!;
          expect(name).toMatch(/^[\w-]+\.woff2$/);
          const index = Number(name.match(/-(\d+)\.woff2$/)?.[1] ?? 0);
          const delay =
            order === "ascending"
              ? index * 180
              : order === "descending"
                ? (7 - index) * 180
                : 0;
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          await route.fulfill({
            body: await readFile(`apps/web/public/fonts/${name}`),
            contentType: "font/woff2",
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        });
        await page.setContent(
          `<html lang="zh-HK"><head><base href="https://font.test/"><style>${css}body{margin:20px;font-family:var(--font-sans)}p{width:350px;font-size:14px;line-height:1.6;text-wrap:pretty}</style></head><body><p id="paragraph">${late ? "載入中" : text}</p></body></html>`,
        );
        await page.evaluate(prepareFonts);
        if (late)
          await page.locator("#paragraph").evaluate((el, value) => {
            el.textContent = value;
          }, text);
        await page.evaluate(prepareFonts);
        const measure = () =>
          page.locator("#paragraph").evaluate((element) => {
            const node = element.firstChild!;
            return [...node.textContent!].map((char, index) => {
              const range = document.createRange();
              range.setStart(node, index);
              range.setEnd(node, index + 1);
              const box = range.getBoundingClientRect();
              return { char, x: box.x, y: box.y, width: box.width };
            });
          });
        const geometry = await measure();
        canonical ??= geometry;
        expect(geometry).toEqual(canonical);
        const faceCount = await page.evaluate(() => document.fonts.size);
        for (let repeat = 0; repeat < 2; repeat++) {
          await page.evaluate(prepareFonts);
          expect(await page.evaluate(() => document.fonts.size)).toBe(
            faceCount,
          );
          expect(await measure()).toEqual(geometry);
        }
        const cdp = await context.newCDPSession(page);
        await cdp.send("DOM.enable");
        await cdp.send("CSS.enable");
        const { root } = await cdp.send("DOM.getDocument");
        const { nodeId } = await cdp.send("DOM.querySelector", {
          nodeId: root.nodeId,
          selector: "#paragraph",
        });
        const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", {
          nodeId,
        });
        expect(fonts.every((font) => font.isCustomFont)).toBe(true);
        expect(
          fonts.find((font) => font.familyName.includes("Noto Sans TC"))
            ?.glyphCount,
        ).toBe(66);
        results.push({ late, order, geometry, faceCount, fonts });
      } finally {
        await context.close();
      }
    }
  }
  await info.attach("font-readiness-matrix.json", {
    body: Buffer.from(JSON.stringify(results)),
    contentType: "application/json",
  });
});
