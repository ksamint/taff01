import { expect, type Page } from "@playwright/test";
import en from "../../apps/web/locales/en/common.json";
import zhCN from "../../apps/web/locales/zh-CN/common.json";
import zhHK from "../../apps/web/locales/zh-HK/common.json";
import { meSchema } from "../../packages/schemas/src/index";
export const messages = { en, "zh-CN": zhCN, "zh-HK": zhHK };
export type TestLocale = keyof typeof messages;
export async function freshAccount(page: Page, locale: TestLocale) {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  const response = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: process.env.AUTH_URL! },
    data: {
      name: `M7 ${locale}`,
      email: `m7-${crypto.randomUUID()}@example.test`,
      password: process.env.DEMO_PASSWORD,
    },
  });
  expect(response.status()).toBe(200);
  await page.goto("/");
  await expect(page.getByTestId("today-heading")).toBeVisible();
  if (locale !== "en") {
    const saved = page.waitForResponse(
      (result) =>
        new URL(result.url()).pathname === "/api/profile" &&
        result.request().method() === "PATCH",
    );
    await page.getByTestId("locale-select").selectOption(locale);
    expect((await saved).status()).toBe(200);
  }
  await expect(page.getByTestId("today-heading")).toHaveText(
    messages[locale].today,
  );
  const zone = await page.evaluate(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  await expect
    .poll(
      async () =>
        meSchema.parse(await (await page.request.get("/api/me")).json()).user
          .tz,
    )
    .toBe(zone);
  return meSchema.parse(await (await page.request.get("/api/me")).json());
}
