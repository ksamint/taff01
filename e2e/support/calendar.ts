import { expect, type Locator, type Page } from "@playwright/test";

/** ScheduleX slides each lane by a percentage of its own width. */
export async function waitForCalendarMotion(event: Locator) {
  await expect
    .poll(() =>
      event.evaluate((element) => {
        for (
          let node: Element | null = element;
          node;
          node = node.parentElement
        )
          if (
            node
              .getAnimations()
              .some(
                (animation) =>
                  Number.isFinite(
                    animation.effect?.getComputedTiming().iterations,
                  ) &&
                  (animation.pending || animation.playState === "running"),
              )
          )
            return false;
        return true;
      }),
    )
    .toBe(true);
}

/** Separate protocol calls can straddle frames and report a false overlap. */
export async function calendarLaneBoxes(human: Locator, agent: Locator) {
  const humanElement = await human.elementHandle();
  const agentElement = await agent.elementHandle();
  if (!humanElement || !agentElement)
    throw new Error("Missing calendar lane events");
  try {
    return await humanElement.evaluate((humanNode, agentNode) => {
      const box = (node: Element) => {
        const { x, y, width, height } = node.getBoundingClientRect();
        return { x, y, width, height };
      };
      return { human: box(humanNode), agent: box(agentNode) };
    }, agentElement);
  } finally {
    await Promise.all([humanElement.dispose(), agentElement.dispose()]);
  }
}

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
