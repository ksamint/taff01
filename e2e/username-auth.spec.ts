import { expect, type Page, test } from "@playwright/test";
import { messages, type TestLocale } from "./support/account";

// Synthetic accounts only. Every SMS route is blocked even if a test server
// has the method enabled; these cases never send a real message.
async function setup(page: Page, locale: TestLocale) {
  await page
    .context()
    .addCookies([
      { name: "taff-locale", value: locale, url: process.env.AUTH_URL! },
    ]);
  await page.route("**/api/auth/phone-number/**", (route) =>
    route.fulfill({ status: 503, json: { error: "sms_unavailable" } }),
  );
  await page.goto("/");
  await expect(page.getByTestId("auth-email")).toBeVisible();
  await expect(page.getByLabel(messages[locale].emailOrUsername)).toBeVisible();
}

async function signOut(page: Page, locale: TestLocale) {
  await page
    .getByRole("button", { name: messages[locale].signOut, exact: true })
    .click();
  await expect(page.getByTestId("auth-submit")).toBeVisible();
}

function authResponse(page: Page, endpoint: string) {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/auth/${endpoint}` &&
      response.request().method() === "POST",
  );
}

test("optional username signup, username sign-in and email compatibility", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const username = `fixture_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const email = `username-${crypto.randomUUID()}@example.test`;
  const password = "Synthetic-username-test!";
  await setup(page, locale);
  await expect(page.getByTestId("auth-email")).toHaveAttribute("type", "text");
  await expect(page.getByTestId("auth-email")).toHaveAttribute(
    "autocomplete",
    "username",
  );
  await page.getByTestId("auth-toggle").click();
  await expect(page.getByTestId("auth-email")).toHaveAttribute("type", "email");
  await expect(page.getByLabel(m.usernameOptional)).toBeVisible();
  await expect(page.getByTestId("auth-password")).toHaveAttribute(
    "minlength",
    "8",
  );
  await page.locator("#auth-name").fill("Synthetic username teammate");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-username").fill(username);
  await page.getByTestId("auth-password").fill(password);
  const created = authResponse(page, "sign-up/email");
  await page.getByTestId("auth-submit").click();
  const signup = await created;
  expect(signup.status()).toBe(200);
  expect(signup.request().postDataJSON().username).toBe(username);
  await expect(page.getByTestId("today-heading")).toBeVisible();
  // Persist the test locale before checking localized authenticated controls.
  if (locale !== "en") {
    await expect(page.getByTestId("locale-select")).toBeEnabled();
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/profile" &&
        response.request().method() === "PATCH",
    );
    await page.getByTestId("locale-select").selectOption(locale);
    expect((await saved).status()).toBe(200);
  }
  await expect(page.getByTestId("today-heading")).toHaveText(m.today);
  await signOut(page, locale);
  await expect(page.getByTestId("auth-password")).toHaveAttribute(
    "minlength",
    "6",
  );
  await page.getByTestId("auth-email").fill(`  ${username}  `);
  await page.getByTestId("auth-password").fill(password);
  const signedIn = authResponse(page, "sign-in/username");
  await page.getByTestId("auth-submit").click();
  const usernameLogin = await signedIn;
  expect(usernameLogin.status()).toBe(200);
  expect(usernameLogin.request().postDataJSON()).toEqual({
    username,
    password,
  });
  await expect(page.getByTestId("today-heading")).toHaveText(m.today);
  await signOut(page, locale);
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  const emailLogin = authResponse(page, "sign-in/email");
  await page.getByTestId("auth-submit").click();
  expect((await emailLogin).status()).toBe(200);
  await expect(page.getByTestId("today-heading")).toHaveText(m.today);
});

test("signup validates username and eight-character password, omits blank username", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  await setup(page, locale);
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/auth/sign-up/email", async (route) => {
    submissions.push(route.request().postDataJSON());
    await route.continue();
  });
  await page.getByTestId("auth-toggle").click();
  await page.locator("#auth-name").fill("Synthetic optional username");
  await page
    .getByTestId("auth-email")
    .fill(`optional-${crypto.randomUUID()}@example.test`);
  await page.getByTestId("auth-password").fill("Synthetic-signup-test!");
  await page.getByTestId("auth-username").fill("invalid-name");
  await page.getByTestId("auth-submit").click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    m.errors.invalid_input,
  );
  expect(submissions).toEqual([]);
  await page.getByTestId("auth-username").fill("valid_name");
  await page.getByTestId("auth-password").fill("abcdef");
  await page.getByTestId("auth-submit").click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    m.errors.invalid_input,
  );
  expect(submissions).toEqual([]);
  await page.getByTestId("auth-username").fill("   ");
  await page.getByTestId("auth-password").fill("Synthetic-signup-test!");
  const accepted = authResponse(page, "sign-up/email");
  await page.getByTestId("auth-submit").click();
  expect((await accepted).status()).toBe(200);
  await expect(page.getByTestId("today-heading")).toBeVisible();
  expect(submissions).toHaveLength(1);
  expect(submissions[0]).not.toHaveProperty("username");
});

test("sign-in six-character passwords reach the selected endpoint with localized failures", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  await setup(page, locale);
  const requests: { endpoint: string; body: unknown }[] = [];
  await page.route("**/api/auth/sign-in/*", async (route) => {
    requests.push({
      endpoint: new URL(route.request().url()).pathname,
      body: route.request().postDataJSON(),
    });
    await route.fulfill({ status: 401, json: { error: "unauthorized" } });
  });
  await expect(page.locator("#password-hint")).toHaveText(m.signInPasswordHint);
  await page.getByTestId("auth-email").fill("invalid-name");
  await page.getByTestId("auth-password").fill("abcdef");
  await page.getByTestId("auth-submit").click();
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    m.errors.invalid_input,
  );
  expect(requests).toEqual([]);
  for (const identifier of ["synthetic.user", "synthetic@example.test"]) {
    await page.getByTestId("auth-email").fill(identifier);
    const endpoint = identifier.includes("@")
      ? "sign-in/email"
      : "sign-in/username";
    const rejected = authResponse(page, endpoint);
    await page.getByTestId("auth-submit").click();
    expect((await rejected).status()).toBe(401);
    await expect(page.locator("form").getByRole("alert")).toHaveText(
      m.errors.auth,
    );
    await expect(page.getByTestId("auth-submit")).toBeEnabled();
  }
  expect(requests).toEqual([
    {
      endpoint: "/api/auth/sign-in/username",
      body: { username: "synthetic.user", password: "abcdef" },
    },
    {
      endpoint: "/api/auth/sign-in/email",
      body: { email: "synthetic@example.test", password: "abcdef" },
    },
  ]);
});
