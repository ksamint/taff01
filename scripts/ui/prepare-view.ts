import { expect, type Page } from "@playwright/test";

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
  const probe = probes[screen.replace(/^project-/, "")];
  if (!probe) return;
  await expect(page.locator(probe[0]).first()).toBeVisible();
  await expect(page.locator(probe[0]).first()).toHaveCSS("display", probe[1]);
}
