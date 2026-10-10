import { expect, type Page } from "@playwright/test";
import { messages, type TestLocale } from "./messages";

const languageNames = {
  en: /^English$/,
  "zh-CN": /^简体(?:中文)?$/,
  "zh-HK": /^繁體中文(?:（香港）)?$/,
};

export async function openMe(page: Page) {
  await expect(page.locator("main.content")).toBeVisible();
  await expect(page.locator("main.content")).not.toHaveAttribute("inert", "");
  if (new URL(page.url()).pathname !== "/me") {
    await page.locator('a[href="/me"]:visible').first().click();
    await expect(page).toHaveURL(/\/me(?:\?.*)?$/);
  }
  await expect(page.getByTestId("locale-select")).toBeVisible();
}

export async function expectLocaleReady(page: Page) {
  const control = page.getByTestId("locale-select");
  await expect(control).toBeVisible();
  if ((await control.evaluate((node) => node.tagName)) === "SELECT") {
    await expect(control).toBeEnabled();
  } else {
    const buttons = control.getByRole("button");
    await expect(buttons).toHaveCount(3);
    for (const button of await buttons.all())
      await expect(button).toBeEnabled();
  }
}

// Operate the current screen without awaiting its request. Held-response tests
// use this to inspect the optimistic language before resolving the mutation.
export async function chooseLocale(page: Page, locale: TestLocale) {
  await expectLocaleReady(page);
  const control = page.getByTestId("locale-select");
  if ((await control.evaluate((node) => node.tagName)) === "SELECT") {
    await control.selectOption(locale);
    await expect(control).toHaveValue(locale);
  } else {
    const button = control.getByRole("button", { name: languageNames[locale] });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
  }
}

export async function selectLocale(page: Page, locale: TestLocale) {
  const previous = new URL(page.url());
  await openMe(page);
  const control = page.getByTestId("locale-select");
  const selected =
    (await control.evaluate((node) => node.tagName)) === "SELECT"
      ? (await control.inputValue()) === locale
      : (await control
          .getByRole("button", { name: languageNames[locale] })
          .getAttribute("aria-pressed")) === "true";
  const saved = selected
    ? null
    : page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/profile" &&
          response.request().method() === "PATCH" &&
          response.request().postDataJSON()?.locale === locale,
      );
  await chooseLocale(page, locale);
  if (saved) expect((await saved).status()).toBe(200);
  await expectLocaleReady(page);
  if (previous.pathname !== "/me") {
    // Next links retain AppShell and its profile mutation state.
    const link = page.locator(`a[href="${previous.pathname}"]:visible`).first();
    if (await link.count()) {
      await link.click();
      await expect(page).toHaveURL(previous.href);
    } else await page.goto(previous.href);
  }
}

export async function signOutFromMe(page: Page, locale: TestLocale) {
  await openMe(page);
  await page
    .getByRole("button", { name: messages[locale].signOut, exact: true })
    .click();
  await expect(page).toHaveURL(new URL("/", process.env.AUTH_URL!).href);
  await expect(page.getByTestId("auth-submit")).toBeVisible();
}
