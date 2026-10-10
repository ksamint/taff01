import { expect, type Page } from "@playwright/test";
import { meSchema } from "../../packages/schemas/src/index";
import { messages, type TestLocale } from "./messages";
import { selectLocale } from "./preferences";

export { messages, type TestLocale } from "./messages";
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
    await selectLocale(page, locale);
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
