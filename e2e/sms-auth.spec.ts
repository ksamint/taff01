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
    page.getByLabel(messages[locale].accountIdentifier, { exact: true }),
  ).toBeVisible();
  // The account comes first; nothing else is asked yet.
  await expect(page.getByTestId("auth-password")).toHaveCount(0);
  // Without SMS a phone number goes on to the password and never offers a code.
  await page.getByTestId("auth-email").fill("13800138000");
  await page.getByTestId("auth-continue").click();
  await expect(page.getByTestId("auth-identity")).toHaveText("13800138000");
  await expect(page.getByTestId("auth-password")).toBeVisible();
  await expect(page.getByTestId("phone-auth-toggle")).toHaveCount(0);
  await expect(page.getByTestId("auth-submit")).toHaveText(
    messages[locale].signIn,
  );
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
  // The one sign-in field takes a username, mobile or email; a mobile number
  // continues to the texted code, sent only when asked.
  await expect(
    page.getByLabel(m.accountIdentifier, { exact: true }),
  ).toHaveAttribute("data-testid", "auth-email");
  await page.getByTestId("auth-email").fill("138 0013 8000");
  await page.getByTestId("auth-continue").click();
  await expect(page.getByTestId("auth-identity")).toHaveText("138 0013 8000");
  await expect(page.getByTestId("auth-password")).toHaveCount(0);
  expect(sends).toBe(0);
  await expect(page.getByTestId("sms-submit")).toBeFocused();
  await page.getByRole("button", { name: m.sms.send, exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(m.sms.sent);
  await expect(page.getByLabel(m.sms.code, { exact: true })).toBeFocused();
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
  await page.getByLabel(m.sms.code, { exact: true }).fill("12345");
  await page.getByRole("button", { name: m.sms.verify, exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: m.sms.title, exact: true })
      .getByRole("alert"),
  ).toHaveText(m.errors.invalid_input);
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
  await page.getByTestId("auth-email").fill("13800138000");
  await page.getByTestId("auth-continue").click();
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
  await page.getByTestId("phone-auth-toggle").click();
  await expect(page.getByTestId("auth-password")).toBeVisible();
  await page.getByTestId("auth-change").click();
  await expect(page.getByTestId("auth-email")).toHaveValue("13800138000");
});

for (const enabled of [true, false]) {
  test(`phone password signs in without requesting SMS (SMS ${enabled ? "on" : "off"})`, async ({
    page,
  }, info) => {
    const locale = info.project.name as TestLocale;
    const m = messages[locale];
    await setup(page, locale, enabled);
    let smsRequests = 0;
    let passwords = 0;
    const password = `local-${crypto.randomUUID()}`;
    await page.route("**/api/auth/phone-number/**", async (route) => {
      smsRequests++;
      await route.fulfill({ status: 503, json: { error: "sms_unavailable" } });
    });
    await page.route("**/api/auth/sign-in/phone-number", async (route) => {
      passwords++;
      const body = route.request().postDataJSON();
      expect(body.phoneNumber).toBe("+8613800138000");
      expect(Object.keys(body).sort()).toEqual(["password", "phoneNumber"]);
      if (body.password !== password) {
        await route.fulfill({
          status: 401,
          json: { error: "invalid_credentials" },
        });
        return;
      }
      const account = await page.request.post("/api/auth/sign-up/email", {
        headers: { Origin: process.env.AUTH_URL! },
        data: {
          name: "Local phone password fixture",
          email: `phone-password-${crypto.randomUUID()}@example.test`,
          password,
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
    await page.getByTestId("auth-email").fill("138 0013 8000");
    await page.getByTestId("auth-continue").click();
    if (enabled) {
      await expect(page.getByTestId("auth-password")).toHaveCount(0);
      await expect(page.getByTestId("phone-auth-toggle")).toHaveText(
        m.sms.usePassword,
      );
      await page.getByTestId("phone-auth-toggle").click();
      await expect(page.getByTestId("auth-password")).toBeVisible();
      await expect(page.getByTestId("phone-auth-toggle")).toHaveText(
        m.sms.useCode,
      );
      await page.getByTestId("phone-auth-toggle").click();
      await expect(page.getByTestId("auth-password")).toHaveCount(0);
      await expect(page.getByTestId("sms-submit")).toHaveText(m.sms.send);
      await page.getByTestId("phone-auth-toggle").click();
    } else await expect(page.getByTestId("phone-auth-toggle")).toHaveCount(0);
    await expect(page.getByTestId("auth-submit")).toHaveText(m.signIn);
    await page.getByTestId("auth-password").fill("incorrect-password");
    await page.getByTestId("auth-submit").click();
    await expect(
      page
        .getByRole("region", { name: m.signIn, exact: true })
        .getByRole("alert"),
    ).toHaveText(m.errors.auth);
    expect(passwords).toBe(1);
    expect(smsRequests).toBe(0);
    await page.getByTestId("auth-password").fill(password);
    await page.getByTestId("auth-submit").click();
    await expect(page.getByTestId("today-heading")).toHaveText(m.today);
    expect(passwords).toBe(2);
    expect(smsRequests).toBe(0);
  });
}
