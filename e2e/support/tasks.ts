import { expect, type Page } from "@playwright/test";

export async function openQuickAdd(page: Page) {
  await expect(page.getByTestId("open-quick")).toBeEnabled();
  await page.getByTestId("open-quick").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByTestId("quick-title")).toBeEnabled();
}
