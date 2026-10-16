import { expect, test } from "@playwright/test";
import { messages, type TestLocale } from "./support/account";

for (const [device, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1280, height: 800 }],
] as const) {
  test(`headline rotation preserves sign-in position and typed text (${device})`, async ({
    page,
  }, info) => {
    const locale = info.project.name as TestLocale;
    const m = messages[locale];
    await page.setViewportSize(viewport);
    await page
      .context()
      .addCookies([
        { name: "taff-locale", value: locale, url: process.env.AUTH_URL! },
      ]);
    await page.clock.install();
    await page.goto("/");
    const headline = page.locator(".landing-title");
    await expect(headline).toHaveText(m.home.headline1);
    await page.evaluate(() => document.fonts.ready);
    const input = page.getByTestId("auth-email");
    await input.fill("still_typing");
    const initial = (await input.boundingBox())!;
    for (const text of [m.home.headline2, m.home.headline3, m.home.headline1]) {
      await page.clock.fastForward(4000);
      await expect(headline).toHaveText(text);
      expect(Math.abs((await input.boundingBox())!.y - initial.y)).toBeLessThan(
        0.5,
      );
      await expect(input).toBeFocused();
      await expect(input).toHaveValue("still_typing");
    }
  });
}
