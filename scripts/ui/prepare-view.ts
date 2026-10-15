import { expect, type Page } from "@playwright/test";
import { briefSchema } from "../../packages/schemas/src/assistant";
import { timelineSchema } from "../../packages/schemas/src/plan";

/** Standalone browser contexts have no API baseURL. Resolve against the real
 * rendered page so both CLI captures and Playwright fixtures use its origin. */
export function captureRead(
  page: Pick<Page, "url" | "request">,
  endpoint: string,
) {
  return page.request.get(new URL(endpoint, page.url()).href);
}

/** Data can appear before a lazy area's stylesheet. Never bless that frame as
 * a visual reference: wait for a non-default computed style from its CSS. */
export async function prepareView(page: Page, screen: string) {
  const probes: Record<string, [selector: string, display: string]> = {
    companies: [".crm-list-row", "flex"],
    contacts: [".crm-list-row", "flex"],
    "company-detail": [".crm-detail-top", "flex"],
    "contact-detail": [".crm-detail-top", "flex"],
    stakeholders: [".stakeholders-client", "flex"],
    timeline: [".timeline-view", "flex"],
    relations: [".relations-view", "flex"],
    brief: [".brief-stats", "grid"],
    mind: [".mind-view", "flex"],
    home: [".landing-bar", "flex"],
  };
  const view = screen.replace(/^project-/, "");
  const probe = probes[view];
  if (!probe) return;
  await expect(page.locator(probe[0]).first()).toBeVisible();
  await expect(page.locator(probe[0]).first()).toHaveCSS("display", probe[1]);
  if (view === "home") {
    await expect(page.getByTestId("locale-select")).toBeEnabled();
    // Signed-out landing must not inherit the authenticated sidebar column.
    await expect
      .poll(() =>
        page
          .locator(".landing")
          .evaluate((element) =>
            Math.abs(element.getBoundingClientRect().width - window.innerWidth),
          ),
      )
      .toBeLessThanOrEqual(1);
  }
  if (view === "brief") {
    const response = await captureRead(page, "/api/brief?scope=all");
    expect(response.status()).toBe(200);
    expect(briefSchema.parse(await response.json()).today).toBe("2026-10-08");
    const date = await page.evaluate(() =>
      new Intl.DateTimeFormat(
        document.documentElement.lang || navigator.language,
        {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        },
      ).format(new Date("2026-10-08T00:00:00Z")),
    );
    await expect(page.locator(".brief-eyebrow")).toContainText(date);
  }
  if (view === "timeline") {
    const projectId = new URL(page.url()).pathname.match(
      /\/projects\/([0-9a-f-]{36})/i,
    )?.[1];
    expect(projectId).toBeTruthy();
    const response = await captureRead(
      page,
      `/api/projects/${projectId}/timeline`,
    );
    expect(response.status()).toBe(200);
    expect(timelineSchema.parse(await response.json()).today).toBe(
      "2026-10-08",
    );
    const markers = page.locator(".timeline-today");
    // The header and chart body intentionally draw separate aligned markers.
    await expect(markers).toHaveCount(2);
    await expect(markers.nth(0)).toHaveAttribute("x1", /^\d+(?:\.\d+)?$/);
    await expect(markers.nth(1)).toHaveAttribute(
      "x1",
      (await markers.nth(0).getAttribute("x1")) ?? "missing-marker",
    );
  }
}
