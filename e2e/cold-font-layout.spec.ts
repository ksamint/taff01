import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { expect, test } from "@playwright/test";
import { navigateColdFonts } from "../scripts/ui/cold-font-layout";
import { prepareFonts } from "../scripts/ui/prepare-fonts";

test("cold navigation drains held fonts and preserves caller routes on success and failure", async ({
  browser,
}) => {
  const css = await readFile("apps/web/src/styles/tokens.css", "utf8");
  let requests = 0;
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith("/fonts/")) {
      requests++;
      const name = request.url.split("/").at(-1)!;
      if (!/^[\w-]+\.woff2$/.test(name)) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader("Content-Type", "font/woff2");
      response.end(await readFile(`apps/web/public/fonts/${name}`));
    } else {
      response.setHeader("Content-Type", "text/html;charset=utf-8");
      response.end(
        `<html><head><style>${css}body{font-family:var(--font-sans)}select{font:inherit}</style></head><body><select><option>English</option></select></body></html>`,
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  const url = `http://127.0.0.1:${address.port}`;
  try {
    for (const fail of [false, true]) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        let callerRoute = 0;
        await page.route("**/caller-owned", async (route) => {
          callerRoute++;
          await route.fulfill({ body: "preserved" });
        });
        const before = requests;
        const navigation = navigateColdFonts(page, url, async () => {
          await expect(page.getByRole("combobox")).toBeVisible();
          expect(requests).toBe(before);
          expect(
            await page.evaluate(() =>
              [...document.fonts].some((face) => face.status === "loaded"),
            ),
          ).toBe(false);
          if (fail) throw new Error("intentional readiness failure");
        });
        if (fail)
          await expect(navigation).rejects.toThrow(
            "intentional readiness failure",
          );
        else expect((await navigation)?.status()).toBe(200);
        await page.evaluate(prepareFonts);
        expect(requests).toBeGreaterThan(before);
        expect(
          await page.evaluate(() =>
            [...document.fonts].some((face) => face.status === "loaded"),
          ),
        ).toBe(true);
        expect(
          await page.evaluate(
            (base) =>
              fetch(`${base}/caller-owned`).then((response) => response.text()),
            url,
          ),
        ).toBe("preserved");
        expect(callerRoute).toBe(1);
      } finally {
        await context.close();
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
