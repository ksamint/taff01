import { type BrowserContext, expect, type Page } from "@playwright/test";

let cached:
  | {
      authUrl: string;
      email: string;
      cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
    }
  | undefined;

export async function demoSession(page: Page) {
  const authUrl = process.env.AUTH_URL;
  if (!authUrl) throw new Error("AUTH_URL is required");
  const email = process.env.DEMO_EMAIL ?? "alex@taff.local";
  if (cached?.authUrl === authUrl && cached.email === email) {
    await page.context().addCookies(cached.cookies);
    const me = await page.request.get("/api/me");
    expect(me.status()).toBe(200);
    await page.goto("/");
    await expect(page.getByTestId("today-heading")).toBeVisible({
      timeout: 15000,
    });
    return;
  }
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  await page.goto("/");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-continue").click();
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  const signedIn = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/auth/sign-in/email" &&
      response.request().method() === "POST",
  );
  await page.getByTestId("auth-submit").click();
  expect((await signedIn).status()).toBe(200);
  await expect(page.getByTestId("today-heading")).toBeVisible({
    timeout: 15000,
  });
  cached = { authUrl, email, cookies: await page.context().cookies(authUrl) };
}
