import { expect, test } from "@playwright/test";
import { htmlLang } from "../apps/web/src/lib/i18n";
import { freshAccount, messages, type TestLocale } from "./support/account";

test("saved locale renders before JavaScript and never authorizes a session", async ({
  page,
  browser,
}, info) => {
  const locale = info.project.name as TestLocale;
  await freshAccount(page, locale);
  await expect
    .poll(
      async () =>
        (await page.context().cookies()).find(
          (cookie) => cookie.name === "taff-locale",
        )?.value,
    )
    .toBe(locale);
  const preference = (await page.context().cookies()).find(
    (cookie) => cookie.name === "taff-locale",
  );
  if (!preference) throw new Error("Missing locale cookie");
  const context = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    locale: "en-US",
    javaScriptEnabled: false,
  });
  try {
    // Copy presentation only: no authentication or persisted private reads.
    await context.addCookies([preference]);
    const initial = await context.newPage();
    await initial.goto("/");
    await expect(initial.locator("html")).toHaveAttribute(
      "lang",
      htmlLang(locale),
    );
    await expect(initial.locator("main.loading")).toHaveText(
      messages[locale].loading,
    );
    const fontHint = initial.locator(
      'head link[rel="preload"][as="font"][href="/fonts/NotoSansTC-ui-common.woff2"]',
    );
    await expect(fontHint).toHaveCount(locale === "en" ? 0 : 1);
    if (locale !== "en") {
      await expect(fontHint).toHaveAttribute("fetchpriority", "low");
      await expect(fontHint).toHaveAttribute("crossorigin", "anonymous");
    }
    expect((await context.request.get("/api/me")).status()).toBe(401);
    await context.addCookies([{ ...preference, value: "untrusted-locale" }]);
    await initial.reload();
    await expect(initial.locator("html")).toHaveAttribute("lang", "en");
    await expect(initial.locator("main.loading")).toHaveText(
      messages.en.loading,
    );
    await expect(fontHint).toHaveCount(0);
  } finally {
    await context.close();
  }
});
