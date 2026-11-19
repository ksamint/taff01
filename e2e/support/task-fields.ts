import { expect, type Page } from "@playwright/test";

const controls = {
  text: "edit-title",
  owner: "edit-owner",
  due: "edit-date",
  priority: "edit-priority",
  project: "edit-project",
  labels: "edit-labels",
  status: "edit-status",
  worker: "detail-worker",
} as const;

export async function openTaskField(page: Page, field: keyof typeof controls) {
  const row = page.getByTestId(`task-field-${field}`);
  await expect(row).toBeEnabled();
  if (!(await row.isVisible()))
    await page.getByTestId("task-fields-more").click();
  await row.click();
  await expect(page.getByTestId(controls[field])).toBeVisible();
}

export async function closeFieldSheet(page: Page, controlId: string) {
  // A picker can be nested inside the task sheet; close only its nearest dialog.
  const control = page.getByTestId(controlId);
  const dialog = control.locator("xpath=ancestor::dialog[1]");
  await dialog.locator(":scope > .section-heading").getByRole("button").click();
  await expect(control).toHaveCount(0);
}

export async function closeTaskField(page: Page, field: keyof typeof controls) {
  await closeFieldSheet(page, controls[field]);
}

export async function openProjectFilters(page: Page) {
  await page.getByTestId("project-filters").click();
  await expect(page.getByTestId("project-select")).toBeVisible();
}

export async function openProjectView(page: Page, name: string) {
  const view = page.getByTestId(`project-view-${name}`);
  if (!(await view.isVisible()))
    await page.getByTestId("project-view-more").click();
  await view.click();
}
