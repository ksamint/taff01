import { expect, test } from "@playwright/test";
import { messages, type TestLocale } from "./support/account";

// Fresh contexts have no saved presentation or authentication state.
test("fresh browser language agrees between server HTML and hydrated home", async ({
  browser,
}) => {
  for (const [language, locale, lang] of [
    ["ja-JP", "zh-HK", "zh-Hant-HK"],
    ["en-US", "en", "en"],
    ["zh-CN", "zh-CN", "zh-Hans-CN"],
    ["en-HK", "zh-HK", "zh-Hant-HK"],
    ["pt-MO", "zh-HK", "zh-Hant-HK"],
  ] as const) {
    const context = await browser.newContext({
      baseURL: process.env.AUTH_URL,
      locale: language,
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      const response = await page.goto("/");
      expect(await response!.text()).toContain(`<html lang="${lang}"`);
      await expect(page.locator(".landing-title")).toHaveText(
        messages[locale].home.headline1,
      );
      await expect(page.getByTestId("locale-select")).toHaveValue(locale);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
    } finally {
      await context.close();
    }
  }
});

test("headline rotates every four seconds and holds under reduced motion", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  await page
    .context()
    .addCookies([
      { name: "taff-locale", value: locale, url: process.env.AUTH_URL! },
    ]);
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  const headline = page.locator(".landing-title");
  const m = messages[locale];
  await expect(headline).toHaveText(m.home.headline1);
  await page.clock.fastForward(4000);
  await expect(headline).toHaveText(m.home.headline2);
  await page.clock.fastForward(4000);
  await expect(headline).toHaveText(m.home.headline3);
  await page.clock.fastForward(4000);
  await expect(headline).toHaveText(m.home.headline1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(headline).toHaveText(m.home.headline1);
  await page.clock.fastForward(12_000);
  await expect(headline).toHaveText(m.home.headline1);
});
