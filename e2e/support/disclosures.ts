import { expect, type Locator, type Page } from "@playwright/test";

export async function openDisclosure(scope: Page | Locator, testId: string) {
  const details = scope.getByTestId(testId);
  await expect(details).toBeVisible();
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await details.locator(":scope > summary").click();
  await expect(details).toHaveAttribute("open", "");
}
