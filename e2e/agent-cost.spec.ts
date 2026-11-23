import { expect, test } from "@playwright/test";
import { projectSchema, taskSchema } from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";

test.use({ serviceWorkers: "block" });

test("shows localized USD agent costs on a task and its project", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const label = messages[locale].projectFinance.agentCost;
  const { workspaces } = await freshAccount(page, locale);
  const workspace = workspaces[0];
  const projectResponse = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: "Agent cost project" } },
  );
  expect(projectResponse.status()).toBe(201);
  const project = projectSchema.parse(await projectResponse.json());
  const taskResponse = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      projectId: project.id,
      title: "Agent cost task",
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = taskSchema.parse(await taskResponse.json());

  await page.route(`**/api/costs/tasks/${task.id}`, (route) =>
    route.fulfill({
      json: {
        costMicros: 1_250_000,
        runs: 2,
        failedRuns: 1,
        failedCostMicros: 250_000,
        durationMs: 3_000,
      },
    }),
  );
  await page.route(`**/api/costs/projects/${project.id}`, (route) =>
    route.fulfill({
      json: {
        costMicros: 9_375_000,
        runs: 4,
        failedRuns: 1,
        failedCostMicros: 250_000,
        durationMs: 6_000,
      },
    }),
  );
  const usd = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByTestId("task-detail-heading")).toHaveText(task.title);
  await expect(page.getByText(label, { exact: true })).toBeVisible();
  await expect(page.getByText(usd.format(1.25), { exact: true })).toBeVisible();

  await page.goto(`/projects/${project.id}?view=timeline`);
  await page.getByTestId("timeline-finance-toggle").click();
  const finance = page.getByTestId("project-finance");
  await expect(finance.getByText(label, { exact: true })).toBeVisible();
  await expect(
    finance.getByText(usd.format(9.375), { exact: true }),
  ).toBeVisible();
});
