import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { selectLocale } from "./support/preferences";

// Reuse Lighthouse's approved axe dependency; no new browser/test dependency.
const projectRequire = createRequire(resolve("package.json"));
const axePath = createRequire(projectRequire.resolve("lighthouse")).resolve(
  "axe-core/axe.min.js",
);
const names = {
  en: "Full day- and multiple day events",
  "zh-CN": "全天和多天活动",
  "zh-HK": "全天和多天活動",
};
type Locale = keyof typeof names;

async function auditLabels(page: Page) {
  const result = await page.evaluate(async () => {
    const { axe } = window as unknown as {
      axe: {
        run(
          root: Document,
          options: { runOnly: { type: string; values: string[] } },
        ): Promise<{ violations: unknown[]; passes: { id: string }[] }>;
      };
    };
    return axe.run(document, {
      runOnly: { type: "rule", values: ["aria-prohibited-attr"] },
    });
  });
  expect(result.violations).toEqual([]);
  expect(result.passes.map((rule) => rule.id)).toContain(
    "aria-prohibited-attr",
  );
}

for (const desktop of [false, true]) {
  test(`calendar localized all-day groups survive view and period changes (${desktop ? "desktop" : "phone"})`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const locale = info.project.name as Locale;
    if (!process.env.DEMO_PASSWORD)
      throw new Error("DEMO_PASSWORD is required");
    await page.goto("/");
    await page
      .getByTestId("auth-email")
      .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
    await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
    await page.getByTestId("auth-submit").click();
    await expect(page.getByTestId("today-heading")).toBeVisible({
      timeout: 15000,
    });
    await selectLocale(page, locale);
    if (desktop) await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/calendar");
    await page.addScriptTag({ path: axePath });
    const grids = page.locator(
      '[data-testid="calendar-engine"] .sx__date-grid',
    );
    const checkGroups = async () => {
      await expect.poll(() => grids.count()).toBeGreaterThan(0);
      for (const grid of await grids.all()) {
        await expect(grid).toHaveAttribute("role", "group");
        await expect(grid).toHaveAccessibleName(names[locale]);
      }
      await auditLabels(page);
    };
    for (const mode of ["day", "week", "month-grid", "week", "day"]) {
      await page.getByTestId(`calendar-${mode}`).click();
      await expect(page.getByTestId(`calendar-${mode}`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      if (mode === "month-grid") {
        await expect(page.locator(".sx__month-grid-wrapper")).toBeVisible();
        await expect(grids).toHaveCount(0);
        await auditLabels(page);
      } else await checkGroups();
    }
    const day = page.locator("[data-time-grid-date]").first();
    const initialDate = await day.getAttribute("data-time-grid-date");
    expect(initialDate).not.toBeNull();
    await page.getByTestId("calendar-previous").click();
    await expect(day).not.toHaveAttribute("data-time-grid-date", initialDate!);
    await checkGroups();
    await page.getByTestId("calendar-next").click();
    await expect(day).toHaveAttribute("data-time-grid-date", initialDate!);
    await checkGroups();
    await page.goto("/me?tab=settings");
    await expect(page.getByTestId("locale-select")).toBeVisible();
    await page.goBack();
    await page.addScriptTag({ path: axePath });
    await checkGroups();
  });
}
