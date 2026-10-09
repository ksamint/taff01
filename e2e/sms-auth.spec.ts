import { expect, type Page, test } from "@playwright/test";
import { messages, type TestLocale } from "./support/account";

async function setup(page: Page, locale: TestLocale, enabled: boolean) {
  await page
    .context()
    .addCookies([
      { name: "taff-locale", value: locale, url: process.env.AUTH_URL! },
    ]);
  // Every phone route is intercepted: browser fixtures never send a real SMS.
  await page.route("**/api/auth/phone-number/**", (route) =>
    route.fulfill({ status: 503, json: { error: "sms_unavailable" } }),
  );
  await page.route("**/api/auth/methods", (route) =>
    route.fulfill({ json: { smsEnabled: enabled } }),
  );
}

test("unconfigured SMS keeps email login available", async ({ page }, info) => {
  const locale = info.project.name as TestLocale;
  await setup(page, locale, false);
  await page.goto("/");
  await expect(page.getByTestId("auth-email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: messages[locale].sms.title }),
  ).toHaveCount(0);
});

test("SMS validates input, limits resend and signs in only after verification", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  await page.clock.install();
  await setup(page, locale, true);
  let sends = 0;
  await page.route("**/api/auth/phone-number/send-otp", async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      phoneNumber: "+8613800138000",
    });
    sends++;
    await route.fulfill({ json: { status: true } });
  });
  await page.route("**/api/auth/phone-number/verify", async (route) => {
    const body = route.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual(["code", "phoneNumber"]);
    expect(body.phoneNumber).toBe("+8613800138000");
    if (body.code !== "123456") {
      await route.fulfill({ status: 400, json: { error: "sms_invalid_code" } });
      return;
    }
    if (!process.env.DEMO_PASSWORD)
      throw new Error("DEMO_PASSWORD is required");
    const account = await page.request.post("/api/auth/sign-up/email", {
      headers: { Origin: process.env.AUTH_URL! },
      data: {
        name: "SMS browser fixture",
        email: `sms-${crypto.randomUUID()}@example.test`,
        password: process.env.DEMO_PASSWORD,
      },
    });
    expect(account.status()).toBe(200);
    expect(
      (
        await page.request.patch("/api/profile", {
          headers: { Origin: process.env.AUTH_URL! },
          data: { locale, tz: "UTC" },
        })
      ).status(),
    ).toBe(200);
    await route.fulfill({ json: { status: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: m.sms.title }).click();
  await page.getByLabel(m.sms.phone, { exact: true }).fill("invalid");
  await page.getByRole("button", { name: m.sms.send, exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: m.sms.title, exact: true })
      .getByRole("alert"),
  ).toHaveText(m.errors.invalid_input);
  expect(sends).toBe(0);
  await page.getByLabel(m.sms.phone, { exact: true }).fill("138 0013 8000");
  await page.getByRole("button", { name: m.sms.send, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(m.sms.sent);
  await expect(page.getByTestId("sms-resend")).toBeDisabled();
  expect(sends).toBe(1);
  await page.getByLabel(m.sms.code, { exact: true }).fill("111111");
  await page.getByRole("button", { name: m.sms.verify, exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: m.sms.title, exact: true })
      .getByRole("alert"),
  ).toHaveText(m.sms.invalidCode);
  expect((await page.request.get("/api/me")).status()).toBe(401);
  await page.clock.fastForward(61_000);
  await expect(page.getByTestId("sms-resend")).toBeEnabled();
  await page.getByTestId("sms-resend").click();
  await expect(page.getByTestId("sms-resend")).toBeDisabled();
  await expect.poll(() => sends).toBe(2);
  await page.getByLabel(m.sms.code, { exact: true }).fill("123456");
  await page.getByRole("button", { name: m.sms.verify, exact: true }).click();
  await expect(page.getByTestId("today-heading")).toHaveText(m.today);
});

test("SMS respects server Retry-After and recovers from provider failure", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  await page.clock.install();
  await setup(page, locale, true);
  let calls = 0;
  await page.route("**/api/auth/phone-number/send-otp", async (route) => {
    calls++;
    await route.fulfill(
      calls === 1
        ? {
            status: 429,
            headers: { "Retry-After": "120" },
            json: { error: "rate_limited" },
          }
        : { status: 503, json: { error: "sms_unavailable" } },
    );
  });
  await page.goto("/");
  await page.getByRole("button", { name: m.sms.title }).click();
  await page.getByLabel(m.sms.phone, { exact: true }).fill("13800138000");
  const send = page.getByRole("button", { name: m.sms.send, exact: true });
  await send.click();
  await expect(
    page
      .getByRole("region", { name: m.sms.title, exact: true })
      .getByRole("alert"),
  ).toHaveText(m.sms.rateLimited);
  await expect(send).toBeDisabled();
  await page.clock.fastForward(61_000);
  await expect(send).toBeDisabled();
  expect(calls).toBe(1);
  await page.clock.fastForward(60_000);
  await expect(send).toBeEnabled();
  await send.click();
  await expect(
    page
      .getByRole("region", { name: m.sms.title, exact: true })
      .getByRole("alert"),
  ).toHaveText(m.sms.sendFailed);
  await expect(page.getByLabel(m.sms.code, { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: m.sms.emailInstead }).click();
  await expect(page.getByTestId("auth-email")).toBeVisible();
});
