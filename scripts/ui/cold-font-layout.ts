import type { Page, Route } from "@playwright/test";

/** Capture the signed-out entry route from a genuinely cold font layout.
 * Native Chromium selects retain their first-layout metrics when optional web
 * fonts arrive. Hold font delivery until the route is styled and laid out so
 * network speed cannot choose between cold and warm native-control geometry.
 * The caller must still prepareFonts before taking any screenshot. */
export async function navigateColdFonts(
  page: Page,
  url: string,
  ready: () => Promise<void>,
) {
  let release!: () => void;
  const layout = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pattern = "**/fonts/*.woff2";
  const active = new Set<Promise<void>>();
  const hold = (route: Route) => {
    const handled = (async () => {
      await layout;
      await route.continue();
    })();
    active.add(handled);
    return handled.finally(() => active.delete(handled));
  };
  await page.route(pattern, hold);
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
    await ready();
    await page.evaluate(() => {
      for (const select of document.querySelectorAll("select"))
        select.getBoundingClientRect();
    });
    return response;
  } finally {
    release();
    try {
      await Promise.all(active);
    } finally {
      await page.unroute(pattern, hold);
    }
  }
}
