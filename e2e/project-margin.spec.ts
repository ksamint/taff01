import { expect, test } from "@playwright/test";
import { meSchema, projectSchema } from "../packages/schemas/src/index";
import { messages, type TestLocale } from "./support/messages";

test.use({ serviceWorkers: "block" });

test("explains margin conflicts and shows signed and currency-free amounts", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: process.env.AUTH_URL! },
    data: {
      name: "Margin reader",
      email: `margin-${crypto.randomUUID()}@example.test`,
      password: process.env.DEMO_PASSWORD,
    },
  });
  expect(signup.status()).toBe(200);
  expect(
    (
      await page.request.patch("/api/profile", { data: { locale, tz: "UTC" } })
    ).status(),
  ).toBe(200);
  const {
    workspaces: [workspace],
  } = meSchema.parse(await (await page.request.get("/api/me")).json());
  const created = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    {
      data: { name: "Project margin" },
    },
  );
  expect(created.status()).toBe(201);
  const project = projectSchema.parse(await created.json());

  let mode: "mismatch" | "incomplete" | "signed" | "zero" = "mismatch";
  await page.route(`**/api/costs/projects/${project.id}/margin`, (route) => {
    switch (mode) {
      case "mismatch":
        return route.fulfill({
          status: 409,
          json: { error: "currency_mismatch" },
        });
      case "incomplete":
        return route.fulfill({
          status: 409,
          json: { error: "cost_incomplete" },
        });
      case "signed":
        return route.fulfill({
          json: {
            currency: "USD",
            paidMicros: 1_000_000,
            actualMicros: 1_000_001,
            marginMicros: -1,
          },
        });
      case "zero":
        return route.fulfill({
          json: {
            currency: null,
            paidMicros: 0,
            actualMicros: 0,
            marginMicros: 0,
          },
        });
    }
  });

  await page.goto(`/projects/${project.id}?view=timeline`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("timeline-finance-toggle").click();
  const margin = page.getByTestId("project-finance-margin");
  await expect(margin.getByRole("alert")).toHaveText(
    m.errors.currency_mismatch,
  );
  mode = "incomplete";
  await margin.getByRole("button", { name: m.retry }).click();
  await expect(margin.getByRole("alert")).toHaveText(m.errors.cost_incomplete);
  mode = "signed";
  await margin.getByRole("button", { name: m.retry }).click();
  await expect(margin).toHaveText(
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 6,
    }).format(-0.000001),
  );

  mode = "zero";
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByTestId("timeline-finance-toggle").click();
  await expect(margin).toHaveText("0");
});
