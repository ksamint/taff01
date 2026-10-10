import { expect, type Page } from "@playwright/test";
import { closeFieldSheet } from "./task-fields";

const quickControls = {
  owner: "quick-owner",
  worker: "quick-worker",
  due: "quick-date",
  project: "quick-project",
  priority: "quick-priority",
  labels: "quick-labels",
} as const;

export async function openQuickAdd(page: Page) {
  await expect(page.getByTestId("open-quick")).toBeEnabled();
  await page.getByTestId("open-quick").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("quick-title")).toBeEnabled();
}

export async function openQuickField(
  page: Page,
  field: keyof typeof quickControls,
) {
  await expect(page.getByTestId(`quick-field-${field}`)).toBeEnabled();
  await page.getByTestId(`quick-field-${field}`).click();
  await expect(page.getByTestId(quickControls[field])).toBeVisible();
}

export async function closeQuickField(
  page: Page,
  field: keyof typeof quickControls,
) {
  await closeFieldSheet(page, quickControls[field]);
  await expect(page.getByTestId("quick-title")).toBeEnabled();
}
