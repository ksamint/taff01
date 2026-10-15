import { expect, type Page } from "@playwright/test";

export async function openCalendarTools(page: Page) {
  const summary = page.getByTestId("calendar-tools");
  const details = summary.locator("..");
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await summary.click();
  await expect(page.getByTestId("calendar-list")).toBeVisible();
}

/** API acknowledgement precedes cache reconciliation and re-enabling gestures. */
export async function waitForCalendarSave(page: Page) {
  await expect(page.getByTestId("calendar-undo")).toBeEnabled();
}

/** The React mode button changes before the SDK has replaced its old grid. */
export async function waitForCalendarView(
  page: Page,
  mode: "day" | "week" | "month-grid",
) {
  const native = page.locator(`.sx__calendar-wrapper.is-${mode}-view`);
  await expect(native).toHaveCount(1);
  if (mode === "month-grid") {
    await expect(native.locator(".sx__month-grid-wrapper")).toBeVisible();
  } else {
    await expect(native.locator(".sx__time-grid-day")).toHaveCount(
      mode === "day" ? 1 : 7,
    );
  }
  return native;
}
