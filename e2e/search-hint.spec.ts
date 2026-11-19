import { expect, test } from "@playwright/test";
import { freshAccount, type TestLocale } from "./support/account";

test("search shows its keyboard hint on desktop and hides it on a touch phone", async ({
  page,
  browser,
}, info) => {
  await freshAccount(page, info.project.name as TestLocale);
  await page.getByTestId("open-search").click();
  await expect(page.getByTestId("search-input")).toBeVisible();
  await expect(page.locator(".search-footer")).toBeHidden();

  const desktop = await browser.newPage({
    baseURL: process.env.AUTH_URL,
    storageState: await page.context().storageState(),
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
  });
  try {
    await desktop.goto("/");
    await desktop.getByTestId("open-search").click();
    await expect(desktop.getByTestId("search-input")).toBeVisible();
    await expect(desktop.locator(".search-footer kbd")).toBeVisible();
  } finally {
    await desktop.close();
  }
});
