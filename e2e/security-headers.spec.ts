import { expect, test } from "@playwright/test";
import { freshAccount, type TestLocale } from "./support/account";

test("security headers allow the signed-in app without CSP violations", async ({
  page,
}, info) => {
  const violations: string[] = [];
  await page.exposeFunction("reportCspViolation", (value: string) =>
    violations.push(value),
  );
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      void (
        window as unknown as {
          reportCspViolation: (value: string) => Promise<void>;
        }
      ).reportCspViolation(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });
  await freshAccount(page, info.project.name as TestLocale);
  for (const path of [
    "/",
    "/projects",
    "/calendar",
    "/projects?view=timeline",
    "/me",
  ]) {
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    const headers = response!.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-powered-by"]).toBeUndefined();
    expect(headers["content-security-policy"]).toContain(
      "frame-ancestors 'none'",
    );
    await expect(page.locator("main").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  expect(violations).toEqual([]);
});
