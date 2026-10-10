import { expect, type Page } from "@playwright/test";

export async function openCalendarTools(page: Page) {
  const summary = page.getByTestId("calendar-tools");
  const details = summary.locator("..");
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await summary.click();
  await expect(page.getByTestId("calendar-list")).toBeVisible();
}
