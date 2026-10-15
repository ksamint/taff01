import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { prepareFonts } from "../scripts/ui/prepare-fonts";

// No app, API, fixtures or baseline update: exercise the shipped fonts and the
// browser's native select paint across controlled load/preparation sequences.
test("capture preparation retains live faces and native selected text", async ({
  browser,
}, info) => {
  test.setTimeout(60_000);
  const css = await readFile("apps/web/src/styles/tokens.css", "utf8");
  const locale = info.project.use.locale ?? "en-US";
  const evidence = [];
  let canonical: Buffer | undefined;
  for (const late of [false, true]) {
    for (const delayed of [false, true]) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        locale,
        isMobile: true,
        hasTouch: true,
      });
      try {
        const page = await context.newPage();
        await page.route("https://native-font.test/**", async (route) => {
          const name = new URL(route.request().url()).pathname
            .split("/")
            .at(-1)!;
          expect(name).toMatch(/^[\w-]+\.woff2$/);
          if (delayed) await new Promise((resolve) => setTimeout(resolve, 120));
          await route.fulfill({
            body: await readFile(`apps/web/public/fonts/${name}`),
            contentType: "font/woff2",
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        });
        await page.setContent(
          `<html lang="${locale}"><head><base href="https://native-font.test/"><style>${css}body{margin:20px;font-family:var(--font-sans);font-size:16px}select{font:inherit;width:240px;height:46px}</style></head><body><select id="scope"><option>${late ? "Project" : "此項目：結賬改版"}</option><option>Workspace</option></select></body></html>`,
        );
        await page.evaluate(prepareFonts);
        await page.evaluate(() => {
          const state = window as typeof window & {
            __taffActiveCaptureFaces?: FontFace[];
            removedLiveFaces?: number;
          };
          const retained = new Set(state.__taffActiveCaptureFaces);
          const remove = document.fonts.delete.bind(document.fonts);
          state.removedLiveFaces = 0;
          document.fonts.delete = (face: FontFace) => {
            if (retained.has(face)) state.removedLiveFaces!++;
            return remove(face);
          };
        });
        // A late selected label needs more subsets while the Latin face stays live.
        if (late)
          await page
            .locator("option")
            .first()
            .evaluate((element) => {
              element.textContent = "此項目：結賬改版";
            });
        await page.evaluate(prepareFonts);
        const control = page.getByRole("combobox");
        const first = await control.screenshot();
        canonical ??= first;
        expect(
          first,
          "Selected text must match across cold/late text and load orders",
        ).toEqual(canonical);
        const size = await page.evaluate(() => document.fonts.size);
        for (let repeat = 0; repeat < 3; repeat++) {
          await page.evaluate(prepareFonts);
          expect(await page.evaluate(() => document.fonts.size)).toBe(size);
          expect(await control.screenshot()).toEqual(first);
        }
        expect(
          await page.evaluate(
            () =>
              (window as typeof window & { removedLiveFaces?: number })
                .removedLiveFaces,
          ),
          "Repeated preparation must never delete a still-used capture face",
        ).toBe(0);
        const cdp = await context.newCDPSession(page);
        await cdp.send("DOM.enable");
        await cdp.send("CSS.enable");
        const { root } = await cdp.send("DOM.getDocument");
        const { nodeId } = await cdp.send("DOM.querySelector", {
          nodeId: root.nodeId,
          selector: "#scope",
        });
        const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", {
          nodeId,
        });
        expect(fonts.length).toBeGreaterThan(0);
        expect(fonts.every((font) => font.isCustomFont)).toBe(true);
        expect(
          fonts.find((font) => font.familyName.includes("Noto Sans TC"))
            ?.glyphCount,
        ).toBe(8);
        evidence.push({
          late,
          delayed,
          fonts,
          faceCount: size,
          stableCaptures: 4,
        });
      } finally {
        await context.close();
      }
    }
  }
  await info.attach("native-select-fonts.json", {
    body: Buffer.from(JSON.stringify(evidence)),
    contentType: "application/json",
  });
});
