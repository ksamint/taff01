import { expect, test } from "@playwright/test";
import { freshAccount } from "./support/account";
import { messages, type TestLocale } from "./support/messages";

test("no-agent OAuth guidance returns from organization management with the same request", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  await freshAccount(page, locale);
  const query = new URLSearchParams({
    response_type: "code",
    client_id: "guidance-client",
    redirect_uri: "https://client.example/callback",
    code_challenge: "A".repeat(43),
    code_challenge_method: "S256",
    state: `original-${locale}&state`,
    scope: "tasks:read",
  });
  const consentPath = `/oauth/authorize?${query}`;
  await page.route("**/api/oauth/consent?**", (route) =>
    route.fulfill({
      json: {
        client: {
          id: "guidance-client",
          name: "Guidance client",
          redirectHost: "client.example",
        },
        workspaces: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            name: "No-agent organization",
            agents: [],
            allowedScopes: ["tasks:read"],
          },
        ],
        scopes: ["tasks:read"],
      },
    }),
  );
  await page.goto(consentPath);
  await expect(page.getByTestId("oauth-no-agent")).toBeVisible();
  await page.getByTestId("oauth-manage-organizations").click();
  const back = page.getByTestId("oauth-return-consent");
  await expect(back).toHaveAttribute("href", consentPath);
  await expect(back).toHaveText(messages[locale].oauth.returnToConsent);
  await back.click();
  await expect(page).toHaveURL(`${process.env.AUTH_URL}${consentPath}`);
  await expect(page.getByTestId("oauth-no-agent")).toBeVisible();
});

test("desktop Me shows localized progress while a lazy panel chunk loads", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  await freshAccount(page, locale);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/me?tab=settings");
  await expect(page.getByTestId("me-tab-brief")).toBeVisible();
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let held = 0;
  await page.route("**/_next/static/chunks/**", async (route) => {
    if (route.request().resourceType() === "script") {
      held++;
      await ready;
    }
    await route.continue();
  });
  try {
    await page.getByTestId("me-tab-brief").click();
    await expect.poll(() => held).toBeGreaterThan(0);
    await expect(page.locator(".me-desk-panel").getByRole("status")).toHaveText(
      messages[locale].loading,
    );
  } finally {
    release();
  }
  await expect(page.getByTestId("brief-view")).toBeVisible();
});
