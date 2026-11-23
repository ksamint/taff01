import { expect, test } from "@playwright/test";
import {
  meSchema,
  type ProjectBudget,
  projectSchema,
} from "../packages/schemas/src/index";
import { messages, type TestLocale } from "./support/messages";

test.use({ serviceWorkers: "block" });

test("shows actuals in each currency and saves a budget to the micro", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: process.env.AUTH_URL! },
    data: {
      name: "Budget reader",
      email: `budget-${crypto.randomUUID()}@example.test`,
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
      data: { name: "Project budget" },
    },
  );
  expect(created.status()).toBe(201);
  const project = projectSchema.parse(await created.json());

  const endpoint = `**/api/costs/projects/${project.id}`;
  const byCurrency = [
    {
      currency: "USD",
      agentMicros: 12_250_000,
      timeMicros: 0,
      totalMicros: 12_250_000,
    },
    {
      currency: "HKD",
      agentMicros: 0,
      timeMicros: 2_500_000,
      totalMicros: 2_500_000,
    },
  ];
  let budget: ProjectBudget | null = null;
  await page.route(`${endpoint}/actual`, (route) =>
    route.fulfill({ json: { budget, byCurrency, unratedMinutes: 45 } }),
  );
  await page.route(`${endpoint}/budget`, (route) => {
    expect(route.request().method()).toBe("POST");
    budget = { amountMicros: Number.MAX_SAFE_INTEGER, currency: "USD" };
    expect(route.request().postDataJSON()).toEqual(budget);
    return route.fulfill({ json: budget });
  });

  await page.goto(`/projects/${project.id}?view=timeline`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("timeline-finance-toggle").click();
  const summary = page.getByRole("region", {
    name: m.projectFinance.budgetActual,
  });
  await expect(summary.getByText(m.projectFinance.noBudget)).toBeVisible();
  for (const row of byCurrency) {
    await expect(
      summary.getByText(
        m.projectFinance.actualInCurrency.replace("{{currency}}", row.currency),
        { exact: true },
      ),
    ).toBeVisible();
  }
  await expect(summary.getByRole("status")).toHaveText(
    m.projectFinance.unratedMinutes.replace("{{minutes}}", "45"),
  );

  await summary
    .getByRole("button", { name: m.projectFinance.editBudget })
    .click();
  const edit = page.getByRole("dialog", { name: m.projectFinance.editBudget });
  const amount = "9007199254.740991";
  await edit.getByLabel(m.projectFinance.budgetAmount).fill(amount);
  await edit.getByLabel(m.timeTracking.currency).fill("USD");
  await edit.getByRole("button", { name: m.projectFinance.save }).click();
  await expect(edit).toHaveCount(0);
  await expect(summary.getByText(m.projectFinance.noBudget)).toHaveCount(0);
  await expect(summary.getByText(/\.740991$/)).toBeVisible();
  await summary
    .getByRole("button", { name: m.projectFinance.editBudget })
    .click();
  await expect(edit.getByLabel(m.projectFinance.budgetAmount)).toHaveValue(
    amount,
  );
});
