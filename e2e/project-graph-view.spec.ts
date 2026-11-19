import { devices, expect, test } from "@playwright/test";
import {
  issuedWorkspaceInviteSchema,
  projectSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";
import { verifyTestEmail } from "./support/email-verification";

test("one Graph destination switches existing modes for a guest on phone and desktop", async ({
  page,
  browser,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const admin = await freshAccount(page, locale);
  await verifyTestEmail(page, admin.user.id);
  const [workspace] = admin.workspaces;
  const project = projectSchema.parse(
    await (
      await page.request.post(`/api/projects?workspaceId=${workspace.id}`, {
        data: { name: "Graph access" },
      })
    ).json(),
  );
  const context = await browser.newContext({
    ...devices["Pixel 7"],
    baseURL: process.env.AUTH_URL,
    locale: locale === "en" ? "en-US" : locale,
  });
  try {
    const guest = await context.newPage();
    const me = await freshAccount(guest, locale);
    await verifyTestEmail(guest, me.user.id);
    const invite = issuedWorkspaceInviteSchema.parse(
      await (
        await page.request.post(`/api/workspaces/${workspace.id}/invites`, {
          data: { email: me.user.email, role: "guest" },
        })
      ).json(),
    );
    expect(
      (
        await guest.request.post("/api/workspace-invites/accept", {
          data: { token: invite.token },
        })
      ).status(),
    ).toBe(200);
    await guest.goto("/orgs");
    await guest.getByTestId(`workspace-${workspace.id}`).click();
    const path = `/projects/${project.id}`;
    for (const viewport of [
      devices["Pixel 7"].viewport,
      { width: 1440, height: 900 },
    ]) {
      await guest.setViewportSize(viewport);
      await guest.goto(path);
      const views = guest.getByRole("navigation", {
        name: m.projects.views,
        exact: true,
      });
      await views.getByTestId("project-view-more").click();
      const entry = views.getByRole("link", {
        name: m.projects.graphView,
        exact: true,
      });
      await expect(entry).toHaveCount(1);
      await expect(views.getByTestId("project-view-mind")).toHaveCount(0);
      await expect(views.getByTestId("project-view-sectors")).toHaveCount(0);
      await entry.click();
      await expect(guest).toHaveURL(`${path}?view=relations`);
      await expect(guest.getByTestId("relations-view")).toBeVisible();
      await expect(guest.getByTestId("view-export-open")).toHaveCount(0);

      const mind = guest.getByTestId("project-graph-mode-mind");
      await mind.click();
      await expect(mind).toHaveAttribute("aria-current", "page");
      await expect(guest).toHaveURL(`${path}?view=mind`);
      await expect(guest.getByTestId("mind-view")).toBeVisible();
      await expect(guest.getByTestId("view-export-open")).toHaveCount(0);
      await expect(guest.getByTestId("mind-new-node")).toHaveCount(0);
      await expect(guest.getByTestId("mind-new-source")).toHaveCount(0);
      await guest.reload();
      await expect(guest.getByTestId("mind-view")).toBeVisible();

      const relations = guest.getByTestId("project-graph-mode-relations");
      await relations.click();
      await expect(relations).toHaveAttribute("aria-current", "page");
      await expect(guest).toHaveURL(`${path}?view=relations`);
      await guest.reload();
      await expect(guest.getByTestId("relations-view")).toBeVisible();

      await guest.goto("/projects");
      await guest.getByTestId("project-view-more").click();
      await guest.getByTestId("project-view-sectors").click();
      await expect(guest).toHaveURL("/projects?view=sectors");
      await expect(guest.getByTestId("sector-view-hint")).toBeVisible();
    }
  } finally {
    await context.close();
  }
});
