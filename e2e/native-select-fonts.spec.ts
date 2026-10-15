import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { prepareFonts } from "../scripts/ui/prepare-fonts";

// Native select inner line-height is cached separately from its current glyph
// font. Force a different-metric fallback so cold first installation is covered.
test("capture preparation refreshes native metrics without changing control state", async ({
  browser,
}, info) => {
  test.setTimeout(60_000);
  const css = await readFile("apps/web/src/styles/tokens.css", "utf8");
  const locale = info.project.use.locale ?? "en-US";
  const evidence = [];
  for (const label of ["English", "此項目：結賬改版"]) {
    let canonical:
      | { pixels: Buffer; lineHeight: string; textY: number }
      | undefined;
    for (const warm of [true, false])
      for (const delayed of [false, true])
        for (const late of [false, true]) {
          const context = await browser.newContext({
            viewport: { width: 390, height: 844 },
            locale,
            isMobile: true,
            hasTouch: true,
          });
          try {
            const page = await context.newPage();
            let release!: () => void;
            const downloads = new Promise<void>((resolve) => {
              release = resolve;
            });
            await page.route("https://native-font.test/**", async (route) => {
              const name = new URL(route.request().url()).pathname
                .split("/")
                .at(-1)!;
              expect(name).toMatch(/^[\w-]+\.woff2$/);
              await downloads;
              if (delayed)
                await new Promise((resolve) => setTimeout(resolve, 120));
              await route.fulfill({
                body: await readFile(`apps/web/public/fonts/${name}`),
                contentType: "font/woff2",
                headers: { "Access-Control-Allow-Origin": "*" },
              });
            });
            const controlHtml = `<select id="scope" aria-label="Scope"><option>${late ? "Project" : label}</option><option>繁體中文（香港）</option></select><select hidden style="display:none;color:rgb(1,2,3)"><option>Hidden</option></select>`;
            await page.setContent(
              `<!doctype html><html lang="${locale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><base href="https://native-font.test/"><style>${css}body{margin:20px;padding-top:200px;min-height:1600px;--font-sans:Manrope,"Noto Sans TC",Arial,sans-serif;font-family:var(--font-sans);font-size:13px}select{font:inherit;width:240px;height:46px}#scroll{width:300px;height:100px;overflow:auto}#inside{padding:40px 0 160px}</style></head><body><div id="scroll"><div id="inside">${warm ? `<span id="preload">English 此項目：結賬改版 繁體中文（香港） Project Hidden</span>` : controlHtml}</div></div></body></html>`,
              { waitUntil: "domcontentloaded" },
            );
            const cdp = await context.newCDPSession(page);
            await cdp.send("DOM.enable");
            await cdp.send("CSS.enable");
            const metrics = async () => {
              const { root } = await cdp.send("DOM.getDocument", {
                depth: -1,
                pierce: true,
              });
              const { nodeId } = await cdp.send("DOM.querySelector", {
                nodeId: root.nodeId,
                selector: "#scope",
              });
              const { node } = await cdp.send("DOM.describeNode", {
                nodeId,
                depth: -1,
                pierce: true,
              });
              const inner = node.shadowRoots?.[0]?.children?.find((child) =>
                child.attributes?.includes("-internal-select-inner-element"),
              );
              expect(
                inner,
                "Chromium native select inner renderer",
              ).toBeDefined();
              const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", {
                nodeId: inner!.nodeId,
              });
              const { object } = await cdp.send("DOM.resolveNode", {
                nodeId: inner!.nodeId,
              });
              const { result } = await cdp.send("Runtime.callFunctionOn", {
                objectId: object.objectId!,
                returnByValue: true,
                functionDeclaration:
                  "function(){const range=document.createRange();range.selectNodeContents(this);return {lineHeight:getComputedStyle(this).lineHeight,textY:range.getBoundingClientRect().y}}",
              });
              return {
                ...(result.value as { lineHeight: string; textY: number }),
                fonts,
              };
            };
            // Cold controls must actually lay out with fallback metrics before
            // the font bytes are released. Warm controls are created afterwards.
            const fallback = warm ? null : await metrics();
            if (fallback && label === "English") {
              expect(fallback.fonts.some((font) => !font.isCustomFont)).toBe(
                true,
              );
              expect(fallback.lineHeight).not.toBe(canonical!.lineHeight);
            }
            release();
            if (warm) {
              await page.evaluate(prepareFonts);
              await page.locator("#inside").evaluate((element, html) => {
                element.innerHTML = html;
              }, controlHtml);
            }
            const control = page.getByRole("combobox", { name: "Scope" });
            await page.evaluate(prepareFonts);
            const initialPrepared = await metrics();
            if (!late && canonical)
              expect(
                initialPrepared.lineHeight,
                "First installation must replace cached fallback metrics",
              ).toBe(canonical.lineHeight);
            if (late) {
              await control.evaluate((element, text) => {
                (element as HTMLSelectElement).options[0].text = text;
              }, label);
            }
            await control.focus();
            await page.locator("#scroll").evaluate((element) => {
              element.scrollTop = 20;
            });
            await page.evaluate(() => {
              scrollTo(0, 60);
              const current = window as typeof window & {
                nativeEvents?: string[];
              };
              current.nativeEvents = [];
              for (const name of ["focus", "blur", "input", "change"])
                document.addEventListener(
                  name,
                  (event) => {
                    if (event.target instanceof HTMLSelectElement)
                      current.nativeEvents!.push(event.type);
                  },
                  true,
                );
            });
            const state = () =>
              page.evaluate(() => ({
                html: document.documentElement.outerHTML,
                selected: [...document.querySelectorAll("select")].map(
                  (element) => [
                    element.value,
                    element.selectedIndex,
                    element.getAttribute("style"),
                  ],
                ),
                activeId: document.activeElement?.id,
                focusVisible: document.activeElement?.matches(":focus-visible"),
                scroll: document.querySelector("#scroll")!.scrollTop,
                windowScroll: [scrollX, scrollY],
                nativeEvents: (
                  window as typeof window & { nativeEvents?: string[] }
                ).nativeEvents,
              }));
            const before = await state();
            await page.evaluate(() => {
              const current = window as typeof window & {
                __taffActiveCaptureFaces?: FontFace[];
                removedLiveFaces?: number;
              };
              const retained = new Set(current.__taffActiveCaptureFaces);
              const remove = document.fonts.delete.bind(document.fonts);
              current.removedLiveFaces = 0;
              document.fonts.delete = (face: FontFace) => {
                if (retained.has(face)) current.removedLiveFaces!++;
                return remove(face);
              };
            });
            await page.evaluate(prepareFonts);
            expect(await state()).toEqual(before);
            const prepared = await metrics();
            const first = await control.screenshot();
            canonical ??= {
              pixels: first,
              lineHeight: prepared.lineHeight,
              textY: prepared.textY,
            };
            expect(
              first,
              "Native baseline must match warm fonts across cold/late text and download timing",
            ).toEqual(canonical.pixels);
            expect(prepared.lineHeight).toBe(canonical.lineHeight);
            expect(prepared.textY).toBe(canonical.textY);
            expect(prepared.fonts.every((font) => font.isCustomFont)).toBe(
              true,
            );
            expect(
              prepared.fonts.reduce(
                (count, font) => count + font.glyphCount,
                0,
              ),
            ).toBe(label.length);
            const faceCount = await page.evaluate(() => document.fonts.size);
            for (let repeat = 0; repeat < 2; repeat++) {
              await page.evaluate(prepareFonts);
              expect(await state()).toEqual(before);
              expect(await page.evaluate(() => document.fonts.size)).toBe(
                faceCount,
              );
              expect(await control.screenshot()).toEqual(canonical.pixels);
              expect((await metrics()).lineHeight).toBe(canonical.lineHeight);
            }
            expect(
              await page.evaluate(
                () =>
                  (window as typeof window & { removedLiveFaces?: number })
                    .removedLiveFaces,
              ),
            ).toBe(0);
            evidence.push({
              label,
              warm,
              delayed,
              late,
              ...prepared,
              fallback,
              initialPrepared,
              faceCount,
              stableCaptures: 3,
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
