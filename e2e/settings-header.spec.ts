import { expect, test } from "@playwright/test";
import { memberSchema } from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";

test("phone settings routes share one bordered back header and an inset body", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const {
    workspaces: [workspace],
  } = await freshAccount(page, locale);
  const added = await page.request.post(
    `/api/workspaces/${workspace.id}/members`,
    { data: { name: "Settings header agent", kind: "agent" } },
  );
  expect(added.status()).toBe(201);
  const agent = memberSchema.parse(await added.json());

  const routes = [
    [
      "/me/notifications",
      "/me",
      m.agentProfile.back,
      ".notification-preference > span",
    ],
    ["/me/mcp", "/me", m.mcp.back, ".mcp-copy-row"],
    ["/orgs", "/me", m.mcp.back, ".org-grid"],
    ["/orgs/access", "/orgs", m.mcp.back, ".access-tabs"],
    ["/orgs/audit", "/orgs", m.mcp.back, ".audit-hint"],
    ["/orgs/summaries", "/orgs", m.mcp.back, ".summary-inline-form"],
    ["/summaries", "/me", m.mcp.back, ".empty-state"],
    ["/digests", "/me/notifications", m.notifications.title, ".empty-state"],
    [
      `/agents/${agent.id}`,
      "/me",
      m.agentProfile.back,
      ".agent-profile-overview",
    ],
  ] as const;
  for (const [route, back, label, body] of routes) {
    await test.step(route, async () => {
      await page.goto(route);
      const header = page.locator("main.content .settings-back-header");
      await expect(header).toHaveCount(1);
      const link = header.getByRole("link", { name: label, exact: true });
      await expect(link).toHaveAttribute("href", back);
      await expect(header).toHaveCSS("border-bottom-style", "solid");
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      const visibleBody = page.locator(body).first();
      await expect(visibleBody).toBeVisible();
      const box = await visibleBody.boundingBox();
      const viewport = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(box!.x).toBeGreaterThanOrEqual(16);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - 16);
      expect(viewport.scrollWidth).toBe(viewport.width);
    });
  }
});
