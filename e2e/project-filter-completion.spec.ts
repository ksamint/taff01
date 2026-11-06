import { expect, test } from "@playwright/test";
import { freshAccount } from "./support/account";
import type { TestLocale } from "./support/messages";
import { openProjectFilters } from "./support/task-fields";

test("phone project filters retain the administrator's new-project control", async ({
  page,
}, info) => {
  await freshAccount(page, info.project.name as TestLocale);
  await page.goto("/projects");
  await openProjectFilters(page);
  await page.getByTestId("project-filter").selectOption("mine");
  await expect(page.getByTestId("new-project")).toBeVisible();
  await page.getByTestId("new-project").click();
  await expect(page.getByTestId("project-name")).toBeVisible();
});
